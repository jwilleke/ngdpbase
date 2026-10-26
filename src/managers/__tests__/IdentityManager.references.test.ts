/**
 * #2041: IdentityManager's doors for what refers to a user.
 *
 * - `identityIdOf` answers null, never throws, when the identity store cannot
 *   answer (a manager that started degraded has no provider), so a write that
 *   refers to a user keeps working as it does for a name with no account;
 * - `canAnswer` is false then, and `convertReference` throws rather than
 *   orphan a name it could not look up;
 * - `convertReference`: `@id`s, orphans, `anonymous` and the system principal
 *   are kept; a username with an account becomes its `@id`; one without
 *   becomes `orphan:<name>`.
 *
 * Sabotage checks (each turned a test red once): rethrowing every error in
 * identityIdOf; returning the name unchanged for a name with no account.
 * convertReference throws on a store that cannot answer because
 * getByUserIdentifier does; it never orphans a name it could not look up.
 */
import IdentityManager from '../IdentityManager';
import type { WikiEngine } from '../../types/WikiEngine';

const SYSTEM = { username: 'system', origin: 'boot' as const, requestedAt: '2026-10-26T00:00:00Z', reason: 'test' };
const engine = { getManager: () => null } as unknown as WikiEngine;

describe('#2041 IdentityManager references', () => {
  test('the identity store down: identityIdOf is null, canAnswer is false, convertReference throws', async () => {
    const im = new IdentityManager(engine);
    expect(await im.identityIdOf(SYSTEM, 'jim')).toBeNull();
    expect(im.canAnswer()).toBe(false);
    await expect(im.convertReference(SYSTEM, 'jim')).rejects.toThrow(/unavailable/);
    // Values that need no lookup are kept even then.
    await expect(im.convertReference(SYSTEM, 'urn:uuid:1')).resolves.toEqual({ value: 'urn:uuid:1', outcome: 'kept' });
  });

  test('convertReference: an account becomes its @id, a name with none an orphan; @ids, orphans and principals are kept', async () => {
    const im = new IdentityManager(engine);
    Object.assign(im, {
      provider: {},
      getByUserIdentifier: async (_ctx: unknown, u: string) => (u === 'jim' ? { '@id': 'urn:uuid:jim-1' } : null)
    });
    expect(im.canAnswer()).toBe(true);
    expect(await im.identityIdOf(SYSTEM, 'jim')).toBe('urn:uuid:jim-1');
    expect(await im.convertReference(SYSTEM, 'jim')).toEqual({ value: 'urn:uuid:jim-1', outcome: 'converted' });
    expect(await im.convertReference(SYSTEM, 'gone')).toEqual({ value: 'orphan:gone', outcome: 'orphaned' });
    expect(await im.convertReference(SYSTEM, 'orphan:gone')).toEqual({ value: 'orphan:gone', outcome: 'orphan' });
    expect(await im.convertReference(SYSTEM, 'urn:uuid:jim-1')).toEqual({ value: 'urn:uuid:jim-1', outcome: 'kept' });
    expect(await im.convertReference(SYSTEM, 'Anonymous')).toEqual({ value: 'Anonymous', outcome: 'kept' });
    expect(await im.convertReference(SYSTEM, 'system')).toEqual({ value: 'system', outcome: 'kept' });
  });
});
