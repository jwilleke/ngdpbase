/**
 * #1219 — `compile` is `evaluateAccess` with the subject and action fixed:
 * policies that cannot match this subject or action are dropped once, and
 * the returned predicate matches resources only, with no log line per call.
 * It must agree with `evaluateAccess` on every page, including the first-
 * match-wins ordering.
 */
vi.unmock('../PolicyEvaluator');
import PolicyEvaluator from '../PolicyEvaluator';

const policies = [
  { id: 'deny-admin-pages', effect: 'deny', subjects: [{ type: 'role', value: 'All' }], resources: [{ type: 'page', pattern: 'Admin*' }], actions: ['page-read', 'page-edit'] },
  { id: 'editors-edit', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-edit'] },
  { id: 'everyone-reads', effect: 'allow', subjects: [{ type: 'role', value: 'All' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-read'] },
  { id: 'unrelated', effect: 'allow', subjects: [{ type: 'role', value: 'admin' }], resources: [{ type: 'page', pattern: '*' }], actions: ['admin-system'] }
];

function makeEvaluator() {
  const engine = { getManager: (n: string) => (n === 'PolicyManager' ? { getAllPolicies: () => policies } : null) } as never;
  const pe = new PolicyEvaluator(engine);
  (pe as unknown as { policyManager: unknown }).policyManager = { getAllPolicies: () => policies };
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
        const many = decide(pageName);
        expect({ hasDecision: many.hasDecision, allowed: many.allowed, policyName: many.policyName })
          .toEqual({ hasDecision: one.hasDecision, allowed: one.allowed, policyName: one.policyName });
      }
    }
  });

  test('first match wins in both shapes: the deny ahead of the allow decides Admin*', () => {
    const pe = makeEvaluator();
    const decide = pe.compile({ username: 'e', roles: ['editor', 'All'] }, 'page-read');
    expect(decide('AdminDashboard')).toMatchObject({ hasDecision: true, allowed: false, policyName: 'deny-admin-pages' });
    expect(decide('Notes')).toMatchObject({ hasDecision: true, allowed: true, policyName: 'everyone-reads' });
  });

  test('no PolicyManager: no decision, like evaluateAccess', () => {
    const pe = new PolicyEvaluator({ getManager: () => null });
    expect(pe.compile({ roles: ['All'] }, 'page-read')('X')).toMatchObject({ hasDecision: false, allowed: false });
  });
});
