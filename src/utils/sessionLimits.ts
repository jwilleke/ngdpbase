/**
 * Session limits (#1767): the absolute cap on a signed-in session, and how it
 * sits beside the idle timeout (#1546, `sessionIdle.ts`).
 *
 * `ngdpbase.session.max-age` (milliseconds) is the longest a sign-in lasts:
 * a signed-in session ends that long after it signed in, however active it
 * has been. Shipped at 30 days; the idle timeout (7 days) usually ends a
 * session first.
 *
 * Why it is enforced here and not by the cookie (found 2026-10-12, #1767):
 * before this, `max-age` only set express-session's `cookie.maxAge` and the
 * file store's `ttl`, and neither is a cap.
 *
 * - express-session (`rolling: false`, the default) re-issues the cookie with
 *   a fresh expiry, now + maxAge, on every response whose session changed;
 *   the app changes it often (CSRF token, IP capture, the idle timer's
 *   last-activity write).
 * - On every other request it calls the store's `touch()`, and
 *   session-file-store rewrites `__lastAccess`; a stored session expires
 *   `cookie.originalMaxAge` after its LAST access, not its first.
 *
 * So `max-age` was a rolling lifetime: a session in use never ended. The cap
 * is now checked on every request from `signedInAt`, which only sign-in
 * completion writes (`AuthManager.completeSignIn`, on the new session after
 * regeneration); a re-authentication (step-up) does not move it.
 *
 * The cookie and the store keep their rolling behaviour and only have to be
 * long enough: a signed-in session's cookie lives `max-age` from its last
 * change (set at sign-in), so it never ends a session before the cap. An
 * anonymous session (every visitor gets one, for the CSRF token) keeps the
 * shorter `ngdpbase.session.anonymous-max-age`, so a 30-day cap does not keep a month of
 * one-visit sessions in the store.
 */

import { idleExpired, shouldTouch } from './sessionIdle.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The shipped `ngdpbase.session.max-age`: 30 days. */
export const DEFAULT_SESSION_MAX_AGE_MS = 30 * DAY_MS;

/** The shipped `ngdpbase.session.anonymous-max-age`: a day, the old shipped `max-age`. */
export const DEFAULT_ANONYMOUS_SESSION_MS = DAY_MS;

/**
 * How long a session nobody signed in to lives after its last change:
 * `ngdpbase.session.anonymous-max-age` (the shipped day when not a positive
 * number), or the cap when that is shorter.
 */
export function anonymousSessionMs(capMs: number, configured: unknown = DEFAULT_ANONYMOUS_SESSION_MS): number {
  const anonymousMs = typeof configured === 'number' && Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_ANONYMOUS_SESSION_MS;
  return Math.min(anonymousMs, capMs);
}

/** The configured cap in milliseconds; the shipped 30 days when not a positive number. There is no "off". */
export function sessionCapMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : DEFAULT_SESSION_MAX_AGE_MS;
}

/** Whether a session signed in at `signedInAt` (epoch ms) is past the cap. No recorded time is not expired. */
export function capExpired(signedInAt: unknown, now: number, capMs: number): boolean {
  if (typeof signedInAt !== 'number' || !Number.isFinite(signedInAt)) return false;
  return now - signedInAt > capMs;
}

/** What one request does to a signed-in session. */
export type SessionLimitVerdict =
  | { end: 'max-age' | 'idle-timeout' }
  | { end: null; stampSignedIn: boolean; touch: boolean };

/**
 * The per-request check of a signed-in session against both limits: the cap
 * first (it holds whatever the activity), then the idle timeout. A session
 * signed in before `signedInAt` was recorded starts its cap now
 * (`stampSignedIn`), as the idle timer does for a missing last activity.
 */
export function checkSessionLimits(
  session: { signedInAt?: unknown; lastActivity?: unknown },
  now: number,
  limits: { idleMs: number; capMs: number }
): SessionLimitVerdict {
  if (capExpired(session.signedInAt, now, limits.capMs)) return { end: 'max-age' };
  if (idleExpired(session.lastActivity, now, limits.idleMs)) return { end: 'idle-timeout' };
  const stamped = typeof session.signedInAt === 'number' && Number.isFinite(session.signedInAt);
  return { end: null, stampSignedIn: !stamped, touch: shouldTouch(session.lastActivity, now, limits.idleMs) };
}
