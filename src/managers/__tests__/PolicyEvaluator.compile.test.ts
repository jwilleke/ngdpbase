/**
 * #1219 — `compile` is `evaluateAccess` with the subject and action fixed:
 * policies that cannot match this subject or action are dropped once, and
 * the returned predicate matches resources only, with no log line per call.
 * It must agree with `evaluateAccess` on every page, including how a deny
 * and an allow combine (deny overrides allow since #2255).
 */
vi.unmock('../PolicyEvaluator');
import PolicyEvaluator from '../PolicyEvaluator';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';

const policies = [
  { id: 'deny-admin-pages', effect: 'deny', subjects: [{ type: 'role', value: 'All' }], resources: [{ type: 'page', pattern: 'Admin*' }], actions: ['page-read', 'page-edit'] },
  { id: 'editors-edit', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-edit'] },
  { id: 'everyone-reads', effect: 'allow', subjects: [{ type: 'role', value: 'All' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-read'] },
  { id: 'unrelated', effect: 'allow', subjects: [{ type: 'role', value: 'admin' }], resources: [{ type: 'page', pattern: '*' }], actions: ['admin-system'] }
];

/**
 * #1431 step 10: the policies are read through ConfigurationManager, live, so
 * the harness hands it a config — as the running system does — rather than a
 * policy store to reach into. Step 14b: the PDP reads them and the evaluator,
 * its matching engine, asks the PDP — so a real one sits over the same config.
 */
function engineOver(configManager: unknown) {
  const managers: Record<string, unknown> = { ConfigurationManager: configManager };
  const engine = { getManager: (n: string) => managers[n] ?? null };
  managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
  return engine;
}

function makeEvaluator() {
  const config: Record<string, unknown> = {
    'ngdpbase.access.policies.enabled': true,
    'ngdpbase.access.policies': policies
  };
  const configManager = { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def) };
  const pe = new PolicyEvaluator(engineOver(configManager));
  (pe as unknown as { configManager: unknown }).configManager = configManager;
  return pe;
}

const pages = ['Welcome', 'AdminDashboard', 'Notes'];
const subjects = [
  { username: 'a', roles: ['anonymous', 'All'] },
  { username: 'e', roles: ['editor', 'All'] },
  { username: 'r', roles: ['admin', 'All'] },
  { username: 'n', roles: [] }
];

describe('PolicyEvaluator.compile (#1219)', () => {
  test.each(['page-read', 'page-edit', 'page-delete'])('%s: the predicate agrees with evaluateAccess on every page and subject', async (action) => {
    const pe = makeEvaluator();
    for (const userContext of subjects) {
      const decide = pe.compile(userContext, action);
      for (const pageName of pages) {
        const one = await pe.evaluateAccess({ pageName, action, userContext });
        const many = await decide(pageName);
        expect({ hasDecision: many.hasDecision, allowed: many.allowed, policyIds: many.policyIds })
          .toEqual({ hasDecision: one.hasDecision, allowed: one.allowed, policyIds: one.policyIds });
      }
    }
  });

  test('a deny overrides an allow in both shapes: the deny decides Admin* (#2255)', async () => {
    const pe = makeEvaluator();
    const decide = pe.compile({ username: 'e', roles: ['editor', 'All'] }, 'page-read');
    expect(await decide('AdminDashboard')).toMatchObject({ hasDecision: true, allowed: false, policyIds: ['deny-admin-pages'] });
    expect(await decide('Notes')).toMatchObject({ hasDecision: true, allowed: true, policyIds: ['everyone-reads'] });
  });

  test('no ConfigurationManager: no decision, like evaluateAccess', async () => {
    const pe = new PolicyEvaluator({ getManager: () => null });
    expect(await pe.compile({ roles: ['All'] }, 'page-read')('X')).toMatchObject({ hasDecision: false, allowed: false });
  });
});

describe('#1431 step 10 — a policy changed after start is enforced without a restart', () => {
  test('evaluateAccess sees a policy added after initialize()', async () => {
    // The defect: PolicyManager copied the policies at boot, so a policy an
    // admin changed in /admin/configuration was saved and audited but never
    // enforced until the server restarted.
    const live: Record<string, unknown> = {
      'ngdpbase.access.policies.enabled': true,
      'ngdpbase.access.policies': []
    };
    const configManager = { getProperty: (key: string, def: unknown) => (key in live ? live[key] : def) };
    const pe = new PolicyEvaluator(engineOver(configManager));
    await pe.initialize();

    const ask = () => pe.evaluateAccess({ pageName: 'Notes', action: 'page-read', userContext: { username: 'e', roles: ['editor'] } });

    expect((await ask()).hasDecision).toBe(false);

    // An administrator adds a policy, after start.
    live['ngdpbase.access.policies'] = [
      { id: 'editors-read', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-read'] }
    ];
    expect(await ask()).toMatchObject({ hasDecision: true, allowed: true, policyName: 'editors-read' });

    // And takes it away again.
    live['ngdpbase.access.policies'] = [];
    expect((await ask()).hasDecision).toBe(false);
  });
});
