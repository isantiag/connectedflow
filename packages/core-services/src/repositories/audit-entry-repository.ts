/**
 * Repository for the `audit_entry` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '../db/base-repository.js';

export interface AuditEntryRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  timestamp: Date;
}

export interface AuditEntryQueryFilter {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  fromTime?: Date;
  toTime?: Date;
}

export class AuditEntryRepository extends BaseRepository<AuditEntryRow> {
  constructor(knex: Knex) {
    super(knex, 'audit_entry');
  }

  async countWithFilter(
    filter: AuditEntryQueryFilter,
    trx?: Knex.Transaction,
  ): Promise<number> {
    let query = this.qb(trx);
    query = applyFilter(query, filter);
    const result = await query.count({ count: '*' }).first();
    return Number((result as Record<string, unknown>)?.count ?? 0);
  }

  async findWithFilter(
    filter: AuditEntryQueryFilter,
    opts: { limit: number; offset: number; orderBy: string; orderDir: 'asc' | 'desc' },
    trx?: Knex.Transaction,
  ): Promise<AuditEntryRow[]> {
    let query = this.qb(trx);
    query = applyFilter(query, filter);
    return (await query
      .select('*')
      .orderBy(opts.orderBy, opts.orderDir)
      .limit(opts.limit)
      .offset(opts.offset)) as AuditEntryRow[];
  }
}

function applyFilter(
  query: Knex.QueryBuilder,
  filter: AuditEntryQueryFilter,
): Knex.QueryBuilder {
  if (filter.entityType) query = query.where('entity_type', filter.entityType);
  if (filter.entityId) query = query.where('entity_id', filter.entityId);
  if (filter.userId) query = query.where('user_id', filter.userId);
  if (filter.action) query = query.where('action', filter.action);
  if (filter.fromTime) query = query.where('timestamp', '>=', filter.fromTime);
  if (filter.toTime) query = query.where('timestamp', '<=', filter.toTime);
  return query;
}
