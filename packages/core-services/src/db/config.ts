/**
 * Database and Redis configuration.
 * Reads from environment variables with sensible defaults for local development.
 */

export interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** Minimum connections in the pool */
  poolMin: number;
  /** Maximum connections in the pool */
  poolMax: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  /** Key prefix for cache entries */
  keyPrefix: string;
  /** Max reconnect retries before giving up */
  maxRetriesPerRequest: number | null;
}

export interface DatabaseConfig {
  postgres: PostgresConfig;
  timescale: PostgresConfig;
  redis: RedisConfig;
}

function envOrDefault(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envIntOrDefault(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function loadDatabaseConfig(): DatabaseConfig {
  return {
    postgres: {
      host: envOrDefault('PG_HOST', 'localhost'),
      port: envIntOrDefault('PG_PORT', 5432),
      user: envOrDefault('PG_USER', 'connectedicd'),
      password: envOrDefault('PG_PASSWORD', 'connectedicd_dev'),
      database: envOrDefault('PG_DATABASE', 'connectedicd'),
      poolMin: envIntOrDefault('PG_POOL_MIN', 2),
      poolMax: envIntOrDefault('PG_POOL_MAX', 10),
    },
    timescale: {
      host: envOrDefault('TS_HOST', 'localhost'),
      port: envIntOrDefault('TS_PORT', 5433),
      user: envOrDefault('TS_USER', 'connectedicd'),
      password: envOrDefault('TS_PASSWORD', 'connectedicd_dev'),
      database: envOrDefault('TS_DATABASE', 'connectedicd_timeseries'),
      poolMin: envIntOrDefault('TS_POOL_MIN', 2),
      poolMax: envIntOrDefault('TS_POOL_MAX', 10),
    },
    redis: {
      host: envOrDefault('REDIS_HOST', 'localhost'),
      port: envIntOrDefault('REDIS_PORT', 6379),
      password: process.env['REDIS_PASSWORD'] || undefined,
      keyPrefix: envOrDefault('REDIS_KEY_PREFIX', 'cf:'),
      maxRetriesPerRequest: null,
    },
  };
}
