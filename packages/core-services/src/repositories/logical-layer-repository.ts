/**
 * Repository for the `logical_layer` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '../db/base-repository.js';

export interface LogicalLayerRow {
  [key: string]: unknown;
  id: string;
  signal_id: string;
  data_type: string;
  min_value: number | null;
  max_value: number | null;
  units: string;
  description: string;
  source_system: string;
  dest_system: string;
  refresh_rate_hz: number;
  functional_category: string;
}

export class LogicalLayerRepository extends BaseRepository<LogicalLayerRow> {
  constructor(knex: Knex) {
    super(knex, 'logical_layer');
  }

  async findBySignalId(signalId: string, trx?: Knex.Transaction): Promise<LogicalLayerRow | undefined> {
    const row = await this.qb(trx).where('signal_id', signalId).first();
    return row as LogicalLayerRow | undefined;
  }

  async deleteBySignalId(signalId: string, trx?: Knex.Transaction): Promise<boolean> {
    const count = await this.qb(trx).where('signal_id', signalId).del();
    return count > 0;
  }
}
