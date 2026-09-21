/**
 * The PDP reads the policies live, and is the only thing that interprets them
 * (#1431 step 10, then step 14b).
 *
 * PolicyManager snapshotted `ngdpbase.access.policies` at boot, so a policy
 * changed in /admin/configuration was saved and audited but not enforced until
 * a restart. The PDP asks ConfigurationManager every time. What the policies
 * MEAN — on or off, what counts as one, the order, what a role is given — is
 * decided in PolicyDecisionPoint and nowhere else, so enforcement and the
 * admin summary cannot disagree.
 */
import PolicyDecisionPoint, { POLICIES_KEY, POLICIES_ENABLED_KEY } from '../PolicyDecisionPoint';

function makePdp(values: Record<string, unknown>) {
  const store = { ...values };
  const config = { getProperty: (key: string, def: unknown) => (key in store ? store[key] : def) };
  const engine = { getManager: (name: string) => (name === 'ConfigurationManager' ? config : null) };
  return { pdp: new PolicyDecisionPoint(engine), store };
}

const allow = (id: string, priority?: number) => ({ id, effect: 'allow', priority, subjects: [], actions: [] });

describe('#1431 PolicyDecisionPoint.policies', () => {
  test('a policy changed after start is seen on the next read — no restart', () => {
    // The defect this replaced: the boot snapshot never saw this change.
    const { pdp, store } = makePdp({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: [allow('a')] });
    expect(pdp.policies().map((p) => p.id)).toEqual(['a']);
    store[POLICIES_KEY] = [allow('a'), allow('b')];
    expect(pdp.policies().map((p) => p.id)).toEqual(['a', 'b']);
  });

  test('disabled — and unset, which defaults to disabled — means no policies', () => {
    expect(makePdp({ [POLICIES_KEY]: [allow('a')] }).pdp.policies()).toEqual([]);
    expect(makePdp({ [POLICIES_ENABLED_KEY]: false, [POLICIES_KEY]: [allow('a')] }).pdp.policies()).toEqual([]);
  });

  test('highest priority first', () => {
    const { pdp } = makePdp({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: [allow('low', 1), allow('high', 100), allow('mid', 50)] });
    expect(pdp.policies().map((p) => p.id)).toEqual(['high', 'mid', 'low']);
  });

  test('an entry without a string id is not a policy', () => {
    const { pdp } = makePdp({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: [allow('ok'), { effect: 'allow' }, { id: 7 }, null, 'nope'] });
    expect(pdp.policies().map((p) => p.id)).toEqual(['ok']);
  });

  test('two entries with one id are both kept — a duplicate is PolicyValidator\'s to report, not the reader\'s to resolve (step 14b)', () => {
    // The reader used to keep the later one silently. Merging `id` arrays by
    // id is the configuration merge's rule, across its layers; a duplicate
    // within one layer is an authoring error the validator flags.
    const { pdp } = makePdp({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: [{ ...allow('x'), effect: 'allow' }, { ...allow('x'), effect: 'deny' }] });
    expect(pdp.policies().map((p) => p.effect)).toEqual(['allow', 'deny']);
  });

  test('a value that is not a list is no policies, not a crash', () => {
    expect(makePdp({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: { not: 'a list' } }).pdp.policies()).toEqual([]);
  });
});

describe('#1431 what each role permits — the admin summary', () => {
  const policy = (id: string, effect: string, role: string, actions: string[], priority = 0) =>
    ({ id, effect, priority, subjects: [{ type: 'role', value: role }], actions });

  test('an allow policy grants its actions to the role it names', () => {
    const { pdp } = makePdp({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: [policy('e', 'allow', 'editor', ['page-edit', 'page-read'])] });
    expect(pdp.rolePermissionLists()).toEqual({ editor: ['page-edit', 'page-read'] });
  });

  test('a higher-priority deny takes an action away', () => {
    const { pdp } = makePdp({
      [POLICIES_ENABLED_KEY]: true,
      [POLICIES_KEY]: [policy('a', 'allow', 'editor', ['page-edit', 'page-delete'], 1), policy('d', 'deny', 'editor', ['page-delete'], 100)]
    });
    expect(pdp.rolePermissionLists()).toEqual({ editor: ['page-edit'] });
  });

  test('permissionsForRoles is the union of the roles\' rows', () => {
    const { pdp } = makePdp({
      [POLICIES_ENABLED_KEY]: true,
      [POLICIES_KEY]: [policy('r', 'allow', 'reader', ['page-read']), policy('e', 'allow', 'editor', ['page-edit'])]
    });
    expect(pdp.permissionsForRoles(['reader', 'editor'])).toEqual(['page-edit', 'page-read']);
    expect(pdp.permissionsForRoles(['nobody'])).toEqual([]);
  });

  test('with policies switched off, no role is given anything', () => {
    const { pdp } = makePdp({ [POLICIES_KEY]: [policy('e', 'allow', 'editor', ['page-edit'])] });
    expect(pdp.rolePermissionLists()).toEqual({});
  });
});
