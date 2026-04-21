import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DocumentParserService,
  type ObjectStore,
  type PythonExtractionClient,
  type SignalCreator,
} from './document-parser-service.js';
import { ParseJobRepository } from '../repositories/parse-job-repository.js';
import { ExtractedSignalRepository } from '../repositories/extracted-signal-repository.js';

// ---------------------------------------------------------------------------
// Helpers — lightweight in-memory fakes for Knex-backed repositories
// ---------------------------------------------------------------------------

function createMockKnex() {
  // We don't call the real DB; we mock the repositories directly.
  return {} as any;
}

function createMockObjectStore(): ObjectStore {
  return { putObject: vi.fn().mockResolvedValue(undefined) };
}

function createMockPythonClient(
  response?: Awaited<ReturnType<PythonExtractionClient['extract']>>,
): PythonExtractionClient {
  return {
    extract: vi.fn().mockResolvedValue(
      response ?? { signals: [], tablesFound: 0 },
    ),
  };
}

// We'll spy on repository methods to avoid needing a real DB.
function spyOnRepos(service: DocumentParserService) {
  const parseJobRepo = (service as any).parseJobRepo as ParseJobRepository;
  const extractedSignalRepo = (service as any).extractedSignalRepo as ExtractedSignalRepository;
  return { parseJobRepo, extractedSignalRepo };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DocumentParserService', () => {
  let objectStore: ObjectStore;
  let pythonClient: PythonExtractionClient;
  let service: DocumentParserService;

  beforeEach(() => {
    objectStore = createMockObjectStore();
    pythonClient = createMockPythonClient();
    service = new DocumentParserService({
      knex: createMockKnex(),
      objectStore,
      pythonClient,
    });
  });

  describe('uploadDocument', () => {
    it('stores document in object store and creates a queued parse job', async () => {
      const { parseJobRepo } = spyOnRepos(service);

      const fakeRow = {
        id: 'job-1',
        document_id: 'proj/file.pdf',
        status: 'queued' as const,
        total_tables_found: 0,
        total_signals_extracted: 0,
        avg_confidence: 0,
        high_confidence_count: 0,
        low_confidence_count: 0,
        unmapped_field_count: 0,
        created_at: new Date(),
        completed_at: null,
      };

      vi.spyOn(parseJobRepo, 'insert').mockResolvedValue(fakeRow);

      const result = await service.uploadDocument(Buffer.from('pdf-data'), {
        fileName: 'icd-spec.pdf',
        mimeType: 'application/pdf',
        projectId: 'proj-1',
      });

      expect(objectStore.putObject).toHaveBeenCalledOnce();
      expect(parseJobRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'queued' }),
      );
      expect(result.status).toBe('queued');
      expect(result.id).toBe('job-1');
    });
  });

  describe('getParseJobStatus', () => {
    it('returns the current status of a parse job', async () => {
      const { parseJobRepo } = spyOnRepos(service);

      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue({
        id: 'job-1',
        document_id: 'doc-key',
        status: 'processing',
        total_tables_found: 0,
        total_signals_extracted: 0,
        avg_confidence: 0,
        high_confidence_count: 0,
        low_confidence_count: 0,
        unmapped_field_count: 0,
        created_at: new Date('2024-01-01'),
        completed_at: null,
      });

      const status = await service.getParseJobStatus('job-1');
      expect(status.status).toBe('processing');
      expect(status.id).toBe('job-1');
    });

    it('throws when job not found', async () => {
      const { parseJobRepo } = spyOnRepos(service);
      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue(undefined);

      await expect(service.getParseJobStatus('missing')).rejects.toThrow(
        'Parse job not found',
      );
    });
  });

  describe('getExtractionResults', () => {
    it('returns extracted signals and statistics', async () => {
      const { parseJobRepo, extractedSignalRepo } = spyOnRepos(service);

      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue({
        id: 'job-1',
        document_id: 'doc-key',
        status: 'review_pending',
        total_tables_found: 2,
        total_signals_extracted: 3,
        avg_confidence: 0.85,
        high_confidence_count: 2,
        low_confidence_count: 1,
        unmapped_field_count: 0,
        created_at: new Date(),
        completed_at: null,
      });

      vi.spyOn(extractedSignalRepo, 'findByJobId').mockResolvedValue([
        {
          id: 'sig-1',
          parse_job_id: 'job-1',
          data: { name: 'AIRSPEED' },
          confidence: 0.95,
          source_page: 1,
          source_table: 0,
          source_row: 0,
          needs_review: false,
          created_at: new Date(),
        },
        {
          id: 'sig-2',
          parse_job_id: 'job-1',
          data: { name: 'ALTITUDE' },
          confidence: 0.6,
          source_page: 1,
          source_table: 0,
          source_row: 1,
          needs_review: true,
          created_at: new Date(),
        },
      ]);

      const result = await service.getExtractionResults('job-1');

      expect(result.signals).toHaveLength(2);
      expect(result.signals[0].confidence).toBe(0.95);
      expect(result.signals[0].needsReview).toBe(false);
      expect(result.signals[1].needsReview).toBe(true);
      expect(result.statistics.totalSignalsExtracted).toBe(3);
      expect(result.statistics.avgConfidence).toBe(0.85);
    });
  });

  describe('processJob', () => {
    it('transitions queued → processing → review_pending on success', async () => {
      const { parseJobRepo, extractedSignalRepo } = spyOnRepos(service);

      const jobRow = {
        id: 'job-1',
        document_id: 'doc-key',
        status: 'queued' as const,
        total_tables_found: 0,
        total_signals_extracted: 0,
        avg_confidence: 0,
        high_confidence_count: 0,
        low_confidence_count: 0,
        unmapped_field_count: 0,
        created_at: new Date(),
        completed_at: null,
      };

      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue(jobRow);

      // Track transition calls
      const transitionSpy = vi.spyOn(parseJobRepo, 'transition').mockImplementation(
        async (_id, newStatus) => ({ ...jobRow, status: newStatus }),
      );
      vi.spyOn(parseJobRepo, 'update').mockResolvedValue({ ...jobRow });
      vi.spyOn(extractedSignalRepo, 'insertMany').mockResolvedValue([]);

      (pythonClient.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
        signals: [
          { data: { name: 'SIG1' }, confidence: 0.9, sourcePage: 1, sourceTable: 0, sourceRow: 0 },
        ],
        tablesFound: 1,
      });

      await service.processJob('job-1');

      expect(transitionSpy).toHaveBeenCalledWith('job-1', 'processing');
      expect(transitionSpy).toHaveBeenCalledWith('job-1', 'review_pending');
      expect(pythonClient.extract).toHaveBeenCalledOnce();
      expect(extractedSignalRepo.insertMany).toHaveBeenCalledOnce();
    });

    it('transitions to failed when python extraction throws', async () => {
      const { parseJobRepo } = spyOnRepos(service);

      const jobRow = {
        id: 'job-1',
        document_id: 'doc-key',
        status: 'queued' as const,
        total_tables_found: 0,
        total_signals_extracted: 0,
        avg_confidence: 0,
        high_confidence_count: 0,
        low_confidence_count: 0,
        unmapped_field_count: 0,
        created_at: new Date(),
        completed_at: null,
      };

      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue(jobRow);
      vi.spyOn(parseJobRepo, 'transition').mockImplementation(
        async (_id, newStatus) => ({ ...jobRow, status: newStatus }),
      );

      (pythonClient.extract as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Python service unavailable'),
      );

      await expect(service.processJob('job-1')).rejects.toThrow(
        'Python service unavailable',
      );

      expect(parseJobRepo.transition).toHaveBeenCalledWith('job-1', 'failed');
    });

    it('flags low-confidence signals with needsReview', async () => {
      const { parseJobRepo, extractedSignalRepo } = spyOnRepos(service);

      const jobRow = {
        id: 'job-1',
        document_id: 'doc-key',
        status: 'queued' as const,
        total_tables_found: 0,
        total_signals_extracted: 0,
        avg_confidence: 0,
        high_confidence_count: 0,
        low_confidence_count: 0,
        unmapped_field_count: 0,
        created_at: new Date(),
        completed_at: null,
      };

      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue(jobRow);
      vi.spyOn(parseJobRepo, 'transition').mockImplementation(
        async (_id, newStatus) => ({ ...jobRow, status: newStatus }),
      );
      vi.spyOn(parseJobRepo, 'update').mockResolvedValue({ ...jobRow });

      const insertManySpy = vi.spyOn(extractedSignalRepo, 'insertMany').mockResolvedValue([]);

      (pythonClient.extract as ReturnType<typeof vi.fn>).mockResolvedValue({
        signals: [
          { data: { name: 'HIGH' }, confidence: 0.95, sourcePage: 1, sourceTable: 0, sourceRow: 0 },
          { data: { name: 'LOW' }, confidence: 0.5, sourcePage: 1, sourceTable: 0, sourceRow: 1 },
        ],
        tablesFound: 1,
      });

      await service.processJob('job-1');

      const insertedRows = insertManySpy.mock.calls[0][0];
      expect(insertedRows).toHaveLength(2);
      expect(insertedRows[0].needs_review).toBe(false); // 0.95 >= 0.8
      expect(insertedRows[1].needs_review).toBe(true);  // 0.5 < 0.8
    });
  });

  describe('confirmExtraction', () => {
    it('creates signals for confirmed extractions and transitions to confirmed', async () => {
      const signalCreator: SignalCreator = {
        createFromExtraction: vi.fn().mockResolvedValue(undefined),
      };

      const svc = new DocumentParserService({
        knex: createMockKnex(),
        objectStore: createMockObjectStore(),
        pythonClient: createMockPythonClient(),
        signalCreator,
      });

      const { parseJobRepo, extractedSignalRepo } = spyOnRepos(svc);

      const jobRow = {
        id: 'job-1',
        document_id: 'doc-key',
        status: 'review_pending' as const,
        total_tables_found: 1,
        total_signals_extracted: 3,
        avg_confidence: 0.85,
        high_confidence_count: 2,
        low_confidence_count: 1,
        unmapped_field_count: 0,
        created_at: new Date(),
        completed_at: null,
      };

      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue(jobRow);
      vi.spyOn(parseJobRepo, 'transition').mockImplementation(
        async (_id, newStatus) => ({ ...jobRow, status: newStatus }),
      );
      vi.spyOn(extractedSignalRepo, 'findByJobId').mockResolvedValue([
        { id: 'ext-1', parse_job_id: 'job-1', data: { name: 'SIG1' }, confidence: 0.95, source_page: 1, source_table: 0, source_row: 0, needs_review: false, created_at: new Date() },
        { id: 'ext-2', parse_job_id: 'job-1', data: { name: 'SIG2' }, confidence: 0.9, source_page: 1, source_table: 0, source_row: 1, needs_review: false, created_at: new Date() },
        { id: 'ext-3', parse_job_id: 'job-1', data: { name: 'SIG3' }, confidence: 0.5, source_page: 1, source_table: 0, source_row: 2, needs_review: true, created_at: new Date() },
      ]);

      const result = await svc.confirmExtraction('job-1', ['ext-1', 'ext-3']);

      expect(result.createdSignals).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(signalCreator.createFromExtraction).toHaveBeenCalledTimes(2);
      expect(signalCreator.createFromExtraction).toHaveBeenCalledWith({ name: 'SIG1' });
      expect(signalCreator.createFromExtraction).toHaveBeenCalledWith({ name: 'SIG3' });
      expect(parseJobRepo.transition).toHaveBeenCalledWith('job-1', 'confirmed');
    });

    it('reports errors for individual extraction failures without aborting', async () => {
      const signalCreator: SignalCreator = {
        createFromExtraction: vi.fn()
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(new Error('Validation failed')),
      };

      const svc = new DocumentParserService({
        knex: createMockKnex(),
        objectStore: createMockObjectStore(),
        pythonClient: createMockPythonClient(),
        signalCreator,
      });

      const { parseJobRepo, extractedSignalRepo } = spyOnRepos(svc);

      const jobRow = {
        id: 'job-1',
        document_id: 'doc-key',
        status: 'review_pending' as const,
        total_tables_found: 1,
        total_signals_extracted: 2,
        avg_confidence: 0.9,
        high_confidence_count: 2,
        low_confidence_count: 0,
        unmapped_field_count: 0,
        created_at: new Date(),
        completed_at: null,
      };

      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue(jobRow);
      vi.spyOn(parseJobRepo, 'transition').mockImplementation(
        async (_id, newStatus) => ({ ...jobRow, status: newStatus }),
      );
      vi.spyOn(extractedSignalRepo, 'findByJobId').mockResolvedValue([
        { id: 'ext-1', parse_job_id: 'job-1', data: { name: 'OK' }, confidence: 0.9, source_page: 1, source_table: 0, source_row: 0, needs_review: false, created_at: new Date() },
        { id: 'ext-2', parse_job_id: 'job-1', data: { name: 'BAD' }, confidence: 0.85, source_page: 1, source_table: 0, source_row: 1, needs_review: false, created_at: new Date() },
      ]);

      const result = await svc.confirmExtraction('job-1', ['ext-1', 'ext-2']);

      expect(result.createdSignals).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].extractionId).toBe('ext-2');
      expect(result.errors[0].error).toBe('Validation failed');
    });

    it('throws when job not found', async () => {
      const signalCreator: SignalCreator = {
        createFromExtraction: vi.fn(),
      };

      const svc = new DocumentParserService({
        knex: createMockKnex(),
        objectStore: createMockObjectStore(),
        pythonClient: createMockPythonClient(),
        signalCreator,
      });

      const { parseJobRepo } = spyOnRepos(svc);
      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue(undefined);

      await expect(svc.confirmExtraction('missing', ['ext-1'])).rejects.toThrow(
        'Parse job not found',
      );
    });

    it('throws when signalCreator is not configured', async () => {
      const svc = new DocumentParserService({
        knex: createMockKnex(),
        objectStore: createMockObjectStore(),
        pythonClient: createMockPythonClient(),
      });

      const { parseJobRepo } = spyOnRepos(svc);
      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue({
        id: 'job-1',
        document_id: 'doc-key',
        status: 'review_pending' as const,
        total_tables_found: 0,
        total_signals_extracted: 0,
        avg_confidence: 0,
        high_confidence_count: 0,
        low_confidence_count: 0,
        unmapped_field_count: 0,
        created_at: new Date(),
        completed_at: null,
      });

      await expect(svc.confirmExtraction('job-1', ['ext-1'])).rejects.toThrow(
        'SignalCreator not configured',
      );
    });
  });

  describe('getParsingReport', () => {
    it('returns accurate statistics computed from actual extraction data', async () => {
      const { parseJobRepo, extractedSignalRepo } = spyOnRepos(service);

      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue({
        id: 'job-1',
        document_id: 'doc-key',
        status: 'review_pending' as const,
        total_tables_found: 3,
        total_signals_extracted: 4,
        avg_confidence: 0.8,
        high_confidence_count: 3,
        low_confidence_count: 1,
        unmapped_field_count: 2,
        created_at: new Date(),
        completed_at: null,
      });

      vi.spyOn(extractedSignalRepo, 'findByJobId').mockResolvedValue([
        { id: 'e1', parse_job_id: 'job-1', data: {}, confidence: 0.95, source_page: 1, source_table: 0, source_row: 0, needs_review: false, created_at: new Date() },
        { id: 'e2', parse_job_id: 'job-1', data: {}, confidence: 0.85, source_page: 1, source_table: 0, source_row: 1, needs_review: false, created_at: new Date() },
        { id: 'e3', parse_job_id: 'job-1', data: {}, confidence: 0.9, source_page: 2, source_table: 1, source_row: 0, needs_review: false, created_at: new Date() },
        { id: 'e4', parse_job_id: 'job-1', data: {}, confidence: 0.5, source_page: 2, source_table: 1, source_row: 1, needs_review: true, created_at: new Date() },
      ]);

      const report = await service.getParsingReport('job-1');

      expect(report.jobId).toBe('job-1');
      expect(report.totalTablesFound).toBe(3);
      expect(report.totalSignalsExtracted).toBe(4);
      expect(report.avgConfidence).toBeCloseTo((0.95 + 0.85 + 0.9 + 0.5) / 4);
      expect(report.highConfidenceCount).toBe(3); // 0.95, 0.85, 0.9 >= 0.8
      expect(report.lowConfidenceCount).toBe(1);  // 0.5 < 0.8
      expect(report.unmappedFieldCount).toBe(2);
    });

    it('returns zero statistics for a job with no extractions', async () => {
      const { parseJobRepo, extractedSignalRepo } = spyOnRepos(service);

      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue({
        id: 'job-2',
        document_id: 'doc-key',
        status: 'review_pending' as const,
        total_tables_found: 0,
        total_signals_extracted: 0,
        avg_confidence: 0,
        high_confidence_count: 0,
        low_confidence_count: 0,
        unmapped_field_count: 0,
        created_at: new Date(),
        completed_at: null,
      });

      vi.spyOn(extractedSignalRepo, 'findByJobId').mockResolvedValue([]);

      const report = await service.getParsingReport('job-2');

      expect(report.totalSignalsExtracted).toBe(0);
      expect(report.avgConfidence).toBe(0);
      expect(report.highConfidenceCount).toBe(0);
      expect(report.lowConfidenceCount).toBe(0);
    });

    it('throws when job not found', async () => {
      const { parseJobRepo } = spyOnRepos(service);
      vi.spyOn(parseJobRepo, 'findById').mockResolvedValue(undefined);

      await expect(service.getParsingReport('missing')).rejects.toThrow(
        'Parse job not found',
      );
    });
  });
});
