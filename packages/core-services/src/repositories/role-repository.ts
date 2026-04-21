/**
 * Repository for the `role` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '../db/base-repository.js';

export interface RoleRow {
  [key: string]: unknown;
  id: string;
  name: string;
  description: string;
}

export class RoleRepository extends BaseRepository<RoleRow> {
  constructor(knex: Knex) {
    super(knex, 'role');
  }

  async findByName(name: string, trx?: Knex.Transaction): Promise<RoleRow | undefined> {
    const row = await this.qb(trx).where({ name }).first();
    return row as RoleRow | undefined;
  }
}
