/**
 * The keep a keep at upload carries to the upload door (#2061): honoured only
 * while open, and only for its user's own vault of its add-on's category.
 */
import type { ActorContext } from '../../context/ActorContext';
import { closeOriginalKeep, keepAllowsInto, openOriginalKeep } from '../originalKeep';
import type { RegisteredReceiver } from '../types';

const RECEIVER = {
  id: 'phr.health-records', owner: 'phr', name: 'health-records', accepts: ['file'],
  originals: { allowed: ['keep'], types: ['application/json'] },
  mayUse: async () => true, receive: async () => ({ status: 'stored' })
} as RegisteredReceiver;
const MOLLY = { username: 'molly', isAuthenticated: true, roles: [] } as unknown as ActorContext;
const OWN = { uploader: 'molly', owner: 'molly', vaultAddon: 'phr' };

describe('OriginalKeep (#2061)', () => {
  test('names its receiver, add-on, user and declared types, and cannot be changed', () => {
    const keep = openOriginalKeep(RECEIVER, MOLLY);
    expect(keep).toEqual({ receiver: 'phr.health-records', addon: 'phr', user: 'molly', types: ['application/json'] });
    expect(Object.isFrozen(keep) && Object.isFrozen(keep.types)).toBe(true);
    closeOriginalKeep(keep);
  });

  test('applies only to its user\'s own vault of its add-on\'s category, uploaded by that user', () => {
    const keep = openOriginalKeep(RECEIVER, MOLLY);
    expect(keepAllowsInto(keep, OWN)).toBe(true);
    expect(keepAllowsInto(keep, { ...OWN, owner: 'bob' })).toBe(false);
    expect(keepAllowsInto(keep, { ...OWN, uploader: 'bob' })).toBe(false);
    expect(keepAllowsInto(keep, { ...OWN, vaultAddon: 'journal' })).toBe(false);
    expect(keepAllowsInto(keep, { ...OWN, vaultAddon: null })).toBe(false);
    closeOriginalKeep(keep);
  });

  test('a closed keep, a copy, or none applies nowhere', () => {
    const keep = openOriginalKeep(RECEIVER, MOLLY);
    expect(keepAllowsInto({ ...keep }, OWN)).toBe(false);
    closeOriginalKeep(keep);
    expect(keepAllowsInto(keep, OWN)).toBe(false);
    expect(keepAllowsInto(undefined, OWN)).toBe(false);
  });
});
