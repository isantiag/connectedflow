/**
 * Baseline & Versioning Service — creates immutable snapshots of ICD state.
 *
 * Implements createBaseline, getBaseline, listBaselines per the BaselineService
 * interface from the design document.
 */

import { type Knex } from 'knex';
import type {
  Signal,
  BaselineId,
  ProjectId,
  UserId,
  SignalId,
  SnapshotId,
  LogicalLayer,
  TransportLayer,
  PhysicalLayer,
  Pagination,
  PaginatedResult,
} from '@connectedicd/shared-types';
import { ConnectionManager } from '../db/connection.js';
import {
  BaselineRepository,
  BaselineSnapshotRepository,
  LogicalLayerRepository,
  TransportLayerRepository,
  PhysicalLayerRepository,
  SignalRepository,
  type BaselineRow,
  type BaselineSnapshotRow,
  type LogicalLayerRow,
  type TransportLayerRow,
  type PhysicalLayerRow,
  type SignalRow,
} from '../repositories/index.js';
import { SignalService } from './signal-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BaselineStatus = 'draft' | 'finalized' | 'superseded';

export interface CreateBaselineInput {
  projectId: ProjectId;
  versionLabel: string;
  description?: string;
  createdBy?: UserId;
}

export interface BaselineSnapshot {
  id: SnapshotId;
  baselineId: BaselineId;
  signalId: SignalId;
  logicalSnapshot: Record<string, unknown>;
  transportSnapshot: Record<string, unknown>;
  physicalSnapshot: Record<string, unknown>;
}

export interface Baseline {
  id: BaselineId;
  projectId: ProjectId;
  versionLabel: string;
  description: string;
  createdAt: Date;
  createdBy: UserId;
  status: BaselineStatus;
  snapshots?: BaselineSnapshot[];
}

export interface BaselineFilter {
  projectId?: ProjectId;
  status?: BaselineStatus;
  versionLabelSearch?: string;
}

export interface SnapshotProgress {
  total: number;
  completed: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

// ---------------------------------------------------------------------------
// Diff & Revert types
// ---------------------------------------------------------------------------

export interface DiffSummary {
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
}

export interface SignalDiffEntry {
  signalId: SignalId;
  before: {
    logical: Record<string, unknown>;
    transport: Record<string, unknown>;
    physical: Record<string, unknown>;
  };
  after: {
    logical: Record<string, unknown>;
    transport: Record<string, unknown>;
    physical: Record<string, unknown>;
  };
}

export interface BaselineDiff {
  added: BaselineSnapshot[];
  modified: SignalDiffEntry[];
  deleted: BaselineSnapshot[];
  summary: DiffSummary;
}

export interface RevertResult {
  revertedCount: number;
  baselineId: BaselineId;
  reason: string;
}

// ---------------------------------------------------------------------------
// Certification export types
// ---------------------------------------------------------------------------

export type CertStandard = 'DO-178C' | 'DO-254' | 'ARP4754A';

export interface TraceLink {
  signalId: SignalId;
  requirementTool: 'doors' | 'jama';
  externalRequirementId: string;
  requirementText: string;
  linkStatus: 'active' | 'stale' | 'broken';
}

/**
 * Abstracted trace link provider.
 * Consumers supply an implementation since the trace_link repository may not exist yet.
 */
export interface TraceProvider {
  getTraceLinksForSignal(signalId: SignalId): Promise<TraceLink[]>;
}

export interface TraceabilityMatrixEntry {
  signalId: SignalId;
  signalName: string;
  requirements: TraceLink[];
}

export interface CertExportPackage {
  baselineId: BaselineId;
  standard: CertStandard;
  traceabilityMatrix: TraceabilityMatrixEntry[];
  changeHistory: BaselineDiff;
  exportedAt: Date;
}

/**
 * Abstracted audit writer interface.
 * Consumers provide an implementation to record revert actions in the audit trail.
 */
export interface AuditWriter {
  record(entry: AuditEntry): Promise<void>;
}

export interface AuditEntry {
  userId?: UserId;
  entityType: string;
  entityId: string;
  action: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Row ↔ Domain mappers
// ---------------------------------------------------------------------------

function toBaselineDomain(
  row: BaselineRow,
  snapshots?: BaselineSnapshotRow[],
): Baseline {
  return {
    id: row.id as BaselineId,
    projectId: row.project_id as ProjectId,
    versionLabel: row.version_label,
    description: row.description,
    createdAt: new Date(row.created_at),
    createdBy: (row.created_by ?? '') as UserId,
    status: row.status as BaselineStatus,
    snapshots: snapshots?.map(toSnapshotDomain),
  };
}

function toSnapshotDomain(row: BaselineSnapshotRow): BaselineSnapshot {
  return {
    id: row.id as SnapshotId,
    baselineId: row.baseline_id as BaselineId,
    signalId: row.signal_id as SignalId,
    logicalSnapshot: row.logical_snapshot,
    transportSnapshot: row.transport_snapshot,
    physicalSnapshot: row.physical_snapshot,
  };
}

function layerToJsonb(layer: LogicalLayer | TransportLayer | PhysicalLayer | undefined): Record<string, unknown> {
  if (!layer) return {};
  // Spread to plain object, stripping class prototypes
  return { ...layer };
}

// ---------------------------------------------------------------------------
// BaselineService
// ---------------------------------------------------------------------------

/** Batch size for snapshot inserts to support large datasets. */
const SNAPSHOT_BATCH_SIZE = 200;

export class BaselineService {
  private readonly baselineRepo: BaselineRepository;
  private readonly snapshotRepo: BaselineSnapshotRepository;
  private readonly signalRepo: SignalRepository;
  private readonly logicalRepo: LogicalLayerRepository;
  private readonly transportRepo: TransportLayerRepository;
  private readonly physicalRepo: PhysicalLayerRepository;
  private readonly signalService: SignalService;
  private readonly knex: Knex;
  private readonly auditWriter?: AuditWriter;
  private readonly traceProvider?: TraceProvider;

  constructor(
    connectionManager: ConnectionManager,
    signalService: SignalService,
    auditWriter?: AuditWriter,
    traceProvider?: TraceProvider,
  ) {
    this.knex = connectionManager.getPostgres();
    this.baselineRepo = new BaselineRepository(this.knex);
    this.snapshotRepo = new BaselineSnapshotRepository(this.knex);
    this.signalRepo = new SignalRepository(this.knex);
    this.logicalRepo = new LogicalLayerRepository(this.knex);
    this.transportRepo = new TransportLayerRepository(this.knex);
    this.physicalRepo = new PhysicalLayerRepository(this.knex);
    this.signalService = signalService;
    this.auditWriter = auditWriter;
    this.traceProvider = traceProvider;
  }

  // -----------------------------------------------------------------------
  // createBaseline — snapshot all project signals in a transaction
  // -----------------------------------------------------------------------

  async createBaseline(
    input: CreateBaselineInput,
    onProgress?: (progress: SnapshotProgress) => void,
  ): Promise<Baseline> {
    // Query all signals for the project (fetch all pages)
    const allSignals = await this.fetchAllProjectSignals(input.projectId);

    const progress: SnapshotProgress = {
      total: allSignals.length,
      completed: 0,
      status: 'in_progress',
    };
    onProgress?.(progress);

    return this.knex.transaction(async (trx) => {
      // Create baseline record
      const baselineRow = await this.baselineRepo.insert(
        {
          project_id: input.projectId as string,
          version_label: input.versionLabel,
          description: input.description ?? '',
          created_by: (input.createdBy as string) ?? null,
          status: 'draft',
        },
        trx,
      );

      // Create snapshot rows in batches
      const snapshotRows: BaselineSnapshotRow[] = [];

      for (let i = 0; i < allSignals.length; i += SNAPSHOT_BATCH_SIZE) {
        const batch = allSignals.slice(i, i + SNAPSHOT_BATCH_SIZE);
        const batchData = batch.map((signal) => ({
          baseline_id: baselineRow.id,
          signal_id: signal.id as string,
          logical_snapshot: layerToJsonb(signal.logical),
          transport_snapshot: layerToJsonb(signal.transport),
          physical_snapshot: layerToJsonb(signal.physical),
        }));

        const inserted = await this.snapshotRepo.insertMany(
          batchData as Partial<BaselineSnapshotRow>[],
          trx,
        );
        snapshotRows.push(...inserted);

        progress.completed = Math.min(i + SNAPSHOT_BATCH_SIZE, allSignals.length);
        onProgress?.(progress);
      }

      progress.status = 'completed';
      progress.completed = allSignals.length;
      onProgress?.(progress);

      return toBaselineDomain(baselineRow, snapshotRows);
    });
  }

  // -----------------------------------------------------------------------
  // getBaseline — return baseline with all snapshot data
  // -----------------------------------------------------------------------

  async getBaseline(id: BaselineId): Promise<Baseline> {
    const row = await this.baselineRepo.findById(id as string);
    if (!row) {
      throw new Error(`Baseline not found: ${id}`);
    }

    const snapshotRows = await this.snapshotRepo.findByBaselineId(id as string);
    return toBaselineDomain(row, snapshotRows);
  }

  // -----------------------------------------------------------------------
  // listBaselines — paginated list for a project
  // -----------------------------------------------------------------------

  async listBaselines(
    filter: BaselineFilter,
    pagination: Pagination,
  ): Promise<PaginatedResult<Baseline>> {
    const queryFilter = {
      projectId: filter.projectId as string | undefined,
      status: filter.status,
      versionLabelSearch: filter.versionLabelSearch,
    };

    const page = Math.max(1, pagination.page);
    const pageSize = Math.max(1, Math.min(pagination.pageSize, 200));
    const offset = (page - 1) * pageSize;
    const orderBy = pagination.sortBy ?? 'created_at';
    const orderDir = pagination.sortOrder ?? 'desc';

    const [total, baselineRows] = await Promise.all([
      this.baselineRepo.countWithFilter(queryFilter),
      this.baselineRepo.findWithFilter(queryFilter, {
        limit: pageSize,
        offset,
        orderBy,
        orderDir,
      }),
    ]);

    // List view does not include full snapshot data for performance
    const baselines = baselineRows.map((row) => toBaselineDomain(row));

    return {
      data: baselines,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // -----------------------------------------------------------------------
  // diffBaselines — compare two baselines by signal snapshots
  // -----------------------------------------------------------------------

  async diffBaselines(baseA: BaselineId, baseB: BaselineId): Promise<BaselineDiff> {
    const [snapshotsA, snapshotsB] = await Promise.all([
      this.snapshotRepo.findByBaselineId(baseA as string),
      this.snapshotRepo.findByBaselineId(baseB as string),
    ]);

    const mapA = new Map(snapshotsA.map((s) => [s.signal_id, s]));
    const mapB = new Map(snapshotsB.map((s) => [s.signal_id, s]));

    const added: BaselineSnapshot[] = [];
    const modified: SignalDiffEntry[] = [];
    const deleted: BaselineSnapshot[] = [];

    // Signals in B but not in A → added
    // Signals in both → check for modifications
    for (const [signalId, snapB] of mapB) {
      const snapA = mapA.get(signalId);
      if (!snapA) {
        added.push(toSnapshotDomain(snapB));
      } else {
        const logicalChanged = !jsonEqual(snapA.logical_snapshot, snapB.logical_snapshot);
        const transportChanged = !jsonEqual(snapA.transport_snapshot, snapB.transport_snapshot);
        const physicalChanged = !jsonEqual(snapA.physical_snapshot, snapB.physical_snapshot);

        if (logicalChanged || transportChanged || physicalChanged) {
          modified.push({
            signalId: signalId as SignalId,
            before: {
              logical: snapA.logical_snapshot,
              transport: snapA.transport_snapshot,
              physical: snapA.physical_snapshot,
            },
            after: {
              logical: snapB.logical_snapshot,
              transport: snapB.transport_snapshot,
              physical: snapB.physical_snapshot,
            },
          });
        }
      }
    }

    // Signals in A but not in B → deleted
    for (const [signalId, snapA] of mapA) {
      if (!mapB.has(signalId)) {
        deleted.push(toSnapshotDomain(snapA));
      }
    }

    return {
      added,
      modified,
      deleted,
      summary: {
        addedCount: added.length,
        modifiedCount: modified.length,
        deletedCount: deleted.length,
      },
    };
  }

  // -----------------------------------------------------------------------
  // revertToBaseline — restore signal layers to baseline snapshot state
  // -----------------------------------------------------------------------

  async revertToBaseline(id: BaselineId, reason: string): Promise<RevertResult> {
    const baseline = await this.getBaseline(id);
    const snapshots = baseline.snapshots ?? [];

    if (snapshots.length === 0) {
      return { revertedCount: 0, baselineId: id, reason };
    }

    let revertedCount = 0;

    await this.knex.transaction(async (trx) => {
      for (const snapshot of snapshots) {
        const signalRow = await this.signalRepo.findById(snapshot.signalId as string, trx);
        if (!signalRow) continue;

        // Increment version (new version rather than destructive overwrite)
        const newVersion = (signalRow.version as number) + 1;
        await this.signalRepo.update(
          signalRow.id,
          { version: newVersion, updated_at: new Date() } as Partial<SignalRow>,
          trx,
        );

        // Restore logical layer
        const logicalRow = await this.logicalRepo.findBySignalId(snapshot.signalId as string, trx);
        if (logicalRow) {
          const logicalUpdate = snapshotToLogicalUpdate(snapshot.logicalSnapshot);
          await this.logicalRepo.update(logicalRow.id, logicalUpdate as Partial<LogicalLayerRow>, trx);
        }

        // Restore transport layer
        const transportRow = await this.transportRepo.findBySignalId(snapshot.signalId as string, trx);
        if (transportRow) {
          const transportUpdate = snapshotToTransportUpdate(snapshot.transportSnapshot);
          await this.transportRepo.update(transportRow.id, transportUpdate as Partial<TransportLayerRow>, trx);
        }

        // Restore physical layer
        const physicalRow = await this.physicalRepo.findBySignalId(snapshot.signalId as string, trx);
        if (physicalRow) {
          const physicalUpdate = snapshotToPhysicalUpdate(snapshot.physicalSnapshot);
          await this.physicalRepo.update(physicalRow.id, physicalUpdate as Partial<PhysicalLayerRow>, trx);
        }

        revertedCount++;
      }
    });

    // Record revert action in audit trail
    if (this.auditWriter) {
      await this.auditWriter.record({
        entityType: 'baseline',
        entityId: id as string,
        action: 'revert',
        afterState: { reason, revertedCount },
        timestamp: new Date(),
      });
    }

    return { revertedCount, baselineId: id, reason };
  }

  // -----------------------------------------------------------------------
  // exportForCertification — traceability matrix + change history
  // -----------------------------------------------------------------------

  async exportForCertification(
    id: BaselineId,
    standard: CertStandard,
  ): Promise<CertExportPackage> {
    const baseline = await this.getBaseline(id);
    const snapshots = baseline.snapshots ?? [];

    // Build traceability matrix: for each signal, list linked requirements
    const traceabilityMatrix: TraceabilityMatrixEntry[] = [];

    for (const snapshot of snapshots) {
      const links = this.traceProvider
        ? await this.traceProvider.getTraceLinksForSignal(snapshot.signalId)
        : [];

      const signalName =
        (snapshot.logicalSnapshot as Record<string, unknown>).name as string
        ?? (snapshot.logicalSnapshot as Record<string, unknown>).description as string
        ?? snapshot.signalId;

      traceabilityMatrix.push({
        signalId: snapshot.signalId,
        signalName: String(signalName),
        requirements: links,
      });
    }

    // Build change history: diff against predecessor baseline
    let changeHistory: BaselineDiff;

    const predecessor = await this.findPredecessor(baseline);
    if (predecessor) {
      changeHistory = await this.diffBaselines(predecessor.id, id);
    } else {
      // No predecessor — all signals are "added"
      changeHistory = {
        added: snapshots,
        modified: [],
        deleted: [],
        summary: {
          addedCount: snapshots.length,
          modifiedCount: 0,
          deletedCount: 0,
        },
      };
    }

    return {
      baselineId: id,
      standard,
      traceabilityMatrix,
      changeHistory,
      exportedAt: new Date(),
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Find the predecessor baseline (previous baseline in the same project by created_at).
   */
  private async findPredecessor(baseline: Baseline): Promise<Baseline | null> {
    const allRows = await this.baselineRepo.findWithFilter(
      { projectId: baseline.projectId as string },
      { limit: 1000, offset: 0, orderBy: 'created_at', orderDir: 'desc' },
    );

    // Find baselines created before this one (exclude self by id)
    const candidates = allRows
      .filter((r) => r.id !== (baseline.id as string))
      .filter((r) => new Date(r.created_at).getTime() <= baseline.createdAt.getTime())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (candidates.length === 0) return null;
    return toBaselineDomain(candidates[0]!);
  }

  private async fetchAllProjectSignals(projectId: ProjectId): Promise<Signal[]> {
    const allSignals: Signal[] = [];
    let page = 1;
    const pageSize = 200;

    while (true) {
      const result = await this.signalService.querySignals(
        { projectId },
        { page, pageSize },
      );
      allSignals.push(...result.data);
      if (page >= result.totalPages) break;
      page++;
    }

    return allSignals;
  }
}

// ---------------------------------------------------------------------------
// Snapshot → layer update mappers
// ---------------------------------------------------------------------------

function snapshotToLogicalUpdate(snapshot: Record<string, unknown>): Record<string, unknown> {
  return {
    data_type: snapshot.dataType ?? snapshot.data_type,
    min_value: snapshot.minValue ?? snapshot.min_value ?? null,
    max_value: snapshot.maxValue ?? snapshot.max_value ?? null,
    units: snapshot.units ?? '',
    description: snapshot.description ?? '',
    source_system: snapshot.sourceSystem ?? snapshot.source_system ?? '',
    dest_system: snapshot.destSystem ?? snapshot.dest_system ?? '',
    refresh_rate_hz: snapshot.refreshRateHz ?? snapshot.refresh_rate_hz ?? 0,
    functional_category: snapshot.functionalCategory ?? snapshot.functional_category ?? '',
  };
}

function snapshotToTransportUpdate(snapshot: Record<string, unknown>): Record<string, unknown> {
  return {
    protocol_id: snapshot.protocolId ?? snapshot.protocol_id ?? '',
    bus_id: snapshot.busId ?? snapshot.bus_id ?? '',
    protocol_attrs: snapshot.protocolAttrs ?? snapshot.protocol_attrs ?? {},
    bit_offset: snapshot.bitOffset ?? snapshot.bit_offset ?? 0,
    bit_length: snapshot.bitLength ?? snapshot.bit_length ?? 0,
    encoding: snapshot.encoding ?? 'unsigned',
    scale_factor: snapshot.scaleFactor ?? snapshot.scale_factor ?? 1,
    offset_value: snapshot.offsetValue ?? snapshot.offset_value ?? 0,
    byte_order: snapshot.byteOrder ?? snapshot.byte_order ?? 'big_endian',
  };
}

function snapshotToPhysicalUpdate(snapshot: Record<string, unknown>): Record<string, unknown> {
  return {
    connector_id: snapshot.connectorId ?? snapshot.connector_id ?? '',
    pin_number: snapshot.pinNumber ?? snapshot.pin_number ?? '',
    cable_bundle_id: snapshot.cableBundleId ?? snapshot.cable_bundle_id ?? '',
    wire_gauge: snapshot.wireGauge ?? snapshot.wire_gauge ?? '',
    wire_color: snapshot.wireColor ?? snapshot.wire_color ?? '',
    wire_type: snapshot.wireType ?? snapshot.wire_type ?? '',
    max_length_m: snapshot.maxLengthM ?? snapshot.max_length_m ?? 0,
    shielding: snapshot.shielding ?? '',
  };
}

// ---------------------------------------------------------------------------
// JSON deep equality helper
// ---------------------------------------------------------------------------

function jsonEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
