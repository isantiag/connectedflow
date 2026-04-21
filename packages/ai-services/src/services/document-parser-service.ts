/**
 * Document Parser Service — manages the AI extraction pipeline.
 *
 * Coordinates: upload → parse (via Python service) → review → confirm.
 * The actual LLM extraction runs in the Python AI service; this TypeScript
 * service manages pipeline state and stores results.
 */

import { type Knex } from 'knex';
import { type ParseJobId } from '@connectedflow/shared-types';
import {
  ParseJobRepository,
  type ParseJobRow,
  type ParseJobStatus,
} from '../repositories/parse-job-repository.js';
import {
  ExtractedSignalRepository,
  type ExtractedSignalRow,
} from '../repositories/extracted-signal-repository.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentMetadata {
  fileName: string;
  mimeType: string;
  projectId: string;
}

export interface ParseJob {
  id: string;
  documentId: string;
  status: ParseJobStatus;
  createdAt: Date;
  completedAt: Date | null;
}

export interface ParseJobStatusResult {
  id: string;
  status: ParseJobStatus;
  createdAt: Date;
  completedAt: Date | null;
}

export interface ExtractedSignal {
  id: string;
  data: Record<string, unknown>;
  confidence: number;
  sourcePage: number | null;
  sourceTable: number | null;
  sourceRow: number | null;
  needsReview: boolean;
}

export interface ExtractionResult {
  jobId: string;
  signals: ExtractedSignal[];
  statistics: ExtractionStatistics;
}

export interface ExtractionStatistics {
  totalSignalsExtracted: number;
  avgConfidence: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
}

export interface ParsingReport {
  jobId: string;
  totalTablesFound: number;
  totalSignalsExtracted: number;
  avgConfidence: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
  unmappedFieldCount: number;
}

export interface ConfirmExtractionResult {
  createdSignals: number;
  errors: Array<{ extractionId: string; error: string }>;
}

/**
 * Abstraction over the core SignalService for creating signals from confirmed extractions.
 * In production this calls SignalService.bulkImport; for testing it can be mocked.
 */
export interface SignalCreator {
  createFromExtraction(data: Record<string, unknown>): Promise<void>;
}

/** Abstraction over the object store (MinIO / S3-compatible). */
export interface ObjectStore {
  putObject(bucket: string, key: string, data: Buffer, contentType: string): Promise<void>;
}

/**
 * Abstraction over the Python AI extraction service.
 * In production this makes REST calls; for now it can be mocked.
 */
export interface PythonExtractionClient {
  /** Kick off extraction and return extracted signals. */
  extract(documentId: string, objectKey: string): Promise<{
    signals: Array<{
      data: Record<string, unknown>;
      confidence: number;
      sourcePage: number | null;
      sourceTable: number | null;
      sourceRow: number | null;
    }>;
    tablesFound: number;
  }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const CONFIDENCE_THRESHOLD = 0.8;
const DOCUMENT_BUCKET = 'icd-documents';

export class DocumentParserService {
  private readonly parseJobRepo: ParseJobRepository;
  private readonly extractedSignalRepo: ExtractedSignalRepository;
  private readonly objectStore: ObjectStore;
  private readonly pythonClient: PythonExtractionClient;
  private readonly signalCreator?: SignalCreator;

  constructor(deps: {
    knex: Knex;
    objectStore: ObjectStore;
    pythonClient: PythonExtractionClient;
    signalCreator?: SignalCreator;
  }) {
    this.parseJobRepo = new ParseJobRepository(deps.knex);
    this.extractedSignalRepo = new ExtractedSignalRepository(deps.knex);
    this.objectStore = deps.objectStore;
    this.pythonClient = deps.pythonClient;
    this.signalCreator = deps.signalCreator;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Upload a document to the object store and create a parse job in 'queued' state.
   */
  async uploadDocument(
    fileBuffer: Buffer,
    metadata: DocumentMetadata,
  ): Promise<ParseJob> {
    const objectKey = `${metadata.projectId}/${Date.now()}-${metadata.fileName}`;

    // Store document in object store
    await this.objectStore.putObject(
      DOCUMENT_BUCKET,
      objectKey,
      fileBuffer,
      metadata.mimeType,
    );

    // Create parse job record
    const row = await this.parseJobRepo.insert({
      document_id: objectKey,
      status: 'queued',
      total_tables_found: 0,
      total_signals_extracted: 0,
      avg_confidence: 0,
      high_confidence_count: 0,
      low_confidence_count: 0,
      unmapped_field_count: 0,
    });

    return toParseJob(row);
  }

  /**
   * Return the current status of a parse job.
   */
  async getParseJobStatus(jobId: ParseJobId | string): Promise<ParseJobStatusResult> {
    const row = await this.parseJobRepo.findById(jobId as string);
    if (!row) throw new Error(`Parse job not found: ${jobId}`);
    return {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  }

  /**
   * Return extraction results for a completed parse job.
   */
  async getExtractionResults(jobId: ParseJobId | string): Promise<ExtractionResult> {
    const job = await this.parseJobRepo.findById(jobId as string);
    if (!job) throw new Error(`Parse job not found: ${jobId}`);

    const rows = await this.extractedSignalRepo.findByJobId(jobId as string);
    const signals = rows.map(toExtractedSignal);

    return {
      jobId: job.id,
      signals,
      statistics: {
        totalSignalsExtracted: job.total_signals_extracted,
        avgConfidence: job.avg_confidence,
        highConfidenceCount: job.high_confidence_count,
        lowConfidenceCount: job.low_confidence_count,
      },
    };
  }

  /**
   * Trigger extraction processing for a queued job.
   * Transitions: queued → processing → review_pending (or failed).
   */
  async processJob(jobId: string): Promise<void> {
    const job = await this.parseJobRepo.findById(jobId);
    if (!job) throw new Error(`Parse job not found: ${jobId}`);

    // queued → processing
    await this.parseJobRepo.transition(jobId, 'processing');

    try {
      const result = await this.pythonClient.extract(job.document_id, job.document_id);

      // Store extracted signals
      const signalRows: Array<Partial<ExtractedSignalRow>> = result.signals.map((s) => ({
        parse_job_id: jobId,
        data: s.data,
        confidence: s.confidence,
        source_page: s.sourcePage,
        source_table: s.sourceTable,
        source_row: s.sourceRow,
        needs_review: s.confidence < CONFIDENCE_THRESHOLD,
      }));

      if (signalRows.length > 0) {
        await this.extractedSignalRepo.insertMany(signalRows);
      }

      // Compute statistics
      const confidences = result.signals.map((s) => s.confidence);
      const avg = confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;
      const highCount = confidences.filter((c) => c >= CONFIDENCE_THRESHOLD).length;
      const lowCount = confidences.filter((c) => c < CONFIDENCE_THRESHOLD).length;

      await this.parseJobRepo.update(jobId, {
        total_tables_found: result.tablesFound,
        total_signals_extracted: result.signals.length,
        avg_confidence: avg,
        high_confidence_count: highCount,
        low_confidence_count: lowCount,
      });

      // processing → review_pending
      await this.parseJobRepo.transition(jobId, 'review_pending');
    } catch (error) {
      // processing → failed
      await this.parseJobRepo.transition(jobId, 'failed');
      throw error;
    }
  }

  /**
   * Confirm reviewed extractions and create signals from them.
   * Transitions the job from review_pending → confirmed.
   */
  async confirmExtraction(
    jobId: string,
    reviewedExtractionIds: string[],
  ): Promise<ConfirmExtractionResult> {
    const job = await this.parseJobRepo.findById(jobId);
    if (!job) throw new Error(`Parse job not found: ${jobId}`);

    if (!this.signalCreator) {
      throw new Error('SignalCreator not configured');
    }

    // Fetch all extracted signals for this job
    const allExtractions = await this.extractedSignalRepo.findByJobId(jobId);

    // Filter to only the confirmed extraction IDs
    const confirmedSet = new Set(reviewedExtractionIds);
    const confirmedExtractions = allExtractions.filter((e) => confirmedSet.has(e.id));

    let createdSignals = 0;
    const errors: Array<{ extractionId: string; error: string }> = [];

    for (const extraction of confirmedExtractions) {
      try {
        await this.signalCreator.createFromExtraction(extraction.data);
        createdSignals++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ extractionId: extraction.id, error: message });
      }
    }

    // Transition job to confirmed
    await this.parseJobRepo.transition(jobId, 'confirmed');

    return { createdSignals, errors };
  }

  /**
   * Return a parsing report with accurate statistics derived from the actual extraction data.
   */
  async getParsingReport(jobId: string): Promise<ParsingReport> {
    const job = await this.parseJobRepo.findById(jobId);
    if (!job) throw new Error(`Parse job not found: ${jobId}`);

    // Recompute statistics from actual extracted signals for accuracy
    const extractions = await this.extractedSignalRepo.findByJobId(jobId);

    const totalSignalsExtracted = extractions.length;
    const confidences = extractions.map((e) => e.confidence);
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;
    const highConfidenceCount = confidences.filter((c) => c >= CONFIDENCE_THRESHOLD).length;
    const lowConfidenceCount = confidences.filter((c) => c < CONFIDENCE_THRESHOLD).length;

    return {
      jobId: job.id,
      totalTablesFound: job.total_tables_found,
      totalSignalsExtracted,
      avgConfidence,
      highConfidenceCount,
      lowConfidenceCount,
      unmappedFieldCount: job.unmapped_field_count,
    };
  }
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toParseJob(row: ParseJobRow): ParseJob {
  return {
    id: row.id,
    documentId: row.document_id,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function toExtractedSignal(row: ExtractedSignalRow): ExtractedSignal {
  return {
    id: row.id,
    data: row.data,
    confidence: row.confidence,
    sourcePage: row.source_page,
    sourceTable: row.source_table,
    sourceRow: row.source_row,
    needsReview: row.needs_review,
  };
}
