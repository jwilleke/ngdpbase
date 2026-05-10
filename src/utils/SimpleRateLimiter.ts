/**
 * Minimal in-memory per-key rate limiter (#658 iteration 3).
 *
 * Used for `/contact` POST to slow down trivial spam from a single client IP.
 * Not suitable for distributed deployments (each pod has its own counter).
 * For stronger protection across replicas, swap for a Redis-backed limiter
 * or wire `express-rate-limit` with a shared store — but adding a new
 * dependency for a single endpoint is overkill at the current scale.
 *
 * Implementation: per-key counter that resets when the window expires.
 * Memory grows with active-key cardinality; an opportunistic GC sweeps
 * expired entries on each `consume()` call so long-idle IPs don't pile up.
 */

export interface RateLimiterOptions {
  /** Max events allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether this event was allowed (within budget). */
  allowed: boolean;
  /** Events already counted in the current window (including this one if allowed). */
  count: number;
  /** Milliseconds until the current window expires and the count resets. */
  retryAfterMs: number;
}

interface BucketState {
  count: number;
  windowStart: number;
}

/**
 * Per-key rate limiter. `key` is typically `req.ip` for IP-based throttling.
 */
export class SimpleRateLimiter {
  private buckets = new Map<string, BucketState>();

  constructor(private opts: RateLimiterOptions) {}

  /**
   * Replace the options at runtime. Existing buckets are preserved — their
   * counters keep accruing under the new options. Used by `/contact` (#670
   * Phase E) to reflect operator config changes without restarting the app.
   *
   * Shrinking `windowMs` may cause in-flight buckets to be treated as expired
   * on the next consume (their `windowStart` is now older than the new
   * window); that's the desired semantics — operators tightening the limiter
   * shouldn't need to wait out the old window.
   */
  configure(opts: RateLimiterOptions): void {
    this.opts = opts;
  }

  /**
   * Record an event under `key` and return whether it should be allowed.
   *
   * - When the current window has expired, the counter resets to 1 and the
   *   event is allowed.
   * - Otherwise, the counter increments. If `count > max`, the event is
   *   denied; the bucket still records the attempt so a flood doesn't
   *   amortise back to "allowed" once the legit traffic stops.
   */
  consume(key: string, now: number = Date.now()): RateLimitResult {
    this.maybeGc(now);

    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStart >= this.opts.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return { allowed: true, count: 1, retryAfterMs: this.opts.windowMs };
    }

    bucket.count += 1;
    const elapsed = now - bucket.windowStart;
    const retryAfterMs = Math.max(0, this.opts.windowMs - elapsed);
    return { allowed: bucket.count <= this.opts.max, count: bucket.count, retryAfterMs };
  }

  /**
   * Drop all state. Test-only helper.
   */
  reset(): void {
    this.buckets.clear();
  }

  private lastGc = 0;

  private maybeGc(now: number): void {
    // Sweep expired buckets at most once per window length.
    if (now - this.lastGc < this.opts.windowMs) return;
    this.lastGc = now;
    for (const [k, b] of this.buckets) {
      if (now - b.windowStart >= this.opts.windowMs) this.buckets.delete(k);
    }
  }
}
