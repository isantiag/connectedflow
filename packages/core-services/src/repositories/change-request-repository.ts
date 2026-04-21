/**
 * Repository for the `change_request` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '../db/base-repository.js';

export interface ChangeRequestRow {
  [key: string]: unknown;
  id: string;
  signal_id: string;
  submitted_by: string;
  approved_by: string | null;
  status: string;
  change_payload: Record<string, unknown>;
  rejection_reason: string | null;
  submitted_at: Date;
  resolved_at: Date | null;
}

export interface ChangeRequestQueryFilter {
  status?: string;
  signalId?: string;
  submittedBy?: string;
}

export class ChangeRequestRepository extends BaseRepository<ChangeRequestRow> {
  constructor(knex: Knex) {
    super(knex, 'change_request');
  }

  async countWithFilter(
    filter: ChangeRequestQueryFilter,
    trx?: Knex.Transaction,
  ): Promise<number> {
    let query = this.qb(trx);
    query = applyFilter(query, filter);
    const result = await query.count({ count: '*' }).first();
    return Number((result as Record<string, unknown>)?.count ?? 0);
  }

  async findWithFilter(
    filter: ChangeRequestQueryFilter,
    opts: { limit: number; offset: number; orderBy: string; orderDir: 'asc' | 'desc' },
    trx?: Knex.Transaction,
  ): Promise<ChangeRequestRow[]> {
    let query = this.qb(trx);
    query = applyFilter(query, filter);
    return (await query
      .select('*')
      .orderBy(opts.orderBy, opts.orderDir)
      .limit(opts.limit)
      .offset(opts.offset)) as ChangeRequestRow[];
  }
}

function applyFilter(
  query: Knex.QueryBuilder,
  filter: ChangeRequestQueryFilter,
): Knex.QueryBuilder {
  if (filter.status) query = query.where('status', filter.status);
  if (filter.signalId) query = query.where('signal_id', filter.signalId);
  if (filter.submittedBy) query = query.where('submitted_by', filter.submittedBy);
  return query;
}
