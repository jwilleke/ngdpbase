/**
 * Password hashing — scrypt, with a per-user salt and in-place upgrade (#1042).
 *
 * ## What was wrong
 *
 * Passwords were stored as ONE round of SHA-256 with a single instance-wide
 * salt (`amdwiki-salt` by default):
 *
 *     sha256(password + globalSalt)
 *
 * SHA-256 is built to be fast, which is the opposite of what a password hash
 * needs — an attacker holding `users.json` can try billions of candidates a
 * second on commodity hardware. And because every account shared one salt,
 * two users with the same password produced byte-identical hashes, so the
 * store leaked which accounts shared a password without any cracking at all.
 * The comparison was `===`, which is not constant-time.
 *
 * ## What replaces it
 *
 * scrypt from Node's standard library — no new dependency — with a random
 * 16-byte salt per password and a constant-time comparison.
 *
 * The stored value is self-describing:
 *
 *     scrypt$16384$8$1$<salt base64>$<hash base64>
 *
 * Carrying the parameters in the hash is what makes this maintainable: the
 * cost can be raised later and old hashes keep verifying under the parameters
 * they were written with, then upgrade on next login. A bare digest cannot do
 * that, which is how the SHA-256 scheme became impossible to move off.
 *
 * ## Migration
 *
 * Existing hashes cannot be converted — the plaintext is not recoverable. So
 * legacy values keep verifying, `needsRehash()` reports them, and the caller
 * rewrites them after a successful login. The store ages over as people sign
 * in; nobody is locked out and no reset email is needed.
 *
 * An empty stored hash stays unusable by design: `isExternal` accounts (magic
 * link, OIDC) store `''`, and no password may ever match it.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/** Marks the current scheme. Anything else is treated as legacy. */
const SCHEME = 'scrypt';

/**
 * CPU/memory cost. 2^14 costs ~20ms per hash here — enough to make offline
 * guessing expensive while leaving login imperceptible. Raising it later is
 * safe: the value used is recorded in each hash.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

/** scryptSync throws unless maxmem covers 128 * N * r; the default is too low. */
const MAXMEM = 128 * N * R * 4;

/** Hash a password under the current scheme. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return [SCHEME, N, R, P, salt.toString('base64'), derived.toString('base64')].join('$');
}

/** The legacy scheme, kept only so old hashes still verify. */
function legacyHash(password: string, globalSalt: string): string {
  return createHash('sha256').update(password + globalSalt).digest('hex');
}

/** Constant-time compare that tolerates length differences. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on unequal lengths, and the lengths themselves are
  // not secret here — the scheme fixes them.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify `password` against a stored value in EITHER scheme.
 *
 * @param stored      the value from the user record
 * @param legacySalt  instance-wide salt, for pre-#1042 hashes only
 */
export function verifyPassword(password: string, stored: string, legacySalt: string): boolean {
  // External accounts store '' and must never match. Checked first so no
  // amount of parsing can turn an empty hash into a successful comparison.
  if (!stored) return false;

  if (!stored.startsWith(`${SCHEME}$`)) {
    return safeEqual(legacyHash(password, legacySalt), stored);
  }

  const parts = stored.split('$');
  if (parts.length !== 6) return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let derived: Buffer;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashB64, 'base64');
    derived = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: n, r, p, maxmem: 128 * n * r * 4
    });
  } catch {
    // A malformed or absurd parameter set is a corrupt record, not a match.
    return false;
  }

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * Should this stored value be rewritten after a successful login?
 *
 * True for legacy hashes, and for current-scheme hashes written under weaker
 * parameters than today's — which is how a future cost increase rolls out.
 * An empty hash is never rehashed; external accounts have no password.
 */
export function needsRehash(stored: string): boolean {
  if (!stored) return false;
  if (!stored.startsWith(`${SCHEME}$`)) return true;

  const parts = stored.split('$');
  if (parts.length !== 6) return true;
  return Number(parts[1]) < N;
}

/** True when the value was written by the pre-#1042 scheme. */
export function isLegacyHash(stored: string): boolean {
  return Boolean(stored) && !stored.startsWith(`${SCHEME}$`);
}
