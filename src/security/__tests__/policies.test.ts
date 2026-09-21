/**
 * The policies are read live, and read the way PolicyManager read them
 * (#1431 step 10).
 *
 * PolicyManager snapshotted `ngdpbase.access.policies` at boot, so a policy
 * changed in /admin/configuration was saved and audited but not enforced until
 * a restart. `readPolicies` asks ConfigurationManager every time. These pin
 * both halves: it is CURRENT, and it is otherwise the same answer.
 */
import { readPolicies, POLICIES_KEY, POLICIES_ENABLED_KEY } from '../policies';

function config(values: Record<string, unknown>) {
  const store = { ...values };
  return {
    store,
    get: (key: string, def: unknown) => (key in store ? store[key] : def)
  };
}

const allow = (id: string, priority?: number) => ({ id, effect: 'allow', priority, subjects: [], actions: [] });

describe('#1431 readPolicies', () => {
  test('a policy changed after start is seen on the next read — no restart', () => {
    // The defect this replaces: the boot snapshot never saw this change.
    const c = config({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: [allow('a')] });
    expect(readPolicies(c.get).map((p) => p.id)).toEqual(['a']);
    c.store[POLICIES_KEY] = [allow('a'), allow('b')];
    expect(readPolicies(c.get).map((p) => p.id)).toEqual(['a', 'b']);
  });

  test('disabled — and unset, which defaults to disabled — means no policies', () => {
    expect(readPolicies(config({ [POLICIES_KEY]: [allow('a')] }).get)).toEqual([]);
    expect(readPolicies(config({ [POLICIES_ENABLED_KEY]: false, [POLICIES_KEY]: [allow('a')] }).get)).toEqual([]);
  });

  test('highest priority first', () => {
    const c = config({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: [allow('low', 1), allow('high', 100), allow('mid', 50)] });
    expect(readPolicies(c.get).map((p) => p.id)).toEqual(['high', 'mid', 'low']);
  });

  test('an entry without a string id is not a policy', () => {
    const c = config({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: [allow('ok'), { effect: 'allow' }, { id: 7 }, null, 'nope'] });
    expect(readPolicies(c.get).map((p) => p.id)).toEqual(['ok']);
  });

  test('two entries with one id: the later one wins, as the Map did', () => {
    const c = config({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: [{ ...allow('x'), effect: 'allow' }, { ...allow('x'), effect: 'deny' }] });
    const out = readPolicies(c.get);
    expect(out).toHaveLength(1);
    expect(out[0].effect).toBe('deny');
  });

  test('a value that is not a list is no policies, not a crash', () => {
    expect(readPolicies(config({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: { not: 'a list' } }).get)).toEqual([]);
  });
});
