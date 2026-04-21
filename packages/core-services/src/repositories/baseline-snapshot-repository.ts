/**
 * Repository for the `baseline_snapshot` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '../db/base-repository.js';

export interface BaselineSnapshotRow {
  [key: string]: unknown;
  id: string;
  baseline_id: string;
  signal_id: string;
  logical_snapshot: Record<string, unknown>;
  transport_snapshot: Record<string, unknown>;
  physical_snapshot: Record<string, unknown>;
}

export class BaselineSnapshotRepository extends BaseRepository<BaselineSnapshotRow> {
  constructor(knex: Knex) {
    super(knex, 'baseline_snapshot');
  }

  async findByBaselineId(
    baselineId: string,
    trx?: Knex.Transaction,
  ): Promise<BaselineSnapshotRow[]> {
    return (await this.qb(trx)
      .where('baseline_id', baselineId)
      .select('*')) as BaselineSnapshotRow[];
  }

  async deleteByBaselineId(
    baselineId: string,
    trx?: Knex.Transaction,
  ): Promise<boolean> {
    const count = await this.qb(trx).where('baseline_id', baselineId).del();
    return count > 0;
  }
}
