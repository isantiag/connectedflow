/**
 * Repository for the `user_role` join table.
 */

import { type Knex } from 'knex';

export interface UserRoleRow {
  [key: string]: unknown;
  user_id: string;
  role_id: string;
}

export class UserRoleRepository {
  constructor(
    private readonly knex: Knex,
    private readonly tableName = 'user_role',
  ) {}

  private qb(trx?: Knex.Transaction) {
    const builder = this.knex(this.tableName);
    return trx ? builder.transacting(trx) : builder;
  }

  async findByUserId(userId: string, trx?: Knex.Transaction): Promise<UserRoleRow[]> {
    return (await this.qb(trx).where({ user_id: userId }).select('*')) as UserRoleRow[];
  }

  async assign(userId: string, roleId: string, trx?: Knex.Transaction): Promise<void> {
    await this.qb(trx)
      .insert({ user_id: userId, role_id: roleId })
      .onConflict(['user_id', 'role_id'])
      .ignore();
  }

  async unassign(userId: string, roleId: string, trx?: Knex.Transaction): Promise<boolean> {
    const count = await this.qb(trx)
      .where({ user_id: userId, role_id: roleId })
      .del();
    return count > 0;
  }
}
