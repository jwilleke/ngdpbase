/**
 * #2288 — an allow that matched but whose condition was not met is named.
 *
 * `evaluateAccess` (one page) and `compile` (a list) both return the ids in
 * `conditionNotMet`, for a false and for an unknown condition, and never the
 * attribute values. The Decision and the audit record are covered by
 * routes/__tests__/WikiRoutes.conditionNotMet.test.ts.
 */
import PolicyEvaluator from '../PolicyEvaluator';
import type { Policy } from '../../types/Policy';

const AAL2 = { attribute: 'subject:aal', 'greater-or-equal': 2 };
const allow = (id: string, condition?: unknown): Policy => ({
  id, effect: 'allow', priority: 50,
  subjects: [{ type: 'role', value: 'editor' }],
  resources: [{ type: 'page', pattern: '*' }],
  actions: ['page-edit'],
  ...(condition ? { condition } : {})
} as Policy);
const deny = (id: string): Policy => ({ ...allow(id), effect: 'deny' });

const editor = { username: 'ed', roles: ['editor'], isAuthenticated: true };
const SECRET_AAL = 1;

async function evaluatorWith(policies: Policy[]): Promise<PolicyEvaluator> {
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
      if (name === 'PolicyDecisionPoint') return { policies: () => policies, categoriesGranting: () => [] };
      return null;
    }
  } as never;
  const evaluator = new PolicyEvaluator(engine);
  await evaluator.initialize();
  return evaluator;
}
const aal = (value: unknown) => (name: string) => (name === 'subject:aal' ? value : undefined);
const ask = (e: PolicyEvaluator, readAttribute: (n: string) => unknown) =>
  e.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute });

describe('conditionNotMet on the evaluator (#2288)', () => {
  test('a false condition: no decision, the allow is named', async () => {
    const r = await ask(await evaluatorWith([allow('editor-edit-aal2', AAL2)]), aal(SECRET_AAL));
    expect(r).toMatchObject({ hasDecision: false, allowed: false, policyIds: [], conditionNotMet: ['editor-edit-aal2'] });
  });

  test('an unknown condition (the attribute is missing) is named too', async () => {
    const r = await ask(await evaluatorWith([allow('editor-edit-aal2', AAL2)]), aal(undefined));
    expect(r.conditionNotMet).toEqual(['editor-edit-aal2']);
  });

  test('a true condition, or none, names nothing', async () => {
    const e = await evaluatorWith([allow('a', AAL2), allow('b')]);
    const r = await ask(e, aal(2));
    expect(r.allowed).toBe(true);
    expect(r.conditionNotMet).toBeUndefined();
  });

  test('an allow that decided is not listed beside the one that did not', async () => {
    const r = await ask(await evaluatorWith([allow('met'), allow('not-met', AAL2)]), aal(SECRET_AAL));
    expect(r).toMatchObject({ allowed: true, policyIds: ['met'], conditionNotMet: ['not-met'] });
  });

  test('a deny that decides keeps its own ids; the unmet allow is still named', async () => {
    const r = await ask(await evaluatorWith([deny('no'), allow('not-met', AAL2)]), aal(SECRET_AAL));
    expect(r).toMatchObject({ allowed: false, policyIds: ['no'], conditionNotMet: ['not-met'] });
  });

  test('a policy that does not match subject, resource or action is not named', async () => {
    const other = { ...allow('other-role', AAL2), subjects: [{ type: 'role', value: 'admin' }] } as Policy;
    const wrongAction = { ...allow('other-action', AAL2), actions: ['page-read'] } as Policy;
    const r = await ask(await evaluatorWith([other, wrongAction]), aal(SECRET_AAL));
    expect(r.conditionNotMet).toBeUndefined();
  });

  test('no attribute value appears in the result', async () => {
    const r = await ask(await evaluatorWith([allow('editor-edit-aal2', AAL2)]), aal(SECRET_AAL));
    expect(JSON.stringify(r)).not.toMatch(/"(?:value|aal|attribute)"/);
    expect(Object.keys(r).sort()).toEqual(['allowed', 'conditionNotMet', 'hasDecision', 'policyIds', 'policyName', 'reason']);
  });

  test('the list path (compile) names the same ids as the single path', async () => {
    const e = await evaluatorWith([allow('editor-edit-aal2', AAL2)]);
    const single = await ask(e, aal(SECRET_AAL));
    const listed = await e.compile(editor, 'page-edit')('P', undefined, aal(SECRET_AAL));
    expect(listed.conditionNotMet).toEqual(single.conditionNotMet);
    expect(listed.hasDecision).toBe(false);
    expect((await e.compile(editor, 'page-edit')('P', undefined, aal(2))).conditionNotMet).toBeUndefined();
  });
});
