/**
 * LoginThrottle — failure-driven backoff for credential endpoints (#1044).
 *
 * Password login accepted unlimited attempts: no rate limit, no lockout, no
 * backoff. `admin` is a known username on every instance, so an attacker could
 * guess as fast as the server would answer, indefinitely. Magic-link requests
 * and the contact form both throttled themselves; the one path that checks a
 * password did not.
 *
 * ## Why not reuse SimpleRateLimiter
 *
 * That limiter counts *every* event in a fixed window, which is right for
 * "at most N contact submissions an hour". Login needs different semantics:
 *
 *   - only FAILURES count — a busy legitimate user must never be throttled
 *   - a success CLEARS the record, so a fat-fingered password costs nothing
 *   - repeated lockouts back off further, so a patient attacker gets slower
 *     while an ordinary typo-then-correct user notices nothing
 *
 * ## Backoff, never a permanent lock
 *
 * A permanent lock on a known username is a denial-of-service vector against
 * the operator: anyone could lock `admin` out of their own instance by typing
 * a wrong password often enough. Every lock here expires on its own, and the
 * doubling is capped.
 *
 * Consecutive lockouts double the wait — 1, 2, 4, 8 minutes and so on to the
 * cap. The counter of consecutive lockouts is reset by a single success, so
 * the escalation only affects someone who keeps failing.
 *
 * ## Scope
 *
 * In-memory and per-process, like SimpleRateLimiter. Across replicas each pod
 * counts separately, which weakens but does not defeat it. A shared store is
 * the upgrade path if this ever runs multi-replica; not worth a dependency at
 * the current scale.
 */

export interface LoginThrottleOptions {
  /** Failures allowed within the window before the key is locked. */
  maxAttempts: number;
  /** How long failures are remembered, in milliseconds. */
  windowMs: number;
  /** Lock duration for a first lockout, in milliseconds. Doubles each time. */
  baseLockMs: number;
  /** Ceiling for the doubling, in milliseconds. */
  maxLockMs: number;
}

export interface ThrottleState {
  /** True when the key is currently locked out. */
  blocked: boolean;
  /** Milliseconds until the lock expires. 0 when not blocked. */
  retryAfterMs: number;
  /** Failures recorded in the current window. */
  failures: number;
}

interface Entry {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
  /** Consecutive lockouts, for the doubling. Cleared by a success. */
  lockCount: number;
}

export class LoginThrottle {
  private entries = new Map<string, Entry>();
  private lastGc = 0;

  constructor(private opts: LoginThrottleOptions) {}

  /** Replace options at runtime so operator config changes need no restart. */
  configure(opts: LoginThrottleOptions): void {
    this.opts = opts;
  }

  /**
   * Is this key currently locked? Read-only — call before checking a password
   * so a locked key never reaches the verifier at all.
   */
  check(key: string, now: number = Date.now()): ThrottleState {
    const entry = this.entries.get(key);
    if (!entry) return { blocked: false, retryAfterMs: 0, failures: 0 };

    if (entry.lockedUntil > now) {
      return { blocked: true, retryAfterMs: entry.lockedUntil - now, failures: entry.failures };
    }

    // Window elapsed with no lock in force — the record is stale.
    if (now - entry.firstFailureAt >= this.opts.windowMs) {
      return { blocked: false, retryAfterMs: 0, failures: 0 };
    }

    return { blocked: false, retryAfterMs: 0, failures: entry.failures };
  }

  /**
   * Record a failed attempt. Returns the state AFTER recording, so the caller
   * can tell whether this attempt is the one that caused a lock — worth an
   * audit entry, where an ordinary failure is not.
   */
  recordFailure(key: string, now: number = Date.now()): ThrottleState & { justLocked: boolean } {
    this.maybeGc(now);

    let entry = this.entries.get(key);

    // Start a fresh window when there is no record, or the previous one aged
    // out. A lock still in force keeps its entry.
    if (!entry || (entry.lockedUntil <= now && now - entry.firstFailureAt >= this.opts.windowMs)) {
      entry = { failures: 0, firstFailureAt: now, lockedUntil: 0, lockCount: 0 };
      this.entries.set(key, entry);
    }

    entry.failures += 1;

    const alreadyLocked = entry.lockedUntil > now;
    let justLocked = false;

    if (!alreadyLocked && entry.failures >= this.opts.maxAttempts) {
      entry.lockCount += 1;
      const lockMs = Math.min(
        this.opts.maxLockMs,
        this.opts.baseLockMs * Math.pow(2, entry.lockCount - 1)
      );
      entry.lockedUntil = now + lockMs;
      // Reset the counter so the next lock needs another full run of failures
      // rather than tripping on every single attempt after the first lock.
      entry.failures = 0;
      entry.firstFailureAt = now;
      justLocked = true;
    }

    const blocked = entry.lockedUntil > now;
    return {
      blocked,
      retryAfterMs: blocked ? entry.lockedUntil - now : 0,
      failures: entry.failures,
      justLocked
    };
  }

  /**
   * Clear a key after a successful login. Also clears the consecutive-lockout
   * count, so escalation only ever affects someone who keeps failing.
   */
  recordSuccess(key: string): void {
    this.entries.delete(key);
  }

  /** Drop all state. Test-only helper. */
  reset(): void {
    this.entries.clear();
    this.lastGc = 0;
  }

  /** Sweep entries that are neither locked nor inside their window. */
  private maybeGc(now: number): void {
    if (now - this.lastGc < this.opts.windowMs) return;
    this.lastGc = now;
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil <= now && now - entry.firstFailureAt >= this.opts.windowMs) {
        this.entries.delete(key);
      }
    }
  }
}

export default LoginThrottle;
