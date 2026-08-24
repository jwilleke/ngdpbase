/**
 * Magic-link device binding (#1022).
 *
 * A magic link is bearer-only: whoever holds the URL can sign in. A forwarded
 * email, a link pasted into a chat, or a mailbox a second person can read is a
 * complete account takeover — no second factor, and nothing in the log saying
 * the redemption came from somewhere unexpected.
 *
 * The mitigation is to remember which browser asked for the link (an opaque
 * value in an HTTP-only cookie, stored alongside the token) and check it at
 * redemption.
 *
 * ## Why this is two features, not one
 *
 * Strict binding breaks the most common real flow: request the link on a
 * laptop, open the mail on a phone. That is not an edge case, and silently
 * breaking it would be worse than the risk being mitigated. So:
 *
 * - **Observability is always on.** Every redemption records whether the
 *   browser matched, plus IP and User-Agent, through `AuditManager` so it is
 *   queryable rather than buried in the app log. Costs nothing in UX.
 * - **Enforcement is opt-in**, behind
 *   `ngdpbase.auth.magic-link.bind-to-requesting-device` (default `false`).
 *
 * ## The direction that must not be got wrong
 *
 * An absent cookie is `absent`, never `match`. A forwarded link arrives with no
 * cookie at all, so treating "no cookie" as a pass would make the enforcement
 * setting do nothing against the exact attacker it exists to stop.
 *
 * A token carrying no stored state is a separate case (`unknown`) and is always
 * allowed: tokens live in memory for ~15 minutes, so on the deploy that ships
 * this there are live tokens issued before the feature existed. Refusing those
 * would sign people out mid-flow for no security gain.
 */

import * as crypto from 'crypto';

/** Cookie carrying the opaque per-request state value. */
export const DEVICE_STATE_COOKIE = 'ngdp_ml_state';

export type DeviceBindingOutcome =
  /** Cookie present and equal to the value stored with the token. */
  | 'match'
  /** Cookie present but different — a different browser is redeeming. */
  | 'mismatch'
  /** No cookie presented. The cross-device flow, and also the forwarded-link attack. */
  | 'absent'
  /** Token predates this feature, or was issued without state. Not evidence either way. */
  | 'unknown';

export interface DeviceBindingResult {
  outcome: DeviceBindingOutcome;
  /** Whether the sign-in may proceed, given the enforcement setting. */
  allowed: boolean;
}

export interface DeviceBindingInput {
  /** State stored with the token when the link was requested. */
  stored: string | null | undefined;
  /** State presented by the redeeming browser's cookie. */
  presented: string | null | undefined;
  /** Whether `bind-to-requesting-device` is enabled. */
  enforce: boolean;
}

/** A fresh opaque state value. 32 bytes of CSPRNG, hex-encoded. */
export function newDeviceState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Cookie options for the state cookie.
 *
 * `SameSite=Lax` rather than `Strict` is deliberate: the redemption arrives as
 * a top-level navigation from a mail client or webmail tab, and `Strict` would
 * withhold the cookie on that cross-site click — making every ordinary
 * redemption look like a mismatch, which is the failure mode most likely to get
 * this feature switched off.
 *
 * `httpOnly` keeps page scripts from reading or forging it. `maxAge` tracks the
 * token TTL so the cookie does not outlive what it describes.
 */
export function deviceStateCookieOptions(ttlMs: number, secure = false): {
  httpOnly: true;
  sameSite: 'lax';
  maxAge: number;
  path: '/';
  secure: boolean;
} {
  return { httpOnly: true, sameSite: 'lax', maxAge: ttlMs, path: '/', secure };
}

/**
 * Compare two same-length secrets without leaking position through timing.
 *
 * Different lengths short-circuit to false — the length is already observable
 * from the cookie itself, so there is nothing to protect there.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Decide what the presented cookie says about the redeeming browser.
 *
 * Never throws: this runs on the sign-in path, and an exception here would turn
 * a legitimate login into a 500.
 */
export function evaluateDeviceBinding(input: DeviceBindingInput): DeviceBindingResult {
  const { stored, presented, enforce } = input;

  // No stored state: the token predates the feature. Not evidence of anything,
  // so it cannot be grounds for refusal.
  if (!stored) return { outcome: 'unknown', allowed: true };

  if (!presented) return { outcome: 'absent', allowed: !enforce };

  const matched = safeEqual(stored, presented);
  return matched
    ? { outcome: 'match', allowed: true }
    : { outcome: 'mismatch', allowed: !enforce };
}
