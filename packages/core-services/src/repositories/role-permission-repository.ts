/**
 * Repository for the `role_permission` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '../db/base-repository.js';

export interface RolePermissionRow {
  [key: string]: unknown;
  id: string;
  role_id: string;
  resource: string;
  action: string;
}

export class RolePermissionRepository extends BaseRepository<RolePermissionRow> {
  constructor(knex: Knex) {
    super(knex, 'role_permission');
  }

  async findByRoleId(roleId: string, trx?: Knex.Transaction): Promise<RolePermissionRow[]> {
    return (await this.qb(trx).where({ role_id: roleId }).select('*')) as RolePermissionRow[];
  }

  async findByRoleIds(roleIds: string[], trx?: Knex.Transaction): Promise<RolePermissionRow[]> {
    if (roleIds.length === 0) return [];
    return (await this.qb(trx).whereIn('role_id', roleIds).select('*')) as RolePermissionRow[];
  }
}
