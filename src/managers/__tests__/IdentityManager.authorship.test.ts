/**
 * #2097: IdentityManager's reference methods for page authorship.
 *
 * - `refersTo`: an `@id` matches only its own account; a username not yet
 *   converted matches that username; an orphan and a "no user recorded"
 *   value (`migrated`, `unknown`, `import`) match nobody, so a later account
 *   with the same name inherits nothing.
 * - `usernameOf`: an `@id` gives its account's username, an orphan or an
 *   `@id` whose account is gone gives null, and the store down gives null
 *   without throwing.
 * - `describeReference`: `jim (urn:uuid:…)`, `bob (no account)`,
 *   `urn:uuid:… (no account)`, and anything else as it is.
 * - `convertRecordedUser`: the "no user recorded" values become
 *   `orphan:<value>` without a lookup (outcome `no-user`); the rest is
 *   `convertReference`'s.
 *
 * Sabotage checks (each turned a test red once): dropping the
 * `isNoRecordedUser` clause in refersTo; looking up a placeholder in
 * convertRecordedUser instead of orphaning it; rethrowing in usernameOf. The
 * explicit orphan guard in refersTo stays green alone (belt and braces: no
 * username can start `orphan:`, so the username comparison never matches one).
 */
import IdentityManager from '../IdentityManager';
import type { WikiEngine } from '../../types/WikiEngine';
import { fakeIdentityManager } from '../../test-support/identities';

const SYSTEM = { username: 'system', origin: 'boot' as const, requestedAt: '2026-10-26T00:00:00Z', reason: 'test' };

describe('#2097 IdentityManager reference methods', () => {
  test('refersTo: @id, unconverted username, orphan and placeholders', async () => {
    const accounts: Record<string, string> = { jim: 'urn:uuid:jim-1', unknown: 'urn:uuid:unknown-1' };
    const im = fakeIdentityManager(accounts);
    expect(await im.refersTo(SYSTEM, 'urn:uuid:jim-1', 'jim')).toBe(true);
    expect(await im.refersTo(SYSTEM, 'urn:uuid:jim-1', 'bob')).toBe(false);
    expect(await im.refersTo(SYSTEM, 'jim', 'Jim')).toBe(true);
    expect(await im.refersTo(SYSTEM, 'orphan:bob', 'bob')).toBe(false);
    // An account that took a placeholder's name gains nothing.
    expect(await im.refersTo(SYSTEM, 'unknown', 'unknown')).toBe(false);
    expect(await im.refersTo(SYSTEM, 'orphan:unknown', 'unknown')).toBe(false);
    expect(await im.refersTo(SYSTEM, '', 'jim')).toBe(false);
    expect(await im.refersTo(SYSTEM, 'urn:uuid:jim-1', '')).toBe(false);
    // A reused name: bob's old @id never matches the new bob.
    accounts.bob = 'urn:uuid:bob-old';
    const oldBobPage = 'urn:uuid:bob-old';
    accounts.bob = 'urn:uuid:bob-new';
    expect(await im.refersTo(SYSTEM, oldBobPage, 'bob')).toBe(false);
  });

  test('refersTo with the identity store down: an @id matches nobody', async () => {
    const im = fakeIdentityManager({ jim: 'urn:uuid:jim-1' }, { down: true });
    expect(await im.refersTo(SYSTEM, 'urn:uuid:jim-1', 'jim')).toBe(false);
    // An unconverted username needs no lookup.
    expect(await im.refersTo(SYSTEM, 'jim', 'jim')).toBe(true);
  });

  test('usernameOf and describeReference', async () => {
    const im = fakeIdentityManager({ jim: 'urn:uuid:jim-1' });
    expect(await im.usernameOf(SYSTEM, 'urn:uuid:jim-1')).toBe('jim');
    expect(await im.usernameOf(SYSTEM, 'urn:uuid:gone')).toBeNull();
    expect(await im.usernameOf(SYSTEM, 'orphan:bob')).toBeNull();
    expect(await im.usernameOf(SYSTEM, 'jim')).toBe('jim');
    expect(await im.usernameOf(SYSTEM, '')).toBeNull();
    expect(await im.describeReference(SYSTEM, 'urn:uuid:jim-1')).toBe('jim (urn:uuid:jim-1)');
    expect(await im.describeReference(SYSTEM, 'orphan:bob')).toBe('bob (no account)');
    expect(await im.describeReference(SYSTEM, 'urn:uuid:gone')).toBe('urn:uuid:gone (no account)');
    expect(await im.describeReference(SYSTEM, 'system')).toBe('system');
    expect(await im.describeReference(SYSTEM, undefined)).toBe('');
  });

  test('usernameOf with the identity store down is null and does not throw', async () => {
    const im = fakeIdentityManager({ jim: 'urn:uuid:jim-1' }, { failLookups: true });
    expect(await im.usernameOf(SYSTEM, 'urn:uuid:jim-1')).toBeNull();
    expect(await im.describeReference(SYSTEM, 'urn:uuid:jim-1')).toBe('urn:uuid:jim-1 (no account)');
  });

  test('a real IdentityManager with no provider: usernameOf is null', async () => {
    const im = new IdentityManager({ getManager: () => null });
    expect(await im.usernameOf(SYSTEM, 'urn:uuid:jim-1')).toBeNull();
  });

  test('convertRecordedUser: placeholders are orphaned without a lookup', async () => {
    const im = fakeIdentityManager({ jim: 'urn:uuid:jim-1', migrated: 'urn:uuid:m' });
    expect(await im.convertRecordedUser(SYSTEM, 'migrated')).toEqual({ value: 'orphan:migrated', outcome: 'no-user' });
    expect(await im.convertRecordedUser(SYSTEM, 'Unknown')).toEqual({ value: 'orphan:unknown', outcome: 'no-user' });
    expect(await im.convertRecordedUser(SYSTEM, 'import')).toEqual({ value: 'orphan:import', outcome: 'no-user' });
    expect(await im.convertRecordedUser(SYSTEM, 'orphan:import')).toEqual({ value: 'orphan:import', outcome: 'no-user' });
    expect(im.lookups).toEqual([]);
    expect(await im.convertRecordedUser(SYSTEM, 'jim')).toEqual({ value: 'urn:uuid:jim-1', outcome: 'converted' });
    expect(await im.convertRecordedUser(SYSTEM, 'bob')).toEqual({ value: 'orphan:bob', outcome: 'orphaned' });
  });
});
