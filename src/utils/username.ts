'use strict';

/**
 * One spelling of a username, for comparison (#1436).
 *
 * A username is an identifier, not prose: `jim`, `Jim` and `" jim "` are one
 * account, and every comparison has to agree about that. Before this they did
 * not. `FileUserProvider` keyed its map on the raw string, so those three were
 * three separate accounts and `createUser`'s duplicate check did not see the
 * case variants — an account could be registered whose name differed from an
 * existing one only in case, which is the classic lookalike.
 *
 * The same split ran through the code the other way. `getAnonymousUser()`
 * emits `'Anonymous'` while roughly ten sites compare against `'anonymous'`,
 * so those guards never fired for a real visitor. They failed closed, which is
 * luck rather than design — it is the same defect as #1433, where a viewer was
 * written to the cache key under one spelling and read back under another.
 *
 * __Normalize to compare; keep the original to display.__ The stored record
 * keeps whatever the person typed, because that is their name; the index and
 * every equality test use this.
 */

/**
 * The comparison form of a username: trimmed, lower-cased.
 *
 * Lower-case rather than upper: `toLowerCase()` is what the existing checks
 * already used (`isSystemPrincipal`, the sitemap subject list), so this agrees
 * with them rather than introducing a third convention.
 *
 * A non-string is normalized to the empty string rather than throwing, because
 * callers pass values straight from a request body — and empty is already the
 * "no username" case every caller handles.
 */
export function normalizeUsername(username: unknown): string {
  return typeof username === 'string' ? username.trim().toLowerCase() : '';
}

/**
 * True when two usernames name the same account.
 *
 * Exists so a comparison reads as the question it is asking, and so no call
 * site re-implements the rule by hand — which is how the spellings diverged.
 */
export function sameUsername(a: unknown, b: unknown): boolean {
  const left = normalizeUsername(a);
  return left !== '' && left === normalizeUsername(b);
}

/**
 * Names no person may register.
 *
 * `anonymous` is the principal for "nobody authenticated" — a real account
 * holding that name would collide with it wherever the name is compared.
 * `asserted` was the subject removed in #1435; it is reserved so the name
 * cannot be taken in the window before anyone reconsiders the concept.
 *
 * The system principal is NOT listed here: its name comes from `.env` and is
 * checked separately by `isSystemPrincipal`, because an operator chooses it.
 */
export const RESERVED_USERNAMES: readonly string[] = ['anonymous', 'asserted'];

/** True when the name belongs to a principal rather than a person. */
export function isReservedUsername(username: unknown): boolean {
  return RESERVED_USERNAMES.includes(normalizeUsername(username));
}
