/**
 * Session idle timeout (#1546): the limit, when a session has expired, and
 * when its last activity is written.
 */

import { idleExpired, idleTimeoutMs, shouldTouch, touchEveryMs } from '../sessionIdle';

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
