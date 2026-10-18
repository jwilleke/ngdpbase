/**
 * Session limits (#1767): the absolute cap from sign-in beside the idle
 * timeout (#1546), checked per request by `checkSessionLimits` — and the
 * shipped defaults the issue decided.
 */
import fs from 'node:fs';
import path from 'node:path';
import { anonymousSessionMs, capExpired, checkSessionLimits, DEFAULT_SESSION_MAX_AGE_MS, sessionCapMs } from '../sessionLimits';
import { effectiveIdleTimeoutMs } from '../sessionIdle';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Requests every `everyMs` from `signedInAt`, writing what the check says to write; returns when it ended and why. */
function runSession(signedInAt: number, everyMs: number, untilMs: number, limits: { idleMs: number; capMs: number }) {
  const session: { signedInAt?: number; lastActivity?: number } = { signedInAt };
  for (let now = signedInAt; now <= signedInAt + untilMs; now += everyMs) {
    const verdict = checkSessionLimits(session, now, limits);
    if (verdict.end) return { endedAt: now - signedInAt, reason: verdict.end };
    if (verdict.stampSignedIn) session.signedInAt = now;
    if (verdict.touch) session.lastActivity = now;
  }
  return { endedAt: null, reason: null };
}

describe('sessionCapMs', () => {
  test('a positive number of milliseconds is the cap', () => {
    expect(sessionCapMs(8 * HOUR)).toBe(8 * HOUR);
  });

  test('anything else is the shipped 30 days — there is no off', () => {
    for (const v of [0, -1, NaN, Infinity, '86400000', null, undefined]) expect(sessionCapMs(v)).toBe(30 * DAY);
    expect(DEFAULT_SESSION_MAX_AGE_MS).toBe(30 * DAY);
  });
});

describe('anonymousSessionMs', () => {
  test('a day, or the cap when that is shorter', () => {
    expect(anonymousSessionMs(30 * DAY)).toBe(DAY);
    expect(anonymousSessionMs(HOUR)).toBe(HOUR);
  });

  test('ngdpbase.session.anonymous-max-age sets it, never longer than the cap', () => {
    expect(anonymousSessionMs(30 * DAY, 2 * HOUR)).toBe(2 * HOUR);
    expect(anonymousSessionMs(HOUR, 2 * DAY)).toBe(HOUR);
  });

  test('a missing or invalid setting falls back to the shipped day', () => {
    for (const bad of [undefined, 0, -5, Number.NaN, '3600000']) expect(anonymousSessionMs(30 * DAY, bad)).toBe(DAY);
  });
});

describe('capExpired', () => {
  const now = 100 * DAY;

  test('past the cap from sign-in is expired; at or within it is not', () => {
    expect(capExpired(now - 30 * DAY - 1, now, 30 * DAY)).toBe(true);
    expect(capExpired(now - 30 * DAY, now, 30 * DAY)).toBe(false);
    expect(capExpired(now - DAY, now, 30 * DAY)).toBe(false);
  });

  test('no recorded sign-in time is not expired', () => {
    expect(capExpired(undefined, now, 30 * DAY)).toBe(false);
    expect(capExpired('2026-10-12', now, 30 * DAY)).toBe(false);
  });
});

describe('checkSessionLimits', () => {
  const limits = { idleMs: 7 * DAY, capMs: 30 * DAY };

  test('continuous activity does not keep a session past the cap: it ends just after 30 days', () => {
    const { endedAt, reason } = runSession(1_000 * DAY, HOUR, 40 * DAY, limits);
    expect(reason).toBe('max-age');
    expect(endedAt).toBe(30 * DAY + HOUR);
  });

  test('continuous activity keeps it until then — not before', () => {
    const { endedAt } = runSession(1_000 * DAY, HOUR, 30 * DAY, limits);
    expect(endedAt).toBeNull();
  });

  test('the cap holds with the idle timeout off', () => {
    expect(runSession(1_000 * DAY, HOUR, 40 * DAY, { idleMs: 0, capMs: 30 * DAY }).reason).toBe('max-age');
  });

  test('idle still ends a session: 7 days without a request', () => {
    const t0 = 1_000 * DAY;
    const session = { signedInAt: t0, lastActivity: t0 + DAY };
    expect(checkSessionLimits(session, t0 + 8 * DAY, limits).end).toBeNull();
    expect(checkSessionLimits(session, t0 + 8 * DAY + 1, limits).end).toBe('idle-timeout');
  });

  test('a role\'s shorter idle limit still applies', () => {
    const t0 = 1_000 * DAY;
    const idleMs = effectiveIdleTimeoutMs(10080, [15]);
    expect(idleMs).toBe(15 * MIN);
    const session = { signedInAt: t0, lastActivity: t0 };
    expect(checkSessionLimits(session, t0 + 15 * MIN + 1, { idleMs, capMs: 30 * DAY }).end).toBe('idle-timeout');
  });

  test('past both, the cap is the reason', () => {
    const t0 = 1_000 * DAY;
    expect(checkSessionLimits({ signedInAt: t0, lastActivity: t0 }, t0 + 31 * DAY, limits).end).toBe('max-age');
  });

  test('a session signed in before the sign-in time was recorded starts its cap now', () => {
    const verdict = checkSessionLimits({ lastActivity: 5 }, 10, limits);
    expect(verdict).toEqual({ end: null, stampSignedIn: true, touch: false });
    expect(checkSessionLimits({ signedInAt: 10, lastActivity: 10 }, 20, limits)).toEqual({ end: null, stampSignedIn: false, touch: false });
  });
});

describe('shipped defaults (#1767)', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

  test('idle 7 days, absolute cap 30 days, step-up window 60 minutes (operator, 2026-10-18)', () => {
    expect(shipped['ngdpbase.session.idle-timeout-minutes']).toBe(7 * 24 * 60);
    expect(shipped['ngdpbase.session.max-age']).toBe(30 * DAY);
    expect(shipped['ngdpbase.session.max-age']).toBe(DEFAULT_SESSION_MAX_AGE_MS);
    expect((shipped['ngdpbase.auth.step-up'] as { 'max-age-minutes': number })['max-age-minutes']).toBe(60);
  });
});
