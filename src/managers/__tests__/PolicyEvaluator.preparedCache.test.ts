/**
 * A single decision reuses its policies' compiled conditions (#2279) while
 * the configuration is unchanged, and the next decision after any change to
 * it compiles again: a stale compiled condition never decides.
 */

import PolicyEvaluator from '../PolicyEvaluator';
import type { Policy, PolicyCondition } from '../../types/Policy';
import { attr, val } from './__fixtures__/conditions';

const editor = { username: 'erin', roles: ['editor'], isAuthenticated: true };
const allow = (id: string, condition: PolicyCondition): Policy => ({
  id, effect: 'allow',
  subjects: [{ type: 'role', value: 'editor' }],
  resources: [{ type: 'page', pattern: '*' }],
  actions: ['page-edit'],
  condition
});
const STATUS = { 'string-equal': [attr('resource:status'), val('open')] } as PolicyCondition;
const open = (name: string) => (name === 'resource:status' ? 'open' : undefined);

/** A configuration that says when it changed, as ConfigurationManager.getRevision() does; `withRevision: false` is one that cannot. */
function setUp(policies: Policy[], { withRevision = true } = {}) {
  const config: Record<string, unknown> = {
    'ngdpbase.access.resource-types': { page: { attributes: { status: { type: 'string' } } } }
  };
  let revision = 0;
  const configManager = {
    getProperty: (k: string, d: unknown) => (k in config ? config[k] : d),
    ...(withRevision ? { getRevision: () => revision } : {})
  };
  const state = { policies };
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'PolicyDecisionPoint') return { policies: () => state.policies, categoriesGranting: () => [] };
      return null;
    }
  } as never;
  const ev = new PolicyEvaluator(engine);
  const prepare = vi.spyOn(ev as unknown as { prepare: (p: readonly Policy[]) => unknown }, 'prepare');
  const decide = () => ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: open });
  const change = (fn: () => void) => { fn(); revision++; };
  return { ev, prepare, decide, state, config, change };
}

describe('compiled conditions are kept until the configuration changes (#2279)', () => {
  test('prepare runs once across repeated decisions with unchanged policies', async () => {
    const { ev, prepare, decide } = setUp([allow('a', STATUS)]);
    await ev.initialize();
    for (let i = 0; i < 5; i++) expect(await decide()).toMatchObject({ allowed: true, policyIds: ['a'] });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  test('a single decision and a listing share what is compiled', async () => {
    const { ev, prepare, decide } = setUp([allow('a', STATUS)]);
    await ev.initialize();
    await decide();
    expect(await ev.compile(editor, 'page-edit')('P', {}, open)).toMatchObject({ allowed: true });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  test('a changed policy is seen by the next decision', async () => {
    const { ev, decide, state, change } = setUp([allow('a', STATUS)]);
    await ev.initialize();
    expect((await decide()).allowed).toBe(true);
    change(() => { state.policies = [allow('a', { 'string-equal': [attr('resource:status'), val('closed')] } as PolicyCondition)]; });
    expect((await decide()).allowed).toBe(false);
  });

  test('a change to what a condition may read is seen by the next decision, with the same condition object', async () => {
    // The revision, not the object, decides: what a condition compiles to also depends on what is declared.
    const { ev, config, change } = setUp([allow('a', { 'string-equal': [attr('resource:department'), val('sales')] } as PolicyCondition)]);
    await ev.initialize();
    const read = (name: string) => (name === 'resource:department' ? 'sales' : undefined);
    const decideDept = () => ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: read });
    expect((await decideDept()).allowed).toBe(false); // department is not declared: the condition has a problem
    change(() => { config['ngdpbase.access.resource-types'] = { page: { attributes: { department: { type: 'string' } } } }; });
    expect((await decideDept()).allowed).toBe(true);
    change(() => { config['ngdpbase.access.resource-types'] = { page: { attributes: {} } }; });
    expect((await decideDept()).allowed).toBe(false);
  });

  test('without a revision to key on, every decision prepares again', async () => {
    const { ev, prepare, decide, state } = setUp([allow('a', STATUS)], { withRevision: false });
    await ev.initialize();
    await decide();
    await decide();
    expect(prepare).toHaveBeenCalledTimes(2);
    state.policies = [allow('a', { 'string-equal': [attr('resource:status'), val('closed')] } as PolicyCondition)];
    expect((await decide()).allowed).toBe(false);
  });

  test('one condition object shared by policies naming different resource types is checked for each (#2261)', async () => {
    // `tier` is declared on vault: valid for the policy naming vault, not for the one naming only system-category.
    const shared = { 'string-equal': [attr('resource:tier'), val('gold')] } as PolicyCondition;
    const policy = (id: string, type: string, pattern: string): Policy => ({
      id, effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type, pattern }], actions: ['page-edit'], condition: shared
    });
    const config: Record<string, unknown> = {
      'ngdpbase.access.resource-types': {
        page: { attributes: {} },
        'system-category': {},
        vault: { attributes: { tier: { type: 'string' } } }
      }
    };
    const configManager = { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d), getRevision: () => 0 };
    const policies = [policy('on-vault', 'vault', '*'), policy('on-category', 'system-category', 'general')];
    const engine = {
      getManager: (name: string) => {
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'PolicyDecisionPoint') return { policies: () => policies, categoriesGranting: () => [] };
        return null;
      }
    } as never;
    const ev = new PolicyEvaluator(engine);
    await ev.initialize();
    const gold = (name: string) => (name === 'resource:tier' ? 'gold' : undefined);
    const decide = (attributes: Record<string, string>) =>
      ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, attributes, readAttribute: gold });

    // Only the vault policy matches a vault page: its condition is valid and is compiled.
    expect(await decide({ vault: 'default' })).toMatchObject({ allowed: true, policyIds: ['on-vault'] });
    // Only the category policy matches a public general page: tier is not declared for it, so its allow does not apply.
    expect((await decide({ 'system-category': 'general' })).hasDecision).toBe(false);
  });

  test('a condition that is not an object is refused every time, not cached', async () => {
    const { ev, decide } = setUp([allow('a', 'oops')]);
    await ev.initialize();
    expect((await decide()).allowed).toBe(false);
    expect((await decide()).allowed).toBe(false);
  });
});
