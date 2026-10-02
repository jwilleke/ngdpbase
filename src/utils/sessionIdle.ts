/**
 * Session idle timeout (#1546).
 *
 * `ngdpbase.session.idle-timeout-minutes` ends a signed-in session after that
 * many minutes with no request. `0` (the default) is off. It is separate from
 * `ngdpbase.session.max-age`, the absolute lifetime; a value at or above that
 * lifetime simply has no effect.
 *
 * Enforced server-side on the next request — never only by a browser timer,
 * which a closed laptop or a copied cookie would not run.
 *
 * Writing the last-activity time on every request would save the session on
 * every request, which the file store pays for, so it is written at most once
 * per `touchEveryMs`: a session may then end up to that much later than the
 * exact limit, never earlier.
 */

/** The configured limit in milliseconds; 0 when off or not a positive number. */
export function idleTimeoutMs(minutes: unknown): number {
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0;
}

/** How stale the recorded activity may get before it is written again. */
export function touchEveryMs(timeoutMs: number): number {
  return Math.min(60_000, Math.floor(timeoutMs / 4));
}

/**
 * Whether a session last active at `lastActivity` (epoch ms) has been idle
 * past the limit. A session with no recorded activity — one signed in before
 * the limit was set — is not expired; it starts counting now.
 */
export function idleExpired(lastActivity: unknown, now: number, timeoutMs: number): boolean {
  if (timeoutMs <= 0 || typeof lastActivity !== 'number' || !Number.isFinite(lastActivity)) return false;
  return now - lastActivity > timeoutMs;
}

/** Whether the recorded activity should be written on this request. */
export function shouldTouch(lastActivity: unknown, now: number, timeoutMs: number): boolean {
  if (timeoutMs <= 0) return false;
  if (typeof lastActivity !== 'number' || !Number.isFinite(lastActivity)) return true;
  return now - lastActivity >= touchEveryMs(timeoutMs);
}
