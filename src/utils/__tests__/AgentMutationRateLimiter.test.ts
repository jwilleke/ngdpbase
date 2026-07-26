/**
 * @file AgentMutationRateLimiter.test.ts
 * @description #946 slice 2 — the token-mutation rate limiter.
 *
 * Deferred in slice 1 because ingest is an idempotent upsert. Delete and rename
 * are neither idempotent nor self-correcting, and a token runs unattended for up
 * to 24 hours.
 */
import { SimpleRateLimiter } from '../SimpleRateLimiter';

describe('agent mutation rate limiter (#946 slice 2)', () => {
  const OPTS = { max: 60, windowMs: 60 * 1000 };

  test('allows a legitimate editing rate', () => {
    const limiter = new SimpleRateLimiter(OPTS);
    for (let i = 0; i < 60; i++) {
      expect(limiter.consume('tok_a').allowed).toBe(true);
    }
  });

  test('stops a runaway loop once the budget is spent', () => {
    const limiter = new SimpleRateLimiter(OPTS);
    for (let i = 0; i < 60; i++) limiter.consume('tok_a');

    const blocked = limiter.consume('tok_a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  test('one runaway token does not starve another', () => {
    // Keyed by token id precisely so a misbehaving agent is contained.
    const limiter = new SimpleRateLimiter(OPTS);
    for (let i = 0; i < 61; i++) limiter.consume('tok_runaway');

    expect(limiter.consume('tok_runaway').allowed).toBe(false);
    expect(limiter.consume('tok_wellbehaved').allowed).toBe(true);
  });

  test('the budget refills after the window', () => {
    vi.useFakeTimers();
    try {
      const limiter = new SimpleRateLimiter(OPTS);
      for (let i = 0; i < 61; i++) limiter.consume('tok_a');
      expect(limiter.consume('tok_a').allowed).toBe(false);

      vi.advanceTimersByTime(60 * 1000 + 1);

      expect(limiter.consume('tok_a').allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
