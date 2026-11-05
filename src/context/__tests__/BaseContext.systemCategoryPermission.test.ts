/**
 * #1504 part 5, #2255 — hasPermissionOn(action, page) asks about the page, and
 * the PDP reads the page's system-category from the PIP, so a policy on the
 * `system-category` resource type decides. Used for page-public: may this
 * person make pages of this system-category public? No caller passes the
 * category any more.
 */
vi.unmock('../../managers/PolicyEvaluator');
import BaseContext, { type EngineLike } from '../BaseContext';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
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
  managers.PageManager = { getPageMetadata: async (name: string) => (PAGES[name] ?? null) };
  managers.PolicyInformationPoint = new PolicyInformationPoint(e as never);
  return e;
}

/** One page per system-category, as the PIP reads them. */
const PAGES: Record<string, Record<string, unknown>> = {
  'A Journal Page': { title: 'A Journal Page', uuid: 'j', 'system-category': 'journal' },
  'A General Page': { title: 'A General Page', uuid: 'g', 'system-category': 'General' },
  'A System Page': { title: 'A System Page', uuid: 's', 'system-category': 'system' }
};

const contributor = { username: 'jim', roles: ['contributor'], isAuthenticated: true } as PermissionSubject;
const reader = { username: 'molly', roles: ['reader'], isAuthenticated: true } as PermissionSubject;

describe('hasPermissionOn decides by the page\'s system-category (#1504, #2255)', () => {
  test('a policy on the system-category decides; the category is read case-insensitively', async () => {
    const ctx = new TestContext(engine(), contributor);
    expect(await ctx.hasPermissionOn('page-public', 'A Journal Page')).toBe(true);
    expect(await ctx.hasPermissionOn('page-public', 'A General Page')).toBe(true);
    expect(await ctx.hasPermissionOn('page-public', 'A System Page')).toBe(false);
  });

  test('a role the policy does not name is refused', async () => {
    expect(await new TestContext(engine(), reader).hasPermissionOn('page-public', 'A Journal Page')).toBe(false);
  });

  test('without a page, or a page that cannot be read, a system-category policy never matches', async () => {
    expect(await new TestContext(engine(), contributor).hasPermission('page-public')).toBe(false);
    expect(await new TestContext(engine(), contributor).hasPermissionOn('page-public', 'No Such Page')).toBe(false);
  });

  test('answers are not mixed up between pages', async () => {
    const ctx = new TestContext(engine(), contributor);
    expect(await ctx.hasPermissionOn('page-public', 'A System Page')).toBe(false);
    expect(await ctx.hasPermissionOn('page-public', 'A Journal Page')).toBe(true);
  });
});
