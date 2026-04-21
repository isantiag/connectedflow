/**
 * Unit tests for BaselineService.
 *
 * Uses an in-memory mock of the Knex query builder to validate service logic
 * without requiring a live database.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaselineService, type CreateBaselineInput, type BaselineFilter, type SnapshotProgress, type AuditWriter, type AuditEntry, type TraceProvider, type TraceLink as ServiceTraceLink, type CertExportPackage } from './baseline-service.js';
import { SignalService, type CreateSignalInput } from './signal-service.js';
import type { ConnectionManager } from '../db/connection.js';
import type {
  Pagination,
  BaselineId,
  ProjectId,
  UserId,
  ProtocolId,
  BusId,
  ConnectorId,
  CableBundleId,
} from '@connectedicd/shared-types';

// ---------------------------------------------------------------------------
// Helpers — build a fake Knex that records operations
// ---------------------------------------------------------------------------

function createMockKnex() {
  const tables: Record<string, Record<string, unknown>[]> = {
    signal: [],
    logical_layer: [],
    transport_layer: [],
    physical_layer: [],
    baseline: [],
    baseline_snapshot: [],
  };

  let idCounter = 0;
  const nextId = () => `uuid-${++idCounter}`;

  function createQueryBuilder(tableName: string) {
    const rows = tables[tableName]!;
    let filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let limitVal: number | undefined;
    let offsetVal: number | undefined;
    let orderByCol: string | undefined;
    let orderByDir: string | undefined;

    const builder: Record<string, unknown> = {
      where(conditions: Record<string, unknown> | string, value?: unknown) {
        if (typeof conditions === 'string') {
          filters.push((r) => r[conditions] === value);
        } else {
          filters.push((r) =>
            Object.entries(conditions).every(([k, v]) => r[k] === v),
          );
        }
        return builder;
      },
      whereILike(col: string, pattern: string) {
        const search = pattern.replace(/%/g, '').toLowerCase();
        filters.push((r) =>
          String(r[col] ?? '').toLowerCase().includes(search),
        );
        return builder;
      },
      first() {
        const filtered = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve(filtered[0] ?? undefined);
      },
      select(_cols?: string) {
        const resolve = () => {
          let result = rows.filter((r) => filters.every((f) => f(r)));
          if (orderByCol) {
            result = [...result].sort((a, b) => {
              const av = a[orderByCol!] as string;
              const bv = b[orderByCol!] as string;
              const cmp = av < bv ? -1 : av > bv ? 1 : 0;
              return orderByDir === 'desc' ? -cmp : cmp;
            });
          }
          if (offsetVal !== undefined) result = result.slice(offsetVal);
          if (limitVal !== undefined) result = result.slice(0, limitVal);
          return result;
        };
        const chainable: Record<string, unknown> = {
          orderBy(col: string, dir?: string) {
            orderByCol = col;
            orderByDir = dir ?? 'asc';
            return chainable;
          },
          limit(n: number) {
            limitVal = n;
            return chainable;
          },
          offset(n: number) {
            offsetVal = n;
            return chainable;
          },
          then(onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(resolve()).then(onFulfilled, onRejected);
          },
        };
        return chainable;
      },
      count(_spec?: Record<string, string>) {
        const filtered = rows.filter((r) => filters.every((f) => f(r)));
        const countResult = { count: filtered.length };
        return {
          first: () => Promise.resolve(countResult),
        };
      },
      insert(data: Record<string, unknown> | Record<string, unknown>[]) {
        const items = Array.isArray(data) ? data : [data];
        const inserted = items.map((item) => {
          const row = { id: nextId(), created_at: new Date(), ...item };
          rows.push(row);
          return row;
        });
        return {
          returning: (_cols: string) => Promise.resolve(inserted),
        };
      },
      update(data: Record<string, unknown>) {
        const filtered = rows.filter((r) => filters.every((f) => f(r)));
        const updated = filtered.map((r) => {
          Object.assign(r, data);
          return r;
        });
        return {
          returning: (_cols: string) => Promise.resolve(updated),
        };
      },
      del() {
        const toDelete = rows.filter((r) => filters.every((f) => f(r)));
        for (const d of toDelete) {
          const idx = rows.indexOf(d);
          if (idx >= 0) rows.splice(idx, 1);
          if (tableName === 'signal') {
            for (const layerTable of ['logical_layer', 'transport_layer', 'physical_layer']) {
              const layerRows = tables[layerTable]!;
              for (let i = layerRows.length - 1; i >= 0; i--) {
                if (layerRows[i]!.signal_id === d.id) layerRows.splice(i, 1);
              }
            }
          }
        }
        return Promise.resolve(toDelete.length);
      },
      limit(n: number) {
        limitVal = n;
        return builder;
      },
      offset(n: number) {
        offsetVal = n;
        return builder;
      },
      orderBy(col: string, dir?: string) {
        orderByCol = col;
        orderByDir = dir ?? 'asc';
        return builder;
      },
      transacting(_trx: unknown) {
        return builder;
      },
    };

    return builder;
  }

  const knex = ((tableName: string) =>
    createQueryBuilder(tableName)) as unknown as import('knex').Knex;

  (knex as unknown as Record<string, unknown>).transaction = async <T>(
    fn: (trx: unknown) => Promise<T>,
  ): Promise<T> => {
    const trx = {};
    return fn(trx as import('knex').Knex.Transaction);
  };

  return { knex, tables, nextId };
}

function createMockConnectionManager(knex: unknown): ConnectionManager {
  return {
    getPostgres: () => knex,
  } as unknown as ConnectionManager;
}

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function makeSignalInput(overrides?: Partial<CreateSignalInput>): CreateSignalInput {
  return {
    name: 'AIRSPEED_IAS',
    projectId: 'proj-1' as ProjectId,
    status: 'draft',
    criticality: 'major',
    createdBy: 'user-1' as UserId,
    logical: {
      dataType: 'float32',
      minValue: 0,
      maxValue: 500,
      units: 'knots',
      description: 'Indicated airspeed',
      sourceSystem: 'ADC',
      destSystem: 'PFD',
      refreshRateHz: 50,
      functionalCategory: 'air_data',
    },
    transport: {
      protocolId: 'proto-1' as ProtocolId,
      busId: 'bus-1' as BusId,
      protocolAttrs: { label: 205, sdi: '00' },
      bitOffset: 0,
      bitLength: 16,
      encoding: 'unsigned',
      scaleFactor: 0.1,
      offsetValue: 0,
      byteOrder: 'big_endian',
    },
    physical: {
      connectorId: 'conn-1' as ConnectorId,
      pinNumber: 'A1',
      cableBundleId: 'cable-1' as CableBundleId,
      wireGauge: '22AWG',
      wireColor: 'white',
      wireType: 'shielded',
      maxLengthM: 15,
      shielding: 'braided',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BaselineService', () => {
  let signalService: SignalService;
  let baselineService: BaselineService;
  let mockKnex: ReturnType<typeof createMockKnex>;

  beforeEach(() => {
    mockKnex = createMockKnex();
    const cm = createMockConnectionManager(mockKnex.knex);
    signalService = new SignalService(cm);
    baselineService = new BaselineService(cm, signalService);
  });

  // -----------------------------------------------------------------------
  // createBaseline
  // -----------------------------------------------------------------------

  describe('createBaseline', () => {
    it('creates a baseline with snapshots of all project signals', async () => {
      // Create two signals in the project
      await signalService.createSignal(makeSignalInput({ name: 'SIG_A' }));
      await signalService.createSignal(makeSignalInput({ name: 'SIG_B' }));

      const input: CreateBaselineInput = {
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
        description: 'Initial baseline',
        createdBy: 'user-1' as UserId,
      };

      const baseline = await baselineService.createBaseline(input);

      expect(baseline.versionLabel).toBe('v1.0');
      expect(baseline.description).toBe('Initial baseline');
      expect(baseline.status).toBe('draft');
      expect(baseline.snapshots).toHaveLength(2);
    });

    it('captures logical, transport, and physical layers as JSONB snapshots', async () => {
      await signalService.createSignal(makeSignalInput({ name: 'SIG_SNAP' }));

      const baseline = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      const snapshot = baseline.snapshots![0]!;
      expect(snapshot.logicalSnapshot).toBeDefined();
      expect((snapshot.logicalSnapshot as Record<string, unknown>).dataType).toBe('float32');
      expect((snapshot.logicalSnapshot as Record<string, unknown>).units).toBe('knots');

      expect(snapshot.transportSnapshot).toBeDefined();
      expect((snapshot.transportSnapshot as Record<string, unknown>).bitLength).toBe(16);

      expect(snapshot.physicalSnapshot).toBeDefined();
      expect((snapshot.physicalSnapshot as Record<string, unknown>).wireGauge).toBe('22AWG');
    });

    it('creates an empty baseline when project has no signals', async () => {
      const baseline = await baselineService.createBaseline({
        projectId: 'proj-empty' as ProjectId,
        versionLabel: 'v0.1',
      });

      expect(baseline.snapshots).toHaveLength(0);
      expect(baseline.versionLabel).toBe('v0.1');
    });

    it('defaults description to empty string when not provided', async () => {
      const baseline = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      expect(baseline.description).toBe('');
    });

    it('invokes progress callback during snapshot creation', async () => {
      await signalService.createSignal(makeSignalInput({ name: 'SIG_1' }));
      await signalService.createSignal(makeSignalInput({ name: 'SIG_2' }));

      const progressUpdates: SnapshotProgress[] = [];

      await baselineService.createBaseline(
        {
          projectId: 'proj-1' as ProjectId,
          versionLabel: 'v1.0',
        },
        (p) => progressUpdates.push({ ...p }),
      );

      expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
      // First update should be in_progress
      expect(progressUpdates[0]!.status).toBe('in_progress');
      expect(progressUpdates[0]!.total).toBe(2);
      // Last update should be completed
      const last = progressUpdates[progressUpdates.length - 1]!;
      expect(last.status).toBe('completed');
      expect(last.completed).toBe(2);
    });

    it('stores baseline and snapshot rows in the database tables', async () => {
      await signalService.createSignal(makeSignalInput({ name: 'SIG_X' }));

      await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      expect(mockKnex.tables.baseline).toHaveLength(1);
      expect(mockKnex.tables.baseline_snapshot).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // getBaseline
  // -----------------------------------------------------------------------

  describe('getBaseline', () => {
    it('returns baseline with all snapshot data', async () => {
      await signalService.createSignal(makeSignalInput({ name: 'SIG_GET' }));

      const created = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v2.0',
        description: 'Test get',
      });

      const fetched = await baselineService.getBaseline(created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.versionLabel).toBe('v2.0');
      expect(fetched.description).toBe('Test get');
      expect(fetched.snapshots).toHaveLength(1);
      expect(fetched.snapshots![0]!.signalId).toBeDefined();
    });

    it('throws when baseline does not exist', async () => {
      await expect(
        baselineService.getBaseline('nonexistent' as BaselineId),
      ).rejects.toThrow('Baseline not found');
    });
  });

  // -----------------------------------------------------------------------
  // listBaselines
  // -----------------------------------------------------------------------

  describe('listBaselines', () => {
    it('returns paginated results', async () => {
      for (let i = 0; i < 3; i++) {
        await baselineService.createBaseline({
          projectId: 'proj-1' as ProjectId,
          versionLabel: `v${i}`,
        });
      }

      const pagination: Pagination = { page: 1, pageSize: 2 };
      const result = await baselineService.listBaselines({}, pagination);

      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      expect(result.totalPages).toBe(2);
    });

    it('filters by projectId', async () => {
      await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1',
      });
      await baselineService.createBaseline({
        projectId: 'proj-2' as ProjectId,
        versionLabel: 'v2',
      });

      const result = await baselineService.listBaselines(
        { projectId: 'proj-1' as ProjectId },
        { page: 1, pageSize: 10 },
      );

      expect(result.total).toBe(1);
      expect(result.data[0]!.versionLabel).toBe('v1');
    });

    it('filters by status', async () => {
      await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1',
      });

      // All baselines default to 'draft'
      const result = await baselineService.listBaselines(
        { status: 'draft' },
        { page: 1, pageSize: 10 },
      );

      expect(result.total).toBe(1);

      const emptyResult = await baselineService.listBaselines(
        { status: 'finalized' },
        { page: 1, pageSize: 10 },
      );

      expect(emptyResult.total).toBe(0);
    });

    it('does not include snapshot data in list results', async () => {
      await signalService.createSignal(makeSignalInput({ name: 'SIG_LIST' }));
      await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1',
      });

      const result = await baselineService.listBaselines(
        {},
        { page: 1, pageSize: 10 },
      );

      // snapshots should be undefined in list view
      expect(result.data[0]!.snapshots).toBeUndefined();
    });

    it('clamps page to minimum of 1', async () => {
      await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1',
      });

      const result = await baselineService.listBaselines(
        {},
        { page: 0, pageSize: 10 },
      );
      expect(result.page).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // diffBaselines
  // -----------------------------------------------------------------------

  describe('diffBaselines', () => {
    it('identifies added signals (in B but not A)', async () => {
      // Baseline A: no signals
      const baseA = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'vA',
      });

      // Add a signal, then create baseline B
      await signalService.createSignal(makeSignalInput({ name: 'SIG_NEW' }));
      const baseB = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'vB',
      });

      const diff = await baselineService.diffBaselines(baseA.id, baseB.id);

      expect(diff.added).toHaveLength(1);
      expect(diff.modified).toHaveLength(0);
      expect(diff.deleted).toHaveLength(0);
      expect(diff.summary.addedCount).toBe(1);
    });

    it('identifies deleted signals (in A but not B)', async () => {
      await signalService.createSignal(makeSignalInput({ name: 'SIG_DEL' }));
      const baseA = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'vA',
      });

      // Delete the signal, then create baseline B (empty)
      const signals = await signalService.querySignals(
        { projectId: 'proj-1' as ProjectId },
        { page: 1, pageSize: 10 },
      );
      await signalService.deleteSignal(signals.data[0]!.id);

      const baseB = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'vB',
      });

      const diff = await baselineService.diffBaselines(baseA.id, baseB.id);

      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.deleted).toHaveLength(1);
      expect(diff.summary.deletedCount).toBe(1);
    });

    it('identifies modified signals (same signalId, different JSONB)', async () => {
      const signal = await signalService.createSignal(makeSignalInput({ name: 'SIG_MOD' }));
      const baseA = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'vA',
      });

      // Modify the signal
      await signalService.updateSignal(signal.id, {
        version: signal.version,
        logical: { units: 'mph' },
      });

      const baseB = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'vB',
      });

      const diff = await baselineService.diffBaselines(baseA.id, baseB.id);

      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(1);
      expect(diff.deleted).toHaveLength(0);
      expect(diff.summary.modifiedCount).toBe(1);

      const mod = diff.modified[0]!;
      expect(mod.signalId).toBe(signal.id);
      expect((mod.before.logical as Record<string, unknown>).units).toBe('knots');
      expect((mod.after.logical as Record<string, unknown>).units).toBe('mph');
    });

    it('returns empty diff for identical baselines', async () => {
      await signalService.createSignal(makeSignalInput({ name: 'SIG_SAME' }));
      const baseA = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'vA',
      });

      // Create another baseline without changes
      const baseB = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'vB',
      });

      const diff = await baselineService.diffBaselines(baseA.id, baseB.id);

      expect(diff.added).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
      expect(diff.deleted).toHaveLength(0);
      expect(diff.summary).toEqual({ addedCount: 0, modifiedCount: 0, deletedCount: 0 });
    });

    it('handles mixed adds, modifications, and deletions', async () => {
      const sigKeep = await signalService.createSignal(makeSignalInput({ name: 'SIG_KEEP' }));
      const sigDel = await signalService.createSignal(makeSignalInput({ name: 'SIG_DEL2' }));

      const baseA = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'vA',
      });

      // Modify SIG_KEEP, delete SIG_DEL2, add SIG_NEW2
      await signalService.updateSignal(sigKeep.id, {
        version: sigKeep.version,
        physical: { wireColor: 'red' },
      });
      await signalService.deleteSignal(sigDel.id);
      await signalService.createSignal(makeSignalInput({ name: 'SIG_NEW2' }));

      const baseB = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'vB',
      });

      const diff = await baselineService.diffBaselines(baseA.id, baseB.id);

      expect(diff.summary.addedCount).toBe(1);
      expect(diff.summary.modifiedCount).toBe(1);
      expect(diff.summary.deletedCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // revertToBaseline
  // -----------------------------------------------------------------------

  describe('revertToBaseline', () => {
    it('restores signal layers to baseline snapshot state', async () => {
      const signal = await signalService.createSignal(makeSignalInput({ name: 'SIG_REVERT' }));
      const baseline = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      // Modify the signal
      await signalService.updateSignal(signal.id, {
        version: signal.version,
        logical: { units: 'mph', minValue: 10 },
        physical: { wireColor: 'red' },
      });

      // Verify modification took effect
      const modified = await signalService.getSignal(signal.id);
      expect(modified.logical!.units).toBe('mph');
      expect(modified.physical!.wireColor).toBe('red');

      // Revert to baseline
      const result = await baselineService.revertToBaseline(baseline.id, 'Reverting for test');

      expect(result.revertedCount).toBe(1);
      expect(result.baselineId).toBe(baseline.id);
      expect(result.reason).toBe('Reverting for test');

      // Verify signal is restored
      const reverted = await signalService.getSignal(signal.id);
      expect(reverted.logical!.units).toBe('knots');
      expect(reverted.physical!.wireColor).toBe('white');
    });

    it('increments signal version on revert (non-destructive)', async () => {
      const signal = await signalService.createSignal(makeSignalInput({ name: 'SIG_VER' }));
      const baseline = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      // Modify signal (version goes from 1 → 2)
      await signalService.updateSignal(signal.id, {
        version: signal.version,
        logical: { units: 'mph' },
      });

      const beforeRevert = await signalService.getSignal(signal.id);
      expect(beforeRevert.version).toBe(2);

      // Revert (version goes from 2 → 3)
      await baselineService.revertToBaseline(baseline.id, 'version test');

      const afterRevert = await signalService.getSignal(signal.id);
      expect(afterRevert.version).toBe(3);
    });

    it('returns zero count for baseline with no snapshots', async () => {
      const baseline = await baselineService.createBaseline({
        projectId: 'proj-empty' as ProjectId,
        versionLabel: 'v0.1',
      });

      const result = await baselineService.revertToBaseline(baseline.id, 'empty revert');

      expect(result.revertedCount).toBe(0);
    });

    it('records revert action in audit trail when auditWriter is provided', async () => {
      const auditEntries: AuditEntry[] = [];
      const mockAuditWriter: AuditWriter = {
        record: async (entry) => { auditEntries.push(entry); },
      };

      const cm = createMockConnectionManager(mockKnex.knex);
      const auditedService = new BaselineService(cm, signalService, mockAuditWriter);

      await signalService.createSignal(makeSignalInput({ name: 'SIG_AUDIT' }));
      const baseline = await auditedService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      await auditedService.revertToBaseline(baseline.id, 'audit test');

      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0]!.action).toBe('revert');
      expect(auditEntries[0]!.entityType).toBe('baseline');
      expect(auditEntries[0]!.entityId).toBe(baseline.id);
      expect((auditEntries[0]!.afterState as Record<string, unknown>).reason).toBe('audit test');
    });

    it('skips signals that no longer exist in the database', async () => {
      const signal = await signalService.createSignal(makeSignalInput({ name: 'SIG_GONE' }));
      const baseline = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      // Delete the signal after baseline was created
      await signalService.deleteSignal(signal.id);

      const result = await baselineService.revertToBaseline(baseline.id, 'skip deleted');

      expect(result.revertedCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // exportForCertification
  // -----------------------------------------------------------------------

  describe('exportForCertification', () => {
    it('returns a CertExportPackage with correct baselineId, standard, and exportedAt', async () => {
      await signalService.createSignal(makeSignalInput({ name: 'SIG_CERT' }));
      const baseline = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      const before = new Date();
      const pkg = await baselineService.exportForCertification(baseline.id, 'DO-178C');

      expect(pkg.baselineId).toBe(baseline.id);
      expect(pkg.standard).toBe('DO-178C');
      expect(pkg.exportedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('builds traceability matrix with one entry per snapshot signal', async () => {
      await signalService.createSignal(makeSignalInput({ name: 'SIG_A' }));
      await signalService.createSignal(makeSignalInput({ name: 'SIG_B' }));
      const baseline = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      const pkg = await baselineService.exportForCertification(baseline.id, 'DO-254');

      expect(pkg.traceabilityMatrix).toHaveLength(2);
      for (const entry of pkg.traceabilityMatrix) {
        expect(entry.signalId).toBeDefined();
        expect(entry.signalName).toBeDefined();
        // No trace provider → empty requirements
        expect(entry.requirements).toEqual([]);
      }
    });

    it('includes trace links from TraceProvider in the traceability matrix', async () => {
      const signal = await signalService.createSignal(makeSignalInput({ name: 'SIG_TRACED' }));

      const mockTraceProvider: TraceProvider = {
        getTraceLinksForSignal: async (signalId) => {
          if (signalId === signal.id) {
            return [
              {
                signalId: signal.id,
                requirementTool: 'doors' as const,
                externalRequirementId: 'REQ-001',
                requirementText: 'Airspeed shall be displayed',
                linkStatus: 'active' as const,
              },
              {
                signalId: signal.id,
                requirementTool: 'jama' as const,
                externalRequirementId: 'JAMA-042',
                requirementText: 'Airspeed accuracy',
                linkStatus: 'stale' as const,
              },
            ];
          }
          return [];
        },
      };

      const cm = createMockConnectionManager(mockKnex.knex);
      const tracedService = new BaselineService(cm, signalService, undefined, mockTraceProvider);

      const baseline = await tracedService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      const pkg = await tracedService.exportForCertification(baseline.id, 'ARP4754A');

      expect(pkg.traceabilityMatrix).toHaveLength(1);
      const entry = pkg.traceabilityMatrix[0]!;
      expect(entry.requirements).toHaveLength(2);
      expect(entry.requirements[0]!.externalRequirementId).toBe('REQ-001');
      expect(entry.requirements[1]!.externalRequirementId).toBe('JAMA-042');
    });

    it('treats all signals as added when no predecessor baseline exists', async () => {
      await signalService.createSignal(makeSignalInput({ name: 'SIG_FIRST' }));
      const baseline = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      const pkg = await baselineService.exportForCertification(baseline.id, 'DO-178C');

      expect(pkg.changeHistory.summary.addedCount).toBe(1);
      expect(pkg.changeHistory.summary.modifiedCount).toBe(0);
      expect(pkg.changeHistory.summary.deletedCount).toBe(0);
      expect(pkg.changeHistory.added).toHaveLength(1);
    });

    it('diffs against predecessor baseline for change history', async () => {
      await signalService.createSignal(makeSignalInput({ name: 'SIG_V1' }));
      const baseA = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      // Add another signal, then create v2
      await signalService.createSignal(makeSignalInput({ name: 'SIG_V2' }));
      const baseB = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v2.0',
      });

      const pkg = await baselineService.exportForCertification(baseB.id, 'DO-178C');

      // SIG_V2 was added between v1 and v2
      expect(pkg.changeHistory.summary.addedCount).toBe(1);
      expect(pkg.changeHistory.summary.modifiedCount).toBe(0);
      expect(pkg.changeHistory.summary.deletedCount).toBe(0);
    });

    it('returns empty traceability matrix for baseline with no snapshots', async () => {
      const baseline = await baselineService.createBaseline({
        projectId: 'proj-empty' as ProjectId,
        versionLabel: 'v0.1',
      });

      const pkg = await baselineService.exportForCertification(baseline.id, 'DO-254');

      expect(pkg.traceabilityMatrix).toHaveLength(0);
      expect(pkg.changeHistory.added).toHaveLength(0);
    });

    it('supports all three certification standards', async () => {
      const baseline = await baselineService.createBaseline({
        projectId: 'proj-1' as ProjectId,
        versionLabel: 'v1.0',
      });

      for (const standard of ['DO-178C', 'DO-254', 'ARP4754A'] as const) {
        const pkg = await baselineService.exportForCertification(baseline.id, standard);
        expect(pkg.standard).toBe(standard);
      }
    });
  });
});
