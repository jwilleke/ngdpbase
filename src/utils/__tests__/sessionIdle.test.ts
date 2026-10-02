/**
 * Session idle timeout (#1546): the limit, when a session has expired, and
 * when its last activity is written.
 */

import { effectiveIdleTimeoutMs, idleExpired, idleRemainingMs, idleTimeoutMs, shouldTouch, touchEveryMs, warnBeforeMs } from '../sessionIdle';

const MIN = 60_000;

describe('idleTimeoutMs', () => {
  test('0 is off, and so is anything that is not a positive number', () => {
    for (const v of [0, -5, NaN, Infinity, '15', null, undefined]) expect(idleTimeoutMs(v)).toBe(0);
  });

  test('minutes become milliseconds, with no upper cap', () => {
    expect(idleTimeoutMs(15)).toBe(15 * MIN);
    expect(idleTimeoutMs(100_000)).toBe(100_000 * MIN);
  });
});

describe('idleExpired', () => {
  const now = 1_000_000_000;

  test('idle past the limit is expired; within it is not', () => {
    expect(idleExpired(now - 15 * MIN - 1, now, 15 * MIN)).toBe(true);
    expect(idleExpired(now - 15 * MIN, now, 15 * MIN)).toBe(false);
    expect(idleExpired(now - MIN, now, 15 * MIN)).toBe(false);
  });

  test('off never expires a session, however idle', () => {
    expect(idleExpired(0, now, 0)).toBe(false);
  });

  test('a session with no recorded activity is not expired — it starts counting now', () => {
    expect(idleExpired(undefined, now, 15 * MIN)).toBe(false);
    expect(idleExpired('yesterday', now, 15 * MIN)).toBe(false);
  });
});

describe('shouldTouch', () => {
  const now = 1_000_000_000;

  test('writes once when nothing is recorded yet', () => {
    expect(shouldTouch(undefined, now, 15 * MIN)).toBe(true);
  });

  test('writes at most once a minute, so the session is not saved on every request', () => {
    expect(shouldTouch(now - 30_000, now, 15 * MIN)).toBe(false);
    expect(shouldTouch(now - MIN, now, 15 * MIN)).toBe(true);
  });

  test('a short limit writes more often, so the slack stays a quarter of it', () => {
    expect(touchEveryMs(2 * MIN)).toBe(30_000);
    expect(shouldTouch(now - 30_000, now, 2 * MIN)).toBe(true);
  });

  test('off never writes', () => {
    expect(shouldTouch(undefined, now, 0)).toBe(false);
  });
});

describe('effectiveIdleTimeoutMs — the shortest positive value applies', () => {
  test('nothing set anywhere: off', () => {
    expect(effectiveIdleTimeoutMs(0, [])).toBe(0);
    expect(effectiveIdleTimeoutMs(0, [undefined, 0])).toBe(0);
  });

  test('a role shortens the site value', () => {
    expect(effectiveIdleTimeoutMs(60, [15])).toBe(15 * MIN);
  });

  test('a role never lengthens it', () => {
    expect(effectiveIdleTimeoutMs(15, [60])).toBe(15 * MIN);
  });

  test('with the site off, a role still sets a limit for its holders', () => {
    expect(effectiveIdleTimeoutMs(0, [30, undefined])).toBe(30 * MIN);
  });

  test('of several roles, the shortest wins', () => {
    expect(effectiveIdleTimeoutMs(0, [30, 10, 20])).toBe(10 * MIN);
  });
});

describe('warnBeforeMs and idleRemainingMs', () => {
  test('warn two minutes before, or a quarter of a shorter limit', () => {
    expect(warnBeforeMs(30 * MIN)).toBe(2 * MIN);
    expect(warnBeforeMs(4 * MIN)).toBe(MIN);
  });

  test('remaining time, never negative; null without a limit', () => {
    expect(idleRemainingMs(1_000_000 - 5 * MIN, 1_000_000, 15 * MIN)).toBe(10 * MIN);
    expect(idleRemainingMs(0, 1_000_000_000, 15 * MIN)).toBe(0);
    expect(idleRemainingMs(undefined, 1, 15 * MIN)).toBe(15 * MIN);
    expect(idleRemainingMs(1, 1, 0)).toBeNull();
  });
});

