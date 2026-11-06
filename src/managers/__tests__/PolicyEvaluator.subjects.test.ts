/**
 * The `authenticated` and `anyone` policy subjects (#2261 slice 2): who each
 * matches, that neither takes a value, and that a list (`compile`) and a single
 * decision (`evaluateAccess`) agree on them.
 */

import PolicyEvaluator, { SUBJECT_MATCHERS } from '../PolicyEvaluator';
import type { Policy } from '../../types/Policy';

const signedIn = { username: 'erin', roles: ['editor'], isAuthenticated: true };
const noRoles = { username: 'nora', roles: [], isAuthenticated: true };
const anonymous = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false };
const admin = { username: 'ada', roles: ['admin'], isAuthenticated: true };
// What the PIP hands the evaluator for a scheduled run that acts as a job (#1999).
const job = { username: 'job:dues.invoices', roles: [], isAuthenticated: true, job: 'dues.invoices' };
// An agent token reaches the evaluator as its account: the PDP builds the context from `username`, `roles`, `isAuthenticated`.
const agentToken = { username: 'erin', roles: ['editor'], isAuthenticated: true };
const shareVisitor = { username: 'erin', roles: ['editor'], isAuthenticated: true, viaShare: { id: 's1' } };

function evaluatorWith(policies: Policy[]): PolicyEvaluator {
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
      if (name === 'PolicyDecisionPoint') return { policies: () => policies, categoriesGranting: () => [] };
      return null;
    }
  } as never;
  return new PolicyEvaluator(engine);
}

const general = { 'system-category': 'general' };
const policy = (id: string, type: string, extra: Partial<Policy> = {}): Policy => ({
  id, effect: 'allow', priority: 50,
  subjects: [{ type } as never],
  resources: [{ type: 'system-category', pattern: 'general' }],
  actions: ['page-read'],
  ...extra
});

describe('authenticated matcher (#2261)', () => {
  const m = SUBJECT_MATCHERS.authenticated;
  test.each([
    ['a signed-in user', signedIn, true],
    ['a signed-in user with empty roles', noRoles, true],
    ['an admin', admin, true],
    ['an agent token, which is its account', agentToken, true],
    ['an anonymous caller', anonymous, false],
    ['a share-link visitor', shareVisitor, false],
    ['a job context', job, false],
    ['no context at all', undefined, false]
  ])('%s', (_label, ctx, expected) => {
    expect(m('', ctx)).toBe(expected);
  });

  test('a context claiming isAuthenticated as a truthy non-boolean is not authenticated', () => {
    expect(m('', { username: 'x', roles: [], isAuthenticated: 'yes' })).toBe(false);
  });
});

describe('anyone matcher (#2261)', () => {
  const m = SUBJECT_MATCHERS.anyone;
  test.each([
    ['signed-in', signedIn], ['empty roles', noRoles], ['admin', admin], ['anonymous', anonymous],
    ['share visitor', shareVisitor], ['agent token', agentToken], ['job context', job], ['no context', undefined]
  ])('%s matches', (_label, ctx) => {
    expect(m('', ctx)).toBe(true);
  });
});

describe('through the evaluator (#2261)', () => {
  test('anyone + page-read on general lets an anonymous caller read', async () => {
    const ev = evaluatorWith([policy('anyone-reads', 'anyone')]);
    await ev.initialize();
    const r = await ev.evaluateAccess({ pageName: 'P', action: 'page-read', userContext: anonymous, attributes: general });
    expect(r).toMatchObject({ allowed: true, hasDecision: true, policyIds: ['anyone-reads'] });
  });

  test('authenticated + page-read: a signed-in user with no role reads; anonymous gets no decision', async () => {
    const ev = evaluatorWith([policy('auth-reads', 'authenticated')]);
    await ev.initialize();
    expect(await ev.evaluateAccess({ pageName: 'P', action: 'page-read', userContext: noRoles, attributes: general }))
      .toMatchObject({ allowed: true, policyIds: ['auth-reads'] });
    expect(await ev.evaluateAccess({ pageName: 'P', action: 'page-read', userContext: anonymous, attributes: general }))
      .toMatchObject({ allowed: false, hasDecision: false });
  });

  test('a share visitor does not satisfy an authenticated policy', async () => {
    const ev = evaluatorWith([policy('auth-reads', 'authenticated')]);
    await ev.initialize();
    expect(await ev.evaluateAccess({ pageName: 'P', action: 'page-read', userContext: shareVisitor, attributes: general }))
      .toMatchObject({ allowed: false, hasDecision: false });
  });

  test('a deny for anyone refuses admin too', async () => {
    const ev = evaluatorWith([
      policy('admin-all', 'role', { subjects: [{ type: 'role', value: 'admin' }] }),
      policy('nobody', 'anyone', { effect: 'deny' })
    ]);
    await ev.initialize();
    expect(await ev.evaluateAccess({ pageName: 'P', action: 'page-read', userContext: admin, attributes: general }))
      .toMatchObject({ allowed: false, policyIds: ['nobody'] });
  });

  test('the compile list path returns the same set as evaluateAccess', async () => {
    const ev = evaluatorWith([
      policy('auth-reads', 'authenticated', { resources: [{ type: 'page', pattern: 'A*' }] }),
      policy('anyone-reads', 'anyone', { resources: [{ type: 'page', pattern: 'B*' }] }),
      policy('deny-anyone', 'anyone', { effect: 'deny', resources: [{ type: 'page', pattern: 'Bx*' }] })
    ]);
    await ev.initialize();
    const pages = ['Apple', 'Berry', 'Bxray', 'Cherry'];
    for (const userContext of [signedIn, noRoles, admin, anonymous, shareVisitor, job, agentToken]) {
      const decide = ev.compile(userContext, 'page-read');
      const listed: string[] = [];
      const single: string[] = [];
      for (const pageName of pages) {
        if ((await decide(pageName)).allowed) listed.push(pageName);
        if ((await ev.evaluateAccess({ pageName, action: 'page-read', userContext })).allowed) single.push(pageName);
      }
      expect(listed).toEqual(single);
    }
    // And the set is not trivially empty or full.
    const set = async (u: object) => {
      const d = ev.compile(u, 'page-read');
      return (await Promise.all(pages.map(async (p) => ((await d(p)).allowed ? p : null)))).filter(Boolean);
    };
    expect(await set(signedIn)).toEqual(['Apple', 'Berry']);
    expect(await set(anonymous)).toEqual(['Berry']);
  });
});
