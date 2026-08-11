/**
 * LoginThrottle — failure-driven backoff for login (#1044).
 *
 * Password login accepted unlimited attempts: no rate limit, no lockout, no
 * backoff, against a username (`admin`) that exists on every instance.
 *
 * Time is passed in explicitly on every call rather than faked globally, so
 * these tests state the exact instant they mean and cannot drift.
 */

import { LoginThrottle } from '../LoginThrottle';

const MIN = 60_000;

const make = () => new LoginThrottle({
  maxAttempts: 3,
  windowMs: 10 * MIN,
  baseLockMs: 1 * MIN,
  maxLockMs: 8 * MIN
});

describe('LoginThrottle locks after repeated failures (#1044)', () => {
  test('an unknown key is never blocked', () => {
    expect(make().check('user:nobody', 0)).toMatchObject({ blocked: false, failures: 0 });
  });

  test('failures below the limit do not block', () => {
    const t = make();
    t.recordFailure('user:admin', 0);
    t.recordFailure('user:admin', 1000);

    expect(t.check('user:admin', 2000).blocked).toBe(false);
  });

  test('the attempt that reaches the limit locks, and says so', () => {
    const t = make();
    t.recordFailure('user:admin', 0);
    t.recordFailure('user:admin', 1000);
    const third = t.recordFailure('user:admin', 2000);

    expect(third.justLocked).toBe(true);
    expect(third.blocked).toBe(true);
    expect(t.check('user:admin', 2000).blocked).toBe(true);
  });

  test('justLocked is true only ONCE per lock', () => {
    // The caller audits on justLocked; repeating it every subsequent attempt
    // would bury the signal in its own noise.
    const t = make();
    t.recordFailure('user:admin', 0);
    t.recordFailure('user:admin', 1);
    expect(t.recordFailure('user:admin', 2).justLocked).toBe(true);
    expect(t.recordFailure('user:admin', 3).justLocked).toBe(false);
    expect(t.recordFailure('user:admin', 4).justLocked).toBe(false);
  });
});

describe('locks always expire (#1044)', () => {
  test('the key unlocks by itself once the wait elapses', () => {
    // A permanent lock on a known username is a denial-of-service vector
    // against the operator — anyone could lock `admin` out of their instance.
    const t = make();
    let lockedAt = 0;
    for (let i = 0; i < 3; i++) { lockedAt = i; t.recordFailure('user:admin', i); }

    // The clock starts at the failure that CAUSED the lock, not at the first
    // failure — measuring from 0 is off by the couple of ms between them.
    expect(t.check('user:admin', lockedAt + 30_000).blocked).toBe(true);
    expect(t.check('user:admin', lockedAt + 1 * MIN + 1).blocked).toBe(false);
  });

  test('retryAfterMs counts down toward the unlock', () => {
    const t = make();
    for (let i = 0; i < 3; i++) t.recordFailure('user:admin', 0);

    const early = t.check('user:admin', 10_000).retryAfterMs;
    const later = t.check('user:admin', 40_000).retryAfterMs;

    expect(early).toBeGreaterThan(later);
    expect(later).toBeGreaterThan(0);
  });
});

describe('backoff doubles for a persistent attacker (#1044)', () => {
  test('the second lock waits twice as long as the first', () => {
    const t = make();
    for (let i = 0; i < 3; i++) t.recordFailure('user:admin', i);
    expect(t.check('user:admin', 0).retryAfterMs).toBeCloseTo(1 * MIN, -3);

    // Wait out the first lock, then fail three more times.
    const after = 1 * MIN + 1;
    for (let i = 0; i < 3; i++) t.recordFailure('user:admin', after + i);

    expect(t.check('user:admin', after).retryAfterMs).toBeGreaterThan(1.9 * MIN);
  });

  test('the doubling is capped', () => {
    const t = make(); // cap 8 minutes
    let now = 0;
    for (let round = 0; round < 8; round++) {
      for (let i = 0; i < 3; i++) t.recordFailure('user:admin', now + i);
      now += 60 * MIN; // well past any lock
    }
    for (let i = 0; i < 3; i++) t.recordFailure('user:admin', now + i);

    expect(t.check('user:admin', now).retryAfterMs).toBeLessThanOrEqual(8 * MIN);
  });
});

describe('success and time both forgive (#1044)', () => {
  test('a success clears the record, so a typo costs nothing', () => {
    const t = make();
    t.recordFailure('user:admin', 0);
    t.recordFailure('user:admin', 1);
    t.recordSuccess('user:admin');

    // Back to a full budget — the next two failures must not lock.
    t.recordFailure('user:admin', 2);
    t.recordFailure('user:admin', 3);
    expect(t.check('user:admin', 4).blocked).toBe(false);
  });

  test('a success also resets the escalation, not just the count', () => {
    const t = make();
    for (let i = 0; i < 3; i++) t.recordFailure('user:admin', i);   // lock #1
    t.recordSuccess('user:admin');

    const after = 5 * MIN;
    let second = { retryAfterMs: 0 };
    for (let i = 0; i < 3; i++) second = t.recordFailure('user:admin', after + i);

    // Back to the BASE lock, not a doubled one. Read the value off the call
    // that created the lock, so there is no gap to account for.
    expect(second.retryAfterMs).toBeLessThanOrEqual(1 * MIN);
  });

  test('failures older than the window are forgotten', () => {
    const t = make();
    t.recordFailure('user:admin', 0);
    t.recordFailure('user:admin', 1000);

    // Two more, but long after the window — must not add to the old pair.
    const later = 11 * MIN;
    t.recordFailure('user:admin', later);
    t.recordFailure('user:admin', later + 1);

    expect(t.check('user:admin', later + 2).blocked).toBe(false);
  });
});

describe('keys are independent (#1044)', () => {
  test('locking one username does not affect another', () => {
    const t = make();
    for (let i = 0; i < 3; i++) t.recordFailure('user:admin', i);

    expect(t.check('user:admin', 0).blocked).toBe(true);
    expect(t.check('user:someone-else', 0).blocked).toBe(false);
  });

  test('locking a username does not lock an unrelated IP', () => {
    const t = make();
    for (let i = 0; i < 3; i++) t.recordFailure('user:admin', i);

    expect(t.check('ip:10.0.0.9', 0).blocked).toBe(false);
  });
});

describe('configure() applies without losing state (#1044)', () => {
  test('tightening the limit takes effect immediately', () => {
    const t = make();
    t.recordFailure('user:admin', 0);
    t.configure({ maxAttempts: 2, windowMs: 10 * MIN, baseLockMs: 1 * MIN, maxLockMs: 8 * MIN });

    expect(t.recordFailure('user:admin', 1).justLocked).toBe(true);
  });
});
