/**
 * Unit tests for SignalService CRUD operations.
 *
 * Uses an in-memory mock of the Knex query builder to validate service logic
 * without requiring a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalService, type CreateSignalInput, type SignalPatch, type SignalFilter, type FieldMapping } from './signal-service.js';
import { ConcurrentEditError, suggestMerge } from './concurrent-edit-error.js';
import type { ConnectionManager } from '../db/connection.js';
import type { Pagination, SignalId, ProjectId, UserId, ProtocolId, BusId, ConnectorId, CableBundleId } from '@connectedflow/shared-types';

// ---------------------------------------------------------------------------
// Helpers — build a fake Knex that records operations
// ---------------------------------------------------------------------------

function createMockKnex() {
  const tables: Record<string, Record<string, unknown>[]> = {
    signal: [],
    logical_layer: [],
    transport_layer: [],
    physical_layer: [],
  };

  let idCounter = 0;
  const nextId = () => `uuid-${++idCounter}`;

  // Chainable query builder mock
  function createQueryBuilder(tableName: string, trxRows?: Record<string, unknown>[]) {
    const rows = trxRows ?? tables[tableName]!;
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
        // Return a thenable that also supports chaining .orderBy/.limit/.offset
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
          const row = { id: nextId(), ...item };
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
          // Cascade: remove layers referencing this signal
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

  // Transaction support — just runs the callback directly
  (knex as unknown as Record<string, unknown>).transaction = async <T>(
    fn: (trx: unknown) => Promise<T>,
  ): Promise<T> => {
    const trx = {}; // dummy trx object
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

function makeCreateInput(overrides?: Partial<CreateSignalInput>): CreateSignalInput {
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

describe('SignalService', () => {
  let service: SignalService;
  let mockKnex: ReturnType<typeof createMockKnex>;

  beforeEach(() => {
    mockKnex = createMockKnex();
    const cm = createMockConnectionManager(mockKnex.knex);
    service = new SignalService(cm);
  });

  // -----------------------------------------------------------------------
  // createSignal
  // -----------------------------------------------------------------------

  describe('createSignal', () => {
    it('creates a signal with all three layers in a single call', async () => {
      const input = makeCreateInput();
      const signal = await service.createSignal(input);

      expect(signal.name).toBe('AIRSPEED_IAS');
      expect(signal.status).toBe('draft');
      expect(signal.criticality).toBe('major');
      expect(signal.version).toBe(1);

      // Logical layer
      expect(signal.logical).toBeDefined();
      expect(signal.logical!.dataType).toBe('float32');
      expect(signal.logical!.minValue).toBe(0);
      expect(signal.logical!.maxValue).toBe(500);
      expect(signal.logical!.units).toBe('knots');

      // Transport layer
      expect(signal.transport).toBeDefined();
      expect(signal.transport!.bitOffset).toBe(0);
      expect(signal.transport!.bitLength).toBe(16);
      expect(signal.transport!.encoding).toBe('unsigned');

      // Physical layer
      expect(signal.physical).toBeDefined();
      expect(signal.physical!.pinNumber).toBe('A1');
      expect(signal.physical!.wireGauge).toBe('22AWG');
    });

    it('defaults status to draft and criticality to info when not provided', async () => {
      const input = makeCreateInput({ status: undefined, criticality: undefined });
      const signal = await service.createSignal(input);

      expect(signal.status).toBe('draft');
      expect(signal.criticality).toBe('info');
    });

    it('stores rows in all four tables', async () => {
      await service.createSignal(makeCreateInput());

      expect(mockKnex.tables.signal).toHaveLength(1);
      expect(mockKnex.tables.logical_layer).toHaveLength(1);
      expect(mockKnex.tables.transport_layer).toHaveLength(1);
      expect(mockKnex.tables.physical_layer).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // getSignal
  // -----------------------------------------------------------------------

  describe('getSignal', () => {
    it('returns signal with all layers', async () => {
      const created = await service.createSignal(makeCreateInput());
      const fetched = await service.getSignal(created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('AIRSPEED_IAS');
      expect(fetched.logical).toBeDefined();
      expect(fetched.transport).toBeDefined();
      expect(fetched.physical).toBeDefined();
    });

    it('throws when signal does not exist', async () => {
      await expect(
        service.getSignal('nonexistent' as SignalId),
      ).rejects.toThrow('Signal not found');
    });
  });

  // -----------------------------------------------------------------------
  // updateSignal
  // -----------------------------------------------------------------------

  describe('updateSignal', () => {
    it('updates signal name and increments version', async () => {
      const created = await service.createSignal(makeCreateInput());

      const updated = await service.updateSignal(created.id, {
        name: 'AIRSPEED_TAS',
        version: 1,
      });

      expect(updated.name).toBe('AIRSPEED_TAS');
      expect(updated.version).toBe(2);
    });

    it('updates logical layer fields', async () => {
      const created = await service.createSignal(makeCreateInput());

      const updated = await service.updateSignal(created.id, {
        version: 1,
        logical: { units: 'mph', maxValue: 600 },
      });

      expect(updated.logical!.units).toBe('mph');
      expect(updated.logical!.maxValue).toBe(600);
    });

    it('rejects update with wrong version (optimistic locking)', async () => {
      const created = await service.createSignal(makeCreateInput());

      await expect(
        service.updateSignal(created.id, {
          name: 'STALE_UPDATE',
          version: 99,
        }),
      ).rejects.toThrow(ConcurrentEditError);
    });
  });

  // -----------------------------------------------------------------------
  // deleteSignal
  // -----------------------------------------------------------------------

  describe('deleteSignal', () => {
    it('deletes signal and reports which layers were deleted', async () => {
      const created = await service.createSignal(makeCreateInput());
      const result = await service.deleteSignal(created.id);

      expect(result.signalId).toBe(created.id);
      expect(result.layersDeleted.logical).toBe(true);
      expect(result.layersDeleted.transport).toBe(true);
      expect(result.layersDeleted.physical).toBe(true);

      // Verify tables are empty
      expect(mockKnex.tables.signal).toHaveLength(0);
      expect(mockKnex.tables.logical_layer).toHaveLength(0);
      expect(mockKnex.tables.transport_layer).toHaveLength(0);
      expect(mockKnex.tables.physical_layer).toHaveLength(0);
    });

    it('throws when signal does not exist', async () => {
      await expect(
        service.deleteSignal('nonexistent' as SignalId),
      ).rejects.toThrow('Signal not found');
    });
  });

  // -----------------------------------------------------------------------
  // querySignals
  // -----------------------------------------------------------------------

  describe('querySignals', () => {
    it('returns paginated results', async () => {
      // Create 3 signals
      for (let i = 0; i < 3; i++) {
        await service.createSignal(
          makeCreateInput({ name: `SIG_${i}` }),
        );
      }

      const pagination: Pagination = { page: 1, pageSize: 2 };
      const result = await service.querySignals({}, pagination);

      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
      expect(result.totalPages).toBe(2);
    });

    it('filters by projectId', async () => {
      await service.createSignal(makeCreateInput({ name: 'A', projectId: 'proj-1' as ProjectId }));
      await service.createSignal(makeCreateInput({ name: 'B', projectId: 'proj-2' as ProjectId }));

      const result = await service.querySignals(
        { projectId: 'proj-1' as ProjectId },
        { page: 1, pageSize: 10 },
      );

      expect(result.total).toBe(1);
      expect(result.data[0]!.name).toBe('A');
    });

    it('filters by status', async () => {
      await service.createSignal(makeCreateInput({ name: 'DRAFT', status: 'draft' }));
      await service.createSignal(makeCreateInput({ name: 'ACTIVE', status: 'active' }));

      const result = await service.querySignals(
        { status: 'active' },
        { page: 1, pageSize: 10 },
      );

      expect(result.total).toBe(1);
      expect(result.data[0]!.name).toBe('ACTIVE');
    });

    it('filters by name search (case-insensitive)', async () => {
      await service.createSignal(makeCreateInput({ name: 'AIRSPEED_IAS' }));
      await service.createSignal(makeCreateInput({ name: 'ALTITUDE_BARO' }));

      const result = await service.querySignals(
        { nameSearch: 'airspeed' },
        { page: 1, pageSize: 10 },
      );

      expect(result.total).toBe(1);
      expect(result.data[0]!.name).toBe('AIRSPEED_IAS');
    });

    it('clamps page to minimum of 1', async () => {
      await service.createSignal(makeCreateInput());

      const result = await service.querySignals({}, { page: 0, pageSize: 10 });
      expect(result.page).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // bulkImport
  // -----------------------------------------------------------------------

  describe('bulkImport', () => {
    const baseMapping: FieldMapping = {
      'Signal Name': 'name',
      'Project': 'projectId',
      'Data Type': 'logical.dataType',
      'Min': 'logical.minValue',
      'Max': 'logical.maxValue',
      'Units': 'logical.units',
      'Description': 'logical.description',
      'Source': 'logical.sourceSystem',
      'Dest': 'logical.destSystem',
      'Rate': 'logical.refreshRateHz',
      'Category': 'logical.functionalCategory',
      'Protocol': 'transport.protocolId',
      'Bus': 'transport.busId',
      'BitOffset': 'transport.bitOffset',
      'BitLength': 'transport.bitLength',
      'Encoding': 'transport.encoding',
      'Scale': 'transport.scaleFactor',
      'Offset': 'transport.offsetValue',
      'ByteOrder': 'transport.byteOrder',
      'Connector': 'physical.connectorId',
      'Pin': 'physical.pinNumber',
      'Cable': 'physical.cableBundleId',
      'Gauge': 'physical.wireGauge',
      'Color': 'physical.wireColor',
      'WireType': 'physical.wireType',
      'MaxLen': 'physical.maxLengthM',
      'Shielding': 'physical.shielding',
    };

    function makeRawRecord(overrides?: Record<string, unknown>): Record<string, unknown> {
      return {
        'Signal Name': 'AIRSPEED_IAS',
        'Project': 'proj-1',
        'Data Type': 'float32',
        'Min': 0,
        'Max': 500,
        'Units': 'knots',
        'Description': 'Indicated airspeed',
        'Source': 'ADC',
        'Dest': 'PFD',
        'Rate': 50,
        'Category': 'air_data',
        'Protocol': 'proto-1',
        'Bus': 'bus-1',
        'BitOffset': 0,
        'BitLength': 16,
        'Encoding': 'unsigned',
        'Scale': 0.1,
        'Offset': 0,
        'ByteOrder': 'big_endian',
        'Connector': 'conn-1',
        'Pin': 'A1',
        'Cable': 'cable-1',
        'Gauge': '22AWG',
        'Color': 'white',
        'WireType': 'shielded',
        'MaxLen': 15,
        'Shielding': 'braided',
        ...overrides,
      };
    }

    it('creates signals from valid records', async () => {
      const records = [makeRawRecord(), makeRawRecord({ 'Signal Name': 'ALT_BARO' })];
      const result = await service.bulkImport(records, baseMapping);

      expect(result.createdCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockKnex.tables.signal).toHaveLength(2);
    });

    it('reports unmapped fields that target unknown schema paths', async () => {
      const mapping: FieldMapping = {
        ...baseMapping,
        'Legacy Code': 'nonexistent.field',
        'Vendor Note': 'vendor.note',
      };

      const result = await service.bulkImport([makeRawRecord()], mapping);

      expect(result.unmappedFields).toContain('Legacy Code');
      expect(result.unmappedFields).toContain('Vendor Note');
      expect(result.createdCount).toBe(1);
    });

    it('reports source fields present in records but absent from mapping', async () => {
      const record = { ...makeRawRecord(), 'Extra Column': 'some value' };
      const result = await service.bulkImport([record], baseMapping);

      expect(result.unmappedFields).toContain('Extra Column');
      expect(result.createdCount).toBe(1);
    });

    it('maps known fields correctly to signal attributes', async () => {
      const records = [makeRawRecord()];
      await service.bulkImport(records, baseMapping);

      // Verify the created signal has the right values
      const signalRow = mockKnex.tables.signal[0]!;
      expect(signalRow.name).toBe('AIRSPEED_IAS');

      const logicalRow = mockKnex.tables.logical_layer[0]!;
      expect(logicalRow.data_type).toBe('float32');
      expect(logicalRow.min_value).toBe(0);
      expect(logicalRow.max_value).toBe(500);
      expect(logicalRow.units).toBe('knots');

      const transportRow = mockKnex.tables.transport_layer[0]!;
      expect(transportRow.bit_offset).toBe(0);
      expect(transportRow.bit_length).toBe(16);

      const physicalRow = mockKnex.tables.physical_layer[0]!;
      expect(physicalRow.pin_number).toBe('A1');
      expect(physicalRow.wire_gauge).toBe('22AWG');
    });

    it('returns empty result for empty records array', async () => {
      const result = await service.bulkImport([], baseMapping);

      expect(result.createdCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.unmappedFields).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('collects unmapped fields across multiple records', async () => {
      const records = [
        { ...makeRawRecord(), 'ExtraA': 1 },
        { ...makeRawRecord(), 'ExtraB': 2 },
      ];
      const result = await service.bulkImport(records, baseMapping);

      expect(result.unmappedFields).toContain('ExtraA');
      expect(result.unmappedFields).toContain('ExtraB');
      expect(result.createdCount).toBe(2);
    });

    it('does not duplicate unmapped fields seen in multiple records', async () => {
      const records = [
        { ...makeRawRecord(), 'ExtraA': 1 },
        { ...makeRawRecord(), 'ExtraA': 2 },
      ];
      const result = await service.bulkImport(records, baseMapping);

      const extraACount = result.unmappedFields.filter((f) => f === 'ExtraA').length;
      expect(extraACount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Concurrent edit detection
  // -----------------------------------------------------------------------

  describe('concurrent edit detection', () => {
    it('first update succeeds, second update on same base version throws ConcurrentEditError', async () => {
      const created = await service.createSignal(makeCreateInput());
      const baseVersion = created.version; // 1

      // First update succeeds
      const updated = await service.updateSignal(created.id, {
        name: 'UPDATE_A',
        version: baseVersion,
      });
      expect(updated.version).toBe(2);

      // Second update with same base version fails
      await expect(
        service.updateSignal(created.id, {
          name: 'UPDATE_B',
          version: baseVersion,
        }),
      ).rejects.toThrow(ConcurrentEditError);
    });

    it('ConcurrentEditError contains signal ID and expected version', async () => {
      const created = await service.createSignal(makeCreateInput());

      // Advance version
      await service.updateSignal(created.id, { name: 'V2', version: 1 });

      try {
        await service.updateSignal(created.id, { name: 'STALE', version: 1 });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConcurrentEditError);
        const concurrentErr = err as ConcurrentEditError;
        expect(concurrentErr.signalId).toBe(created.id);
        expect(concurrentErr.expectedVersion).toBe(1);
      }
    });

    it('sequential updates with correct versions all succeed', async () => {
      const created = await service.createSignal(makeCreateInput());

      const v2 = await service.updateSignal(created.id, { name: 'V2', version: 1 });
      expect(v2.version).toBe(2);

      const v3 = await service.updateSignal(created.id, { name: 'V3', version: 2 });
      expect(v3.version).toBe(3);

      const v4 = await service.updateSignal(created.id, { name: 'V4', version: 3 });
      expect(v4.version).toBe(4);
    });

    it('throws plain Error for non-existent signal (not ConcurrentEditError)', async () => {
      await expect(
        service.updateSignal('nonexistent' as SignalId, { name: 'X', version: 1 }),
      ).rejects.toThrow('Signal not found');

      try {
        await service.updateSignal('nonexistent' as SignalId, { name: 'X', version: 1 });
      } catch (err) {
        expect(err).not.toBeInstanceOf(ConcurrentEditError);
      }
    });
  });

  // -----------------------------------------------------------------------
  // suggestMerge helper
  // -----------------------------------------------------------------------

  describe('suggestMerge', () => {
    it('identifies conflicting fields when both patches modify the same group', () => {
      const patchA = { name: 'A', logical: { units: 'knots' } };
      const patchB = { name: 'B', transport: { bitLength: 32 }, logical: { maxValue: 999 } };

      const result = suggestMerge(patchA, patchB);

      expect(result.conflicting).toContain('name');
      expect(result.conflicting).toContain('logical');
      expect(result.mergeable).toContain('transport');
    });

    it('returns all mergeable when patches touch different fields', () => {
      const patchA = { name: 'A' };
      const patchB = { logical: { units: 'mph' } };

      const result = suggestMerge(patchA, patchB);

      expect(result.conflicting).toHaveLength(0);
      expect(result.mergeable).toContain('name');
      expect(result.mergeable).toContain('logical');
    });

    it('returns empty when neither patch modifies tracked fields', () => {
      const result = suggestMerge({ version: 1 }, { version: 2 });

      expect(result.conflicting).toHaveLength(0);
      expect(result.mergeable).toHaveLength(0);
    });

    it('returns all conflicting when both patches modify all groups', () => {
      const patchA = { name: 'A', status: 'active', criticality: 'major', logical: {}, transport: {}, physical: {} };
      const patchB = { name: 'B', status: 'draft', criticality: 'info', logical: {}, transport: {}, physical: {} };

      const result = suggestMerge(patchA, patchB);

      expect(result.conflicting).toEqual(['name', 'status', 'criticality', 'logical', 'transport', 'physical']);
      expect(result.mergeable).toHaveLength(0);
    });
  });
});
