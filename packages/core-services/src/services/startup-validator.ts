/**
 * System startup health check and configuration validator.
 *
 * Validates that all required services (PostgreSQL, TimescaleDB, Redis,
 * AI service, Hardware Adapter Manager) are reachable before reporting
 * the system as ready. Also provides resilience utilities: CircuitBreaker
 * and RetryWithBackoff.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServiceStatus = 'ok' | 'error';
export type OverallStatus = 'ready' | 'degraded' | 'failed';

export interface ServiceCheckResult {
  name: string;
  status: ServiceStatus;
  latencyMs: number;
  error?: string;
}

export interface StartupReport {
  overall: OverallStatus;
  services: ServiceCheckResult[];
  timestamp: Date;
}

/** A function that checks a single service's health. */
export interface ServiceChecker {
  name: string;
  check: () => Promise<void>;
  /** Timeout in ms for this check (default 5000). */
  timeoutMs?: number;
  /** If true, failure degrades rather than fails the system. */
  optional?: boolean;
}

// ---------------------------------------------------------------------------
// StartupValidator
// ---------------------------------------------------------------------------

export class StartupValidator {
  private readonly checkers: ServiceChecker[];

  constructor(checkers: ServiceChecker[]) {
    this.checkers = checkers;
  }

  async validate(): Promise<StartupReport> {
    const results = await Promise.all(
      this.checkers.map((c) => this.runCheck(c)),
    );

    const hasRequiredFailure = results.some(
      (r, i) => r.status === 'error' && !this.checkers[i].optional,
    );
    const hasOptionalFailure = results.some(
      (r, i) => r.status === 'error' && this.checkers[i].optional,
    );

    let overall: OverallStatus;
    if (hasRequiredFailure) {
      overall = 'failed';
    } else if (hasOptionalFailure) {
      overall = 'degraded';
    } else {
      overall = 'ready';
    }

    return { overall, services: results, timestamp: new Date() };
  }

  private async runCheck(checker: ServiceChecker): Promise<ServiceCheckResult> {
    const timeoutMs = checker.timeoutMs ?? 5000;
    const start = Date.now();

    try {
      await withTimeout(checker.check(), timeoutMs);
      return {
        name: checker.name,
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      return {
        name: checker.name,
        status: 'error',
        latencyMs: Date.now() - start,
        error: message,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// CircuitBreaker
// ---------------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening (default 5). */
  failureThreshold?: number;
  /** Cooldown in ms before transitioning to half-open (default 30000). */
  cooldownMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  /** Allows injecting a clock for testing. */
  now: () => number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
    this.now = () => Date.now();
  }

  getState(): CircuitState {
    if (this.state === 'open') {
      const elapsed = this.now() - this.lastFailureTime;
      if (elapsed >= this.cooldownMs) {
        this.state = 'half-open';
      }
    }
    return this.state;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.getState();

    if (current === 'open') {
      throw new Error('Circuit breaker is open');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = this.now();
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'open';
    }
  }
}

// ---------------------------------------------------------------------------
// RetryWithBackoff
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Maximum number of retries (default 3). */
  maxRetries?: number;
  /** Base delay in ms (default 1000). Doubles each retry. */
  baseDelayMs?: number;
  /** Delay function — override for testing. */
  delayFn?: (ms: number) => Promise<void>;
}

export class RetryWithBackoff {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly delayFn: (ms: number) => Promise<void>;

  constructor(opts: RetryOptions = {}) {
    this.maxRetries = opts.maxRetries ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 1000;
    this.delayFn =
      opts.delayFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          const delay = this.baseDelayMs * Math.pow(2, attempt);
          await this.delayFn(delay);
        }
      }
    }
    throw lastError;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
