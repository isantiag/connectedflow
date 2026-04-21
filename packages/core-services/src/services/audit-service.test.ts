/**
 * Unit tests for AuditService.
 *
 * Uses in-memory fakes to validate audit trail logic without a live database.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuditService, type AuditFilter } from './audit-service.js';
import type { AuditEntry } from './baseline-service.js';
import type {
  AuditEntryRepository,
  AuditEntryRow,
  AuditEntryQueryFilter,
} from '../repositories/audit-entry-repository.js';
import type { UserId, AuditEntryId } from '@connectedicd/shared-types';

// ---------------------------------------------------------------------------
// In-memory fake
// ---------------------------------------------------------------------------

function createFakeAuditEntryRepo(): AuditEntryRepository {
  const rows: AuditEntryRow[] = [];
  let counter = 0;

  return {
    insert: async (data: Partial<AuditEntryRow>) => {
      const row: AuditEntryRow = {
        id: `ae-${++counter}`,
        user_id: data.user_id ?? '',
        entity_type: data.entity_type ?? '',
        entity_id: data.entity_id ?? '',
        action: data.action ?? '',
        before_state: data.before_state ?? null,
        after_state: data.after_state ?? null,
        timestamp: data.timestamp ?? new Date(),
      };
      rows.push(row);
      return row;
    },
    countWithFilter: async (filter: AuditEntryQueryFilter) => {
      return filterRows(rows, filter).length;
    },
    findWithFilter: async (
      filter: AuditEntryQueryFilter,
      opts: { limit: number; offset: number; orderBy: string; orderDir: 'asc' | 'desc' },
    ) => {
      const filtered = filterRows(rows, filter);
      const sorted = [...filtered].sort((a, b) => {
        const aVal = a[opts.orderBy] as Date;
        const bVal = b[opts.orderBy] as Date;
        const cmp = aVal.getTime() - bVal.getTime();
        return opts.orderDir === 'asc' ? cmp : -cmp;
      });
      return sorted.slice(opts.offset, opts.offset + opts.limit);
    },
  } as unknown as AuditEntryRepository;
}

function filterRows(rows: AuditEntryRow[], filter: AuditEntryQueryFilter): AuditEntryRow[] {
  return rows.filter((r) => {
    if (filter.entityType && r.entity_type !== filter.entityType) return false;
    if (filter.entityId && r.entity_id !== filter.entityId) return false;
    if (filter.userId && r.user_id !== filter.userId) return false;
    if (filter.action && r.action !== filter.action) return false;
    if (filter.fromTime && r.timestamp < filter.fromTime) return false;
    if (filter.toTime && r.timestamp > filter.toTime) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const userId = 'user-1' as UserId;

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    userId,
    entityType: 'signal',
    entityId: 'sig-1',
    action: 'update',
    beforeState: { name: 'old' },
    afterState: { name: 'new' },
    timestamp: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    const repo = createFakeAuditEntryRepo();
    service = new AuditService(repo);
  });

  describe('record', () => {
    it('persists an audit entry', async () => {
      await service.record(makeEntry());
      const result = await service.getAuditTrail({});
      expect(result.total).toBe(1);
      expect(result.data[0].entityType).toBe('signal');
      expect(result.data[0].action).toBe('update');
    });

    it('stores before/after state snapshots', async () => {
      await service.record(makeEntry({
        beforeState: { value: 10 },
        afterState: { value: 20 },
      }));
      const result = await service.getAuditTrail({});
      expect(result.data[0].beforeState).toEqual({ value: 10 });
      expect(result.data[0].afterState).toEqual({ value: 20 });
    });

    it('defaults userId to system when not provided', async () => {
      await service.record(makeEntry({ userId: undefined }));
      const result = await service.getAuditTrail({});
      expect(result.data[0].userId).toBe('system');
    });

    it('handles null before/after states', async () => {
      await service.record(makeEntry({
        action: 'create',
        beforeState: undefined,
        afterState: { name: 'new-signal' },
      }));
      const result = await service.getAuditTrail({});
      expect(result.data[0].beforeState).toBeNull();
      expect(result.data[0].afterState).toEqual({ name: 'new-signal' });
    });
  });

  describe('getAuditTrail', () => {
    it('returns entries ordered by timestamp ascending by default', async () => {
      const t1 = new Date('2024-01-01T00:00:00Z');
      const t2 = new Date('2024-01-02T00:00:00Z');
      const t3 = new Date('2024-01-03T00:00:00Z');

      await service.record(makeEntry({ timestamp: t3, entityId: 'sig-3' }));
      await service.record(makeEntry({ timestamp: t1, entityId: 'sig-1' }));
      await service.record(makeEntry({ timestamp: t2, entityId: 'sig-2' }));

      const result = await service.getAuditTrail({});
      expect(result.data.map((e) => e.entityId)).toEqual(['sig-1', 'sig-2', 'sig-3']);
    });

    it('paginates results', async () => {
      for (let i = 0; i < 5; i++) {
        await service.record(makeEntry({
          entityId: `sig-${i}`,
          timestamp: new Date(2024, 0, i + 1),
        }));
      }

      const page1 = await service.getAuditTrail({}, { page: 1, pageSize: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.totalPages).toBe(3);
      expect(page1.page).toBe(1);

      const page2 = await service.getAuditTrail({}, { page: 2, pageSize: 2 });
      expect(page2.data).toHaveLength(2);
    });

    it('filters by entityType', async () => {
      await service.record(makeEntry({ entityType: 'signal' }));
      await service.record(makeEntry({ entityType: 'baseline' }));

      const result = await service.getAuditTrail({ entityType: 'signal' });
      expect(result.total).toBe(1);
      expect(result.data[0].entityType).toBe('signal');
    });

    it('filters by entityId', async () => {
      await service.record(makeEntry({ entityId: 'sig-1' }));
      await service.record(makeEntry({ entityId: 'sig-2' }));

      const result = await service.getAuditTrail({ entityId: 'sig-1' });
      expect(result.total).toBe(1);
      expect(result.data[0].entityId).toBe('sig-1');
    });

    it('filters by userId', async () => {
      await service.record(makeEntry({ userId: 'user-a' as UserId }));
      await service.record(makeEntry({ userId: 'user-b' as UserId }));

      const result = await service.getAuditTrail({ userId: 'user-a' });
      expect(result.total).toBe(1);
      expect(result.data[0].userId).toBe('user-a');
    });

    it('filters by action', async () => {
      await service.record(makeEntry({ action: 'create' }));
      await service.record(makeEntry({ action: 'update' }));
      await service.record(makeEntry({ action: 'delete' }));

      const result = await service.getAuditTrail({ action: 'update' });
      expect(result.total).toBe(1);
      expect(result.data[0].action).toBe('update');
    });

    it('filters by time range', async () => {
      const t1 = new Date('2024-01-01T00:00:00Z');
      const t2 = new Date('2024-06-15T00:00:00Z');
      const t3 = new Date('2024-12-31T00:00:00Z');

      await service.record(makeEntry({ timestamp: t1, entityId: 'sig-1' }));
      await service.record(makeEntry({ timestamp: t2, entityId: 'sig-2' }));
      await service.record(makeEntry({ timestamp: t3, entityId: 'sig-3' }));

      const result = await service.getAuditTrail({
        fromTime: new Date('2024-03-01T00:00:00Z'),
        toTime: new Date('2024-09-01T00:00:00Z'),
      });
      expect(result.total).toBe(1);
      expect(result.data[0].entityId).toBe('sig-2');
    });

    it('returns empty result when no matches', async () => {
      const result = await service.getAuditTrail({ action: 'nonexistent' });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('each entry has all required fields', async () => {
      await service.record(makeEntry());
      const result = await service.getAuditTrail({});
      const entry = result.data[0];

      expect(entry.id).toBeDefined();
      expect(entry.userId).toBeDefined();
      expect(entry.entityType).toBeDefined();
      expect(entry.entityId).toBeDefined();
      expect(entry.action).toBeDefined();
      expect(entry.timestamp).toBeInstanceOf(Date);
    });
  });
});
