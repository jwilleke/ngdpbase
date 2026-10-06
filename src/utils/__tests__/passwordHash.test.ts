/**
 * Password hashing — scrypt with per-user salt, and the migration off SHA-256 (#1042).
 *
 * The old scheme was one round of SHA-256 with a single instance-wide salt.
 * Fast to crack offline, and identical passwords produced identical hashes, so
 * the store leaked which accounts shared one.
 *
 * Existing hashes cannot be converted — the plaintext is not recoverable — so
 * the legacy-verification and rehash cases below are the migration, not
 * optional extras. If they break, an upgrade locks every user out.
 */

import { createHash } from 'crypto';
import { hashPassword, verifyPassword, needsRehash, isLegacyHash } from '../passwordHash';

const LEGACY_SALT = 'amdwiki-salt';

/** Exactly what the pre-#1042 scheme wrote. */
const legacy = (password: string, salt = LEGACY_SALT): string =>
  createHash('sha256').update(password + salt).digest('hex');

describe('the new scheme (#1042)', () => {
  test('a hash verifies against its own password', async () => {
    const stored = await hashPassword('correct horse battery staple');

    expect(await verifyPassword('correct horse battery staple', stored, LEGACY_SALT)).toBe(true);
  });

  test('a wrong password does not verify', async () => {
    const stored = await hashPassword('right');

    expect(await verifyPassword('wrong', stored, LEGACY_SALT)).toBe(false);
  });

  test('the same password hashed twice gives DIFFERENT stored values', async () => {
    // The whole point of a per-user salt. Under the old scheme these were
    // byte-identical, so the store advertised which accounts shared a password.
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');

    expect(a).not.toBe(b);
    expect(await verifyPassword('same-password', a, LEGACY_SALT)).toBe(true);
    expect(await verifyPassword('same-password', b, LEGACY_SALT)).toBe(true);
  });

  test('the stored value names its scheme and parameters', async () => {
    // Self-describing is what makes a future cost increase possible without
    // invalidating every existing hash.
    const [scheme, n, r, p, salt, digest] = (await hashPassword('x')).split('$');

    expect(scheme).toBe('scrypt');
    expect(Number(n)).toBeGreaterThanOrEqual(16384);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
    expect(salt.length).toBeGreaterThan(0);
    expect(digest.length).toBeGreaterThan(0);
  });

  test('unicode and long passwords round-trip', async () => {
    const pw = 'pässwörd–🔐-' + 'x'.repeat(400);

    expect(await verifyPassword(pw, await hashPassword(pw), LEGACY_SALT)).toBe(true);
  });
});

describe('legacy hashes still verify — the upgrade must not lock anyone out (#1042)', () => {
  test('a pre-#1042 hash verifies against the instance salt', async () => {
    expect(await verifyPassword('hunter2', legacy('hunter2'), LEGACY_SALT)).toBe(true);
  });

  test('a wrong password against a legacy hash still fails', async () => {
    expect(await verifyPassword('nope', legacy('hunter2'), LEGACY_SALT)).toBe(false);
  });

  test('an instance that overrode the salt still verifies its own hashes', async () => {
    const custom = 'some-instance-salt';

    expect(await verifyPassword('hunter2', legacy('hunter2', custom), custom)).toBe(true);
    // ...and the default salt must NOT verify that hash.
    expect(await verifyPassword('hunter2', legacy('hunter2', custom), LEGACY_SALT)).toBe(false);
  });
});

describe('needsRehash drives the migration (#1042)', () => {
  test('a legacy hash needs rehashing', async () => {
    expect(needsRehash(legacy('hunter2'))).toBe(true);
    expect(isLegacyHash(legacy('hunter2'))).toBe(true);
  });

  test('a current hash does not', async () => {
    const stored = await hashPassword('hunter2');

    expect(needsRehash(stored)).toBe(false);
    expect(isLegacyHash(stored)).toBe(false);
  });

  test('a hash written with a WEAKER cost is rehashed', async () => {
    // How a future cost increase rolls out: old parameters keep verifying, and
    // each login rewrites at the new cost.
    const weak = ['scrypt', 1024, 8, 1, 'c2FsdA==', 'aGFzaA=='].join('$');

    expect(needsRehash(weak)).toBe(true);
  });

  test('an empty hash is never rehashed', async () => {
    // External accounts (magic link, OIDC) carry ''. Rehashing would mint a
    // usable password hash for an account that must not have one.
    expect(needsRehash('')).toBe(false);
  });
});

describe('an empty stored hash can never be matched (#1042)', () => {
  test.each([
    ['empty password', ''],
    ['a space', ' '],
    ['ordinary text', 'anything'],
    ['the literal empty digest', createHash('sha256').update('').digest('hex')]
  ])('%s does not verify against an empty hash', async (_label, candidate) => {
    // isExternal accounts store '' and magic link must remain their only door.
    expect(await verifyPassword(candidate, '', LEGACY_SALT)).toBe(false);
  });
});

describe('corrupt stored values fail closed (#1042)', () => {
  test.each([
    ['too few fields', 'scrypt$16384$8$1$onlyfive'],
    ['non-numeric cost', 'scrypt$abc$8$1$c2FsdA==$aGFzaA=='],
    ['absurd cost', 'scrypt$999999999$8$1$c2FsdA==$aGFzaA=='],
    ['scheme only', 'scrypt$'],
    ['garbage', 'not-a-hash-at-all-just-text']
  ])('%s does not verify', async (_label, stored) => {
    // A corrupt record is a failed login, never a successful one. The last case
    // is indistinguishable from a legacy hash by shape, so it takes the legacy
    // path and simply does not match.
    expect(await verifyPassword('anything', stored, LEGACY_SALT)).toBe(false);
  });
});

describe('#1632 hashing never stalls the site', () => {
  test('the cost is 2^17 and is recorded in the hash', async () => {
    const [, n] = (await hashPassword('x')).split('$');
    expect(Number(n)).toBe(131072);
  });

  test('a hash runs off the main thread: other work proceeds while it is computed', async () => {
    const order: string[] = [];
    const hashing = hashPassword('correct horse battery staple').then(() => order.push('hash'));
    await new Promise<void>((resolve) => setImmediate(() => { order.push('other request'); resolve(); }));
    await hashing;
    // With scryptSync the hash finished before the event loop could run anything else.
    expect(order).toEqual(['other request', 'hash']);
  });

  test('a stored hash naming an absurd cost is refused without computing it', async () => {
    expect(await verifyPassword('x', 'scrypt$1073741824$8$1$c2FsdA==$aGFzaA==', 'salt')).toBe(false);
  });
});
