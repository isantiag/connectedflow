/**
 * Repository for the `physical_layer` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '../db/base-repository.js';

export interface PhysicalLayerRow {
  [key: string]: unknown;
  id: string;
  signal_id: string;
  connector_id: string;
  pin_number: string;
  cable_bundle_id: string;
  wire_gauge: string;
  wire_color: string;
  wire_type: string;
  max_length_m: number;
  shielding: string;
}

export class PhysicalLayerRepository extends BaseRepository<PhysicalLayerRow> {
  constructor(knex: Knex) {
    super(knex, 'physical_layer');
  }

  async findBySignalId(signalId: string, trx?: Knex.Transaction): Promise<PhysicalLayerRow | undefined> {
    const row = await this.qb(trx).where('signal_id', signalId).first();
    return row as PhysicalLayerRow | undefined;
  }

  async deleteBySignalId(signalId: string, trx?: Knex.Transaction): Promise<boolean> {
    const count = await this.qb(trx).where('signal_id', signalId).del();
    return count > 0;
  }
}
