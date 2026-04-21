/**
 * Repository for the `signal` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '../db/base-repository.js';

export interface SignalRow {
  [key: string]: unknown;
  id: string;
  name: string;
  project_id: string;
  status: string;
  criticality: string;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  version: number;
}

export class SignalRepository extends BaseRepository<SignalRow> {
  constructor(knex: Knex) {
    super(knex, 'signal');
  }

  async findByIdWithVersion(
    id: string,
    expectedVersion: number,
    trx?: Knex.Transaction,
  ): Promise<SignalRow | undefined> {
    const row = await this.qb(trx)
      .where({ id, version: expectedVersion })
      .first();
    return row as SignalRow | undefined;
  }

  async countWithFilter(
    filter: SignalQueryFilter,
    trx?: Knex.Transaction,
  ): Promise<number> {
    let query = this.qb(trx);
    query = applyFilter(query, filter);
    const result = await query.count({ count: '*' }).first();
    return Number((result as Record<string, unknown>)?.count ?? 0);
  }

  async findWithFilter(
    filter: SignalQueryFilter,
    opts: { limit: number; offset: number; orderBy: string; orderDir: 'asc' | 'desc' },
    trx?: Knex.Transaction,
  ): Promise<SignalRow[]> {
    let query = this.qb(trx);
    query = applyFilter(query, filter);
    return (await query
      .select('*')
      .orderBy(opts.orderBy, opts.orderDir)
      .limit(opts.limit)
      .offset(opts.offset)) as SignalRow[];
  }
}

export interface SignalQueryFilter {
  projectId?: string;
  status?: string;
  criticality?: string;
  nameSearch?: string;
}

function applyFilter(
  query: Knex.QueryBuilder,
  filter: SignalQueryFilter,
): Knex.QueryBuilder {
  if (filter.projectId) query = query.where('project_id', filter.projectId);
  if (filter.status) query = query.where('status', filter.status);
  if (filter.criticality) query = query.where('criticality', filter.criticality);
  if (filter.nameSearch) query = query.whereILike('name', `%${filter.nameSearch}%`);
  return query;
}
