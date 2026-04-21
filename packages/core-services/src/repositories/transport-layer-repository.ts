/**
 * Repository for the `transport_layer` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '../db/base-repository.js';

export interface TransportLayerRow {
  [key: string]: unknown;
  id: string;
  signal_id: string;
  protocol_id: string;
  bus_id: string;
  protocol_attrs: Record<string, unknown>;
  bit_offset: number;
  bit_length: number;
  encoding: string;
  scale_factor: number;
  offset_value: number;
  byte_order: string;
}

export class TransportLayerRepository extends BaseRepository<TransportLayerRow> {
  constructor(knex: Knex) {
    super(knex, 'transport_layer');
  }

  async findBySignalId(signalId: string, trx?: Knex.Transaction): Promise<TransportLayerRow | undefined> {
    const row = await this.qb(trx).where('signal_id', signalId).first();
    return row as TransportLayerRow | undefined;
  }

  async deleteBySignalId(signalId: string, trx?: Knex.Transaction): Promise<boolean> {
    const count = await this.qb(trx).where('signal_id', signalId).del();
    return count > 0;
  }
}
