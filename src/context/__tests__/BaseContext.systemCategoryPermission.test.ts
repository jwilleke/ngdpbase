/**
 * #1504 part 5 — hasPermission(action, { 'system-category': … }) asks the same
 * door with the page's system-category, so a policy on the `system-category`
 * resource type decides. Used for page-public: may this person make pages of
 * this system-category public?
 */
vi.unmock('../../managers/PolicyEvaluator');
import BaseContext, { type EngineLike } from '../BaseContext';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import type { PermissionSubject } from '../../managers/UserManager.js';

class TestContext extends BaseContext {
  constructor(engine: EngineLike, subject: PermissionSubject | null) {
    super(engine, subject);
  }
}

const policies = [{
  id: 'page-public-access', effect: 'allow', priority: 60,
  subjects: [{ type: 'role', value: 'contributor' }],
  resources: [{ type: 'system-category', pattern: 'general' }, { type: 'system-category', pattern: 'journal' }],
  actions: ['page-public']
}];

function engine(): EngineLike {
  const config: Record<string, unknown> = {
    'ngdpbase.access.policies.enabled': true,
    'ngdpbase.access.policies': policies,
    'ngdpbase.access.resource-types': { page: {}, 'system-category': {} }
  };
  const configManager = { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def) };
  const managers: Record<string, unknown> = { ConfigurationManager: configManager };
  const e = { getManager: (n: string) => managers[n] ?? null } as EngineLike;
  managers.PolicyDecisionPoint = new PolicyDecisionPoint(e as never);
  const pe = new PolicyEvaluator(e as never);
  (pe as unknown as { configManager: unknown }).configManager = configManager;
  managers.PolicyEvaluator = pe;
  return e;
}

const contributor = { username: 'jim', roles: ['contributor'], isAuthenticated: true } as PermissionSubject;
const reader = { username: 'molly', roles: ['reader'], isAuthenticated: true } as PermissionSubject;

describe('hasPermission with a system-category (#1504)', () => {
  test('a policy on the system-category decides', async () => {
    const ctx = new TestContext(engine(), contributor);
    expect(await ctx.hasPermission('page-public', { 'system-category': 'journal' })).toBe(true);
    expect(await ctx.hasPermission('page-public', { 'system-category': 'general' })).toBe(true);
    expect(await ctx.hasPermission('page-public', { 'system-category': 'system' })).toBe(false);
  });

  test('a role the policy does not name is refused', async () => {
    expect(await new TestContext(engine(), reader).hasPermission('page-public', { 'system-category': 'journal' })).toBe(false);
  });

  test('without a system-category, a system-category policy never matches', async () => {
    expect(await new TestContext(engine(), contributor).hasPermission('page-public')).toBe(false);
  });

  test('answers are not mixed up between system-categories', async () => {
    const ctx = new TestContext(engine(), contributor);
    expect(await ctx.hasPermission('page-public', { 'system-category': 'system' })).toBe(false);
    expect(await ctx.hasPermission('page-public', { 'system-category': 'journal' })).toBe(true);
  });
});
