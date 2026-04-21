/**
 * Repository for the `user` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '../db/base-repository.js';

export interface UserRow {
  [key: string]: unknown;
  id: string;
  email: string;
  display_name: string;
  auth_provider: string;
  external_id: string | null;
  mfa_enabled: boolean;
  last_login: Date | null;
  created_at: Date;
}

export class UserRepository extends BaseRepository<UserRow> {
  constructor(knex: Knex) {
    super(knex, 'user');
  }

  async findByEmail(email: string, trx?: Knex.Transaction): Promise<UserRow | undefined> {
    const row = await this.qb(trx).where({ email }).first();
    return row as UserRow | undefined;
  }

  async findByExternalId(externalId: string, trx?: Knex.Transaction): Promise<UserRow | undefined> {
    const row = await this.qb(trx).where({ external_id: externalId }).first();
    return row as UserRow | undefined;
  }
}
