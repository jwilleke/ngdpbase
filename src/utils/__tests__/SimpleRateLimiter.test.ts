import { SimpleRateLimiter } from '../SimpleRateLimiter';

describe('SimpleRateLimiter', () => {
  test('allows up to max events in a window', () => {
    const rl = new SimpleRateLimiter({ max: 3, windowMs: 60_000 });
    expect(rl.consume('1.2.3.4', 0).allowed).toBe(true);
    expect(rl.consume('1.2.3.4', 100).allowed).toBe(true);
    expect(rl.consume('1.2.3.4', 200).allowed).toBe(true);
  });

  test('denies the (max+1)th event in the same window', () => {
    const rl = new SimpleRateLimiter({ max: 3, windowMs: 60_000 });
    rl.consume('1.2.3.4', 0);
    rl.consume('1.2.3.4', 100);
    rl.consume('1.2.3.4', 200);
    const result = rl.consume('1.2.3.4', 300);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(4);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  test('resets the counter after the window expires', () => {
    const rl = new SimpleRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.consume('a', 0).allowed).toBe(true);
    expect(rl.consume('a', 500).allowed).toBe(false);
    expect(rl.consume('a', 1500).allowed).toBe(true);
  });

  test('separate keys have independent buckets', () => {
    const rl = new SimpleRateLimiter({ max: 1, windowMs: 60_000 });
    expect(rl.consume('a', 0).allowed).toBe(true);
    expect(rl.consume('b', 0).allowed).toBe(true);
    expect(rl.consume('a', 100).allowed).toBe(false);
    expect(rl.consume('b', 100).allowed).toBe(false);
  });

  test('over-limit event increments count without resetting (no amortization)', () => {
    const rl = new SimpleRateLimiter({ max: 2, windowMs: 60_000 });
    rl.consume('a', 0);
    rl.consume('a', 100);
    const a = rl.consume('a', 200); // 3
    const b = rl.consume('a', 300); // 4
    expect(a.allowed).toBe(false);
    expect(b.allowed).toBe(false);
    expect(b.count).toBe(4);
  });

  test('reset() clears all state', () => {
    const rl = new SimpleRateLimiter({ max: 1, windowMs: 60_000 });
    rl.consume('a');
    expect(rl.consume('a').allowed).toBe(false);
    rl.reset();
    expect(rl.consume('a').allowed).toBe(true);
  });

  test('retryAfterMs reflects remaining window time', () => {
    const rl = new SimpleRateLimiter({ max: 1, windowMs: 10_000 });
    rl.consume('a', 0);
    const denied = rl.consume('a', 3000);
    expect(denied.retryAfterMs).toBe(7000);
  });
});
