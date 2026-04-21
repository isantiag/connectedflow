/**
 * Connection factory for PostgreSQL (via Knex) and Redis (via ioredis).
 * Provides singleton-style access with explicit lifecycle management.
 */

import Knex, { type Knex as KnexType } from 'knex';
import Redis from 'ioredis';
import {
  type DatabaseConfig,
  type PostgresConfig,
  loadDatabaseConfig,
} from './config.js';

// ---------------------------------------------------------------------------
// Knex helpers
// ---------------------------------------------------------------------------

function buildKnexConfig(pg: PostgresConfig): KnexType.Config {
  return {
    client: 'pg',
    connection: {
      host: pg.host,
      port: pg.port,
      user: pg.user,
      password: pg.password,
      database: pg.database,
    },
    pool: {
      min: pg.poolMin,
      max: pg.poolMax,
      acquireTimeoutMillis: 30_000,
      idleTimeoutMillis: 30_000,
    },
  };
}

// ---------------------------------------------------------------------------
// ConnectionManager
// ---------------------------------------------------------------------------

export class ConnectionManager {
  private pgKnex: KnexType | null = null;
  private tsKnex: KnexType | null = null;
  private redisClient: Redis | null = null;
  private redisSub: Redis | null = null;
  private readonly config: DatabaseConfig;

  constructor(config?: DatabaseConfig) {
    this.config = config ?? loadDatabaseConfig();
  }

  /** Primary PostgreSQL connection (ICD data). */
  getPostgres(): KnexType {
    if (!this.pgKnex) {
      this.pgKnex = Knex(buildKnexConfig(this.config.postgres));
    }
    return this.pgKnex;
  }

  /** TimescaleDB connection (live data / time-series). */
  getTimescale(): KnexType {
    if (!this.tsKnex) {
      this.tsKnex = Knex(buildKnexConfig(this.config.timescale));
    }
    return this.tsKnex;
  }

  /** Redis client for caching and general commands. */
  getRedis(): Redis {
    if (!this.redisClient) {
      this.redisClient = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        keyPrefix: this.config.redis.keyPrefix,
        maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
        lazyConnect: true,
      });
    }
    return this.redisClient;
  }

  /** Dedicated Redis client for pub/sub subscriptions. */
  getRedisSub(): Redis {
    if (!this.redisSub) {
      this.redisSub = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
        lazyConnect: true,
      });
    }
    return this.redisSub;
  }

  /** Health-check: verify all connections are reachable. */
  async healthCheck(): Promise<{
    postgres: boolean;
    timescale: boolean;
    redis: boolean;
  }> {
    const check = async (fn: () => Promise<unknown>): Promise<boolean> => {
      try {
        await fn();
        return true;
      } catch {
        return false;
      }
    };

    const [postgres, timescale, redis] = await Promise.all([
      check(() => this.getPostgres().raw('SELECT 1')),
      check(() => this.getTimescale().raw('SELECT 1')),
      check(async () => {
        const r = this.getRedis();
        await r.connect();
        await r.ping();
      }),
    ]);

    return { postgres, timescale, redis };
  }

  /** Gracefully close all connections. */
  async destroy(): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    if (this.pgKnex) tasks.push(this.pgKnex.destroy());
    if (this.tsKnex) tasks.push(this.tsKnex.destroy());
    if (this.redisClient) tasks.push(this.redisClient.quit());
    if (this.redisSub) tasks.push(this.redisSub.quit());
    await Promise.all(tasks);
    this.pgKnex = null;
    this.tsKnex = null;
    this.redisClient = null;
    this.redisSub = null;
  }
}
