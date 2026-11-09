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
import { existsSync, readdirSync, readFileSync } from 'fs';
import PolicyDecisionPoint, { POLICIES_KEY, POLICIES_ENABLED_KEY } from '../PolicyDecisionPoint';

function makePdp(values: Record<string, unknown>) {
  const store = { ...values };
  const config = { getProperty: (key: string, def: unknown) => (key in store ? store[key] : def) };
  const engine = { getManager: (name: string) => (name === 'ConfigurationManager' ? config : null) };
  return { pdp: new PolicyDecisionPoint(engine), store };
}

const allow = (id: string, priority?: number) => ({ id, effect: 'allow', ...(priority === undefined ? {} : { priority }), subjects: [], actions: [] });

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

  test('in configuration order: a leftover priority changes nothing (#2330)', () => {
    const { pdp } = makePdp({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: [allow('low', 1), allow('high', 100), allow('mid', 50)] });
    expect(pdp.policies().map((p) => p.id)).toEqual(['low', 'high', 'mid']);
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
  const policy = (id: string, effect: string, role: string, actions: string[]) =>
    ({ id, effect, subjects: [{ type: 'role', value: role }], actions });

  test('an allow policy grants its actions to the role it names', () => {
    const { pdp } = makePdp({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: [policy('e', 'allow', 'editor', ['page-edit', 'page-read'])] });
    expect(pdp.rolePermissionLists()).toEqual({ editor: ['page-edit', 'page-read'] });
  });

  test('a deny takes an action away, whether it is listed before or after the allow (#2330)', () => {
    const { pdp } = makePdp({
      [POLICIES_ENABLED_KEY]: true,
      [POLICIES_KEY]: [policy('a', 'allow', 'editor', ['page-edit', 'page-delete']), policy('d', 'deny', 'editor', ['page-delete'])]
    });
    expect(pdp.rolePermissionLists()).toEqual({ editor: ['page-edit'] });
    const reversed = makePdp({
      [POLICIES_ENABLED_KEY]: true,
      [POLICIES_KEY]: [policy('d', 'deny', 'editor', ['page-delete']), policy('a', 'allow', 'editor', ['page-edit', 'page-delete'])]
    }).pdp;
    expect(reversed.rolePermissionLists()).toEqual({ editor: ['page-edit'] });
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

describe('the role summary without priority (#2330)', () => {
  const read = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
  const files = ['config/app-default-config.json', ...readdirSync('addons').map((a) => `addons/${a}/config/default-config.json`).filter((f) => existsSync(f))];
  const shipped = files.flatMap((f) => (read(f)[POLICIES_KEY] ?? []) as Array<Record<string, unknown>>);
  const table = (policies: unknown[]) => makePdp({ [POLICIES_ENABLED_KEY]: true, [POLICIES_KEY]: policies }).pdp.rolePermissionLists();

  test('the shipped policies carry no priority and still give every role its actions', () => {
    expect(shipped.length).toBeGreaterThan(25);
    expect(shipped.filter((p) => 'priority' in p)).toEqual([]);
    const summary = table(shipped);
    expect(summary.reader).toContain('page-read');
    expect(summary.admin?.length ?? 0).toBeGreaterThan(summary.reader.length);
    expect(Object.keys(summary)).toEqual([...Object.keys(summary)].sort());
  });

  test('is the same however the policies are ordered, and whatever a leftover priority says', () => {
    const baseline = table(shipped);
    const reordered = [...shipped].reverse().map((p, i) => ({ ...p, priority: (i * 37) % 101 }));
    expect(table(reordered)).toEqual(baseline);
  });
});
