/**
 * Repository for the `baseline` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '../db/base-repository.js';

export interface BaselineRow {
  [key: string]: unknown;
  id: string;
  project_id: string;
  version_label: string;
  description: string;
  created_at: Date;
  created_by: string | null;
  status: string;
}

export interface BaselineQueryFilter {
  projectId?: string;
  status?: string;
  versionLabelSearch?: string;
}

export class BaselineRepository extends BaseRepository<BaselineRow> {
  constructor(knex: Knex) {
    super(knex, 'baseline');
  }

  async countWithFilter(
    filter: BaselineQueryFilter,
    trx?: Knex.Transaction,
  ): Promise<number> {
    let query = this.qb(trx);
    query = applyBaselineFilter(query, filter);
    const result = await query.count({ count: '*' }).first();
    return Number((result as Record<string, unknown>)?.count ?? 0);
  }

  async findWithFilter(
    filter: BaselineQueryFilter,
    opts: { limit: number; offset: number; orderBy: string; orderDir: 'asc' | 'desc' },
    trx?: Knex.Transaction,
  ): Promise<BaselineRow[]> {
    let query = this.qb(trx);
    query = applyBaselineFilter(query, filter);
    return (await query
      .select('*')
      .orderBy(opts.orderBy, opts.orderDir)
      .limit(opts.limit)
      .offset(opts.offset)) as BaselineRow[];
  }
}

function applyBaselineFilter(
  query: Knex.QueryBuilder,
  filter: BaselineQueryFilter,
): Knex.QueryBuilder {
  if (filter.projectId) query = query.where('project_id', filter.projectId);
  if (filter.status) query = query.where('status', filter.status);
  if (filter.versionLabelSearch) {
    query = query.whereILike('version_label', `%${filter.versionLabelSearch}%`);
  }
  return query;
}
