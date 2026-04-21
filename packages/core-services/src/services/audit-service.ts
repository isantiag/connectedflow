/**
 * Audit Service — records and queries audit trail entries.
 *
 * Implements the AuditWriter interface so it can be injected into
 * BaselineService and other services that need audit recording.
 */

import type { UserId, AuditEntryId, Pagination, PaginatedResult } from '@connectedflow/shared-types';
import type {
  AuditEntryRepository,
  AuditEntryRow,
  AuditEntryQueryFilter,
} from '../repositories/audit-entry-repository.js';
import type { AuditWriter, AuditEntry } from './baseline-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditFilter {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  fromTime?: Date;
  toTime?: Date;
}

export interface AuditEntryDomain {
  id: AuditEntryId;
  userId: UserId;
  entityType: string;
  entityId: string;
  action: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// AuditService
// ---------------------------------------------------------------------------

export class AuditService implements AuditWriter {
  constructor(private readonly auditEntryRepo: AuditEntryRepository) {}

  /** Persist an audit entry (satisfies AuditWriter interface). */
  async record(entry: AuditEntry): Promise<void> {
    await this.auditEntryRepo.insert({
      user_id: entry.userId ?? ('system' as UserId),
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      action: entry.action,
      before_state: entry.beforeState ?? null,
      after_state: entry.afterState ?? null,
      timestamp: entry.timestamp,
    } as Partial<AuditEntryRow>);
  }

  /** Query audit entries with filtering and pagination, ordered by timestamp. */
  async getAuditTrail(
    filter: AuditFilter,
    pagination: Pagination = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<AuditEntryDomain>> {
    const repoFilter: AuditEntryQueryFilter = {
      entityType: filter.entityType,
      entityId: filter.entityId,
      userId: filter.userId,
      action: filter.action,
      fromTime: filter.fromTime,
      toTime: filter.toTime,
    };

    const total = await this.auditEntryRepo.countWithFilter(repoFilter);
    const offset = (pagination.page - 1) * pagination.pageSize;
    const rows = await this.auditEntryRepo.findWithFilter(repoFilter, {
      limit: pagination.pageSize,
      offset,
      orderBy: pagination.sortBy ?? 'timestamp',
      orderDir: pagination.sortOrder ?? 'asc',
    });

    const data = rows.map(toAuditEntryDomain);
    const totalPages = Math.ceil(total / pagination.pageSize);

    return { data, total, page: pagination.page, pageSize: pagination.pageSize, totalPages };
  }
}

// ---------------------------------------------------------------------------
// Row → Domain mapper
// ---------------------------------------------------------------------------

function toAuditEntryDomain(row: AuditEntryRow): AuditEntryDomain {
  return {
    id: row.id as AuditEntryId,
    userId: row.user_id as UserId,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    beforeState: row.before_state,
    afterState: row.after_state,
    timestamp: row.timestamp,
  };
}
