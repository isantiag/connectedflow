/**
 * Unit tests for StartupValidator, CircuitBreaker, and RetryWithBackoff.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  StartupValidator,
  CircuitBreaker,
  RetryWithBackoff,
  type ServiceChecker,
} from './startup-validator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okChecker(name: string, delayMs = 0): ServiceChecker {
  return {
    name,
    check: () => new Promise((r) => setTimeout(r, delayMs)),
  };
}

function failChecker(name: string, error = 'unreachable'): ServiceChecker {
  return {
    name,
    check: () => Promise.reject(new Error(error)),
  };
}

function optionalFailChecker(name: string): ServiceChecker {
  return {
    name,
    check: () => Promise.reject(new Error('down')),
    optional: true,
  };
}

// ---------------------------------------------------------------------------
// StartupValidator
// ---------------------------------------------------------------------------

describe('StartupValidator', () => {
  it('reports ready when all required services pass', async () => {
    const validator = new StartupValidator([
      okChecker('PostgreSQL'),
      okChecker('TimescaleDB'),
      okChecker('Redis'),
      okChecker('AI Service'),
      okChecker('Adapter Manager'),
    ]);

    const report = await validator.validate();
    expect(report.overall).toBe('ready');
    expect(report.services).toHaveLength(5);
    report.services.forEach((s) => {
      expect(s.status).toBe('ok');
      expect(s.latencyMs).toBeGreaterThanOrEqual(0);
      expect(s.error).toBeUndefined();
    });
  });

  it('reports failed when a required service is unreachable', async () => {
    const validator = new StartupValidator([
      okChecker('PostgreSQL'),
      failChecker('Redis', 'connection refused'),
      okChecker('AI Service'),
    ]);

    const report = await validator.validate();
    expect(report.overall).toBe('failed');

    const redis = report.services.find((s) => s.name === 'Redis')!;
    expect(redis.status).toBe('error');
    expect(redis.error).toBe('connection refused');
  });

  it('reports degraded when only optional services fail', async () => {
    const validator = new StartupValidator([
      okChecker('PostgreSQL'),
      okChecker('Redis'),
      optionalFailChecker('Adapter Manager'),
    ]);

    const report = await validator.validate();
    expect(report.overall).toBe('degraded');
  });

  it('reports failed when required + optional both fail', async () => {
    const validator = new StartupValidator([
      failChecker('PostgreSQL'),
      optionalFailChecker('Adapter Manager'),
    ]);

    const report = await validator.validate();
    expect(report.overall).toBe('failed');
  });

  it('times out slow service checks', async () => {
    const slowChecker: ServiceChecker = {
      name: 'SlowDB',
      check: () => new Promise((r) => setTimeout(r, 10_000)),
      timeoutMs: 50,
    };

    const validator = new StartupValidator([slowChecker]);
    const report = await validator.validate();

    expect(report.overall).toBe('failed');
    expect(report.services[0].status).toBe('error');
    expect(report.services[0].error).toContain('Timed out');
  });

  it('includes per-service latency measurements', async () => {
    const validator = new StartupValidator([okChecker('DB', 20)]);
    const report = await validator.validate();
    expect(report.services[0].latencyMs).toBeGreaterThanOrEqual(15);
  });

  it('includes a timestamp in the report', async () => {
    const validator = new StartupValidator([okChecker('DB')]);
    const before = new Date();
    const report = await validator.validate();
    expect(report.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('handles empty checker list as ready', async () => {
    const validator = new StartupValidator([]);
    const report = await validator.validate();
    expect(report.overall).toBe('ready');
    expect(report.services).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

describe('CircuitBreaker', () => {
  it('starts in closed state', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe('closed');
  });

  it('stays closed on successful calls', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    await cb.call(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe('closed');
  });

  it('opens after N consecutive failures', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    const fail = () => Promise.reject(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.call(fail)).rejects.toThrow('fail');
    }
    expect(cb.getState()).toBe('open');
  });

  it('rejects calls immediately when open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    await expect(cb.call(() => Promise.reject(new Error('x')))).rejects.toThrow();
    await expect(cb.call(() => Promise.resolve('ok'))).rejects.toThrow(
      'Circuit breaker is open',
    );
  });

  it('transitions to half-open after cooldown', async () => {
    let time = 0;
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100 });
    cb.now = () => time;

    await expect(cb.call(() => Promise.reject(new Error('x')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    time = 100;
    expect(cb.getState()).toBe('half-open');
  });

  it('closes again on success in half-open state', async () => {
    let time = 0;
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100 });
    cb.now = () => time;

    await expect(cb.call(() => Promise.reject(new Error('x')))).rejects.toThrow();
    time = 100;
    expect(cb.getState()).toBe('half-open');

    await cb.call(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe('closed');
  });

  it('re-opens on failure in half-open state', async () => {
    let time = 0;
    const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 100 });
    cb.now = () => time;

    await expect(cb.call(() => Promise.reject(new Error('x')))).rejects.toThrow();
    time = 100;

    await expect(cb.call(() => Promise.reject(new Error('y')))).rejects.toThrow();
    expect(cb.getState()).toBe('open');
  });

  it('resets failure count on success', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    const fail = () => Promise.reject(new Error('fail'));

    await expect(cb.call(fail)).rejects.toThrow();
    await expect(cb.call(fail)).rejects.toThrow();
    // 2 failures, then a success resets
    await cb.call(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe('closed');

    // Need 3 more failures to open
    await expect(cb.call(fail)).rejects.toThrow();
    await expect(cb.call(fail)).rejects.toThrow();
    expect(cb.getState()).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// RetryWithBackoff
// ---------------------------------------------------------------------------

describe('RetryWithBackoff', () => {
  it('returns result on first success', async () => {
    const retry = new RetryWithBackoff({ delayFn: () => Promise.resolve() });
    const result = await retry.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it('retries on failure and succeeds', async () => {
    const retry = new RetryWithBackoff({
      maxRetries: 3,
      delayFn: () => Promise.resolve(),
    });

    let attempts = 0;
    const result = await retry.execute(() => {
      attempts++;
      if (attempts < 3) throw new Error('transient');
      return Promise.resolve('done');
    });

    expect(result).toBe('done');
    expect(attempts).toBe(3);
  });

  it('throws after exhausting retries', async () => {
    const retry = new RetryWithBackoff({
      maxRetries: 2,
      delayFn: () => Promise.resolve(),
    });

    await expect(
      retry.execute(() => Promise.reject(new Error('persistent'))),
    ).rejects.toThrow('persistent');
  });

  it('applies exponential backoff delays', async () => {
    const delays: number[] = [];
    const retry = new RetryWithBackoff({
      maxRetries: 3,
      baseDelayMs: 1000,
      delayFn: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });

    await expect(
      retry.execute(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow();

    // 3 retries → delays at 1000, 2000, 4000
    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it('does not delay on first attempt', async () => {
    const delayFn = vi.fn(() => Promise.resolve());
    const retry = new RetryWithBackoff({ maxRetries: 0, delayFn });

    await expect(
      retry.execute(() => Promise.reject(new Error('fail'))),
    ).rejects.toThrow();

    expect(delayFn).not.toHaveBeenCalled();
  });
});
