/**
 * Base repository providing common data-access patterns and transaction support.
 *
 * Concrete repositories extend this class, specifying the table name and
 * primary key column. The `trx` parameter on every method allows callers to
 * compose multiple repository calls inside a single database transaction.
 */

import { type Knex } from 'knex';

export interface FindOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
}

export class BaseRepository<TRow extends Record<string, unknown>> {
  constructor(
    protected readonly knex: Knex,
    protected readonly tableName: string,
    protected readonly primaryKey: string = 'id',
  ) {}

  // ---------------------------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------------------------

  /** Return the query builder, optionally scoped to a transaction. */
  protected qb(trx?: Knex.Transaction): Knex.QueryBuilder {
    const builder = this.knex(this.tableName);
    return trx ? builder.transacting(trx) : builder;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async findById(id: string, trx?: Knex.Transaction): Promise<TRow | undefined> {
    const row = await this.qb(trx)
      .where({ [this.primaryKey]: id })
      .first();
    return row as TRow | undefined;
  }

  async findAll(opts: FindOptions = {}, trx?: Knex.Transaction): Promise<TRow[]> {
    let query = this.qb(trx);
    if (opts.orderBy) {
      query = query.orderBy(opts.orderBy, opts.orderDir ?? 'asc');
    }
    if (opts.limit !== undefined) query = query.limit(opts.limit);
    if (opts.offset !== undefined) query = query.offset(opts.offset);
    return (await query.select('*')) as TRow[];
  }

  async findWhere(
    conditions: Partial<TRow>,
    opts: FindOptions = {},
    trx?: Knex.Transaction,
  ): Promise<TRow[]> {
    let query = this.qb(trx).where(conditions as Record<string, unknown>);
    if (opts.orderBy) {
      query = query.orderBy(opts.orderBy, opts.orderDir ?? 'asc');
    }
    if (opts.limit !== undefined) query = query.limit(opts.limit);
    if (opts.offset !== undefined) query = query.offset(opts.offset);
    return (await query.select('*')) as TRow[];
  }

  async count(
    conditions: Partial<TRow> = {} as Partial<TRow>,
    trx?: Knex.Transaction,
  ): Promise<number> {
    const result = await this.qb(trx)
      .where(conditions as Record<string, unknown>)
      .count({ count: '*' })
      .first();
    return Number((result as Record<string, unknown>)?.count ?? 0);
  }

  async insert(data: Partial<TRow>, trx?: Knex.Transaction): Promise<TRow> {
    const [row] = await this.qb(trx)
      .insert(data as Record<string, unknown>)
      .returning('*');
    return row as TRow;
  }

  async insertMany(rows: Partial<TRow>[], trx?: Knex.Transaction): Promise<TRow[]> {
    if (rows.length === 0) return [];
    const inserted = await this.qb(trx)
      .insert(rows as Record<string, unknown>[])
      .returning('*');
    return inserted as TRow[];
  }

  async update(
    id: string,
    data: Partial<TRow>,
    trx?: Knex.Transaction,
  ): Promise<TRow | undefined> {
    const [row] = await this.qb(trx)
      .where({ [this.primaryKey]: id })
      .update(data as Record<string, unknown>)
      .returning('*');
    return row as TRow | undefined;
  }

  async delete(id: string, trx?: Knex.Transaction): Promise<boolean> {
    const count = await this.qb(trx)
      .where({ [this.primaryKey]: id })
      .del();
    return count > 0;
  }

  // ---------------------------------------------------------------------------
  // Transaction support
  // ---------------------------------------------------------------------------

  /**
   * Execute `fn` inside a database transaction.
   * The transaction is committed if `fn` resolves, rolled back if it rejects.
   */
  async withTransaction<T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    return this.knex.transaction(fn);
  }
}
