/**
 * Condition operators and the condition tree (#2261 slice 1): each operator,
 * the true/false/unknown rules per node, the depth limit, and every
 * validator message.
 */

import PolicyEvaluator, { conditionHolds, conditionProblems } from '../PolicyEvaluator';
import PolicyValidator from '../PolicyValidator';
import type { Policy, PolicyCondition } from '../../types/Policy';

const PAGE_ATTRIBUTES = {
  'system-category': { type: 'string' },
  owner: { type: 'identity' },
  level: { type: 'integer' },
  tags: { type: 'list' },
  draft: { type: 'boolean' },
  missing: { type: 'string' }
};

const facts: Record<string, unknown> = {
  'resource:system-category': 'general',
  'resource:owner': 'erin',
  'resource:level': 3,
  'resource:tags': ['a', 'b'],
  'resource:draft': false,
  'subject:id': 'erin'
};
const read = (name: string) => facts[name];

const leaf = (attribute: string, operator: string, value: unknown) => ({ attribute, [operator]: value }) as PolicyCondition;
const T = leaf('resource:system-category', 'equals', 'general');
const F = leaf('resource:system-category', 'equals', 'system');
const U = leaf('resource:missing', 'equals', 'x');

describe('each operator', () => {
  test.each([
    [leaf('resource:system-category', 'equals', 'general'), true],
    [leaf('resource:system-category', 'equals', 'system'), false],
    [leaf('resource:owner', 'equals', 'subject:id'), true],
    [leaf('resource:system-category', 'not-equals', 'system'), true],
    [leaf('resource:system-category', 'not-equals', 'general'), false],
    [leaf('resource:owner', 'not-equals', 'subject:id'), false],
    [leaf('resource:system-category', 'in', ['general', 'user']), true],
    [leaf('resource:system-category', 'in', ['system', 'user']), false],
    [leaf('resource:level', 'in', [1, 3]), true],
    [leaf('resource:system-category', 'in', 'resource:tags'), false],
    [leaf('resource:level', 'greater-or-equal', 3), true],
    [leaf('resource:level', 'greater-or-equal', 4), false],
    [leaf('resource:level', 'less-or-equal', 3), true],
    [leaf('resource:level', 'less-or-equal', 2), false],
    [leaf('resource:draft', 'equals', false), true]
  ])('%j is %s', async (condition, expected) => {
    expect(await conditionHolds(condition, read)).toBe(expected);
  });

  test('in with a list attribute on the right', async () => {
    const withTags = (name: string) => (name === 'resource:system-category' ? 'a' : facts[name]);
    expect(await conditionHolds(leaf('resource:system-category', 'in', 'resource:tags'), withTags)).toBe(true);
  });

  test.each([
    ['equals'],
    ['not-equals'],
    ['in'],
    ['greater-or-equal'],
    ['less-or-equal']
  ])('%s is unknown when the attribute is missing', async (operator) => {
    const value = operator === 'in' ? ['a'] : 1;
    expect(await conditionHolds(leaf('resource:missing', operator, value), read)).toBeUndefined();
  });

  test('a missing attribute on the right is unknown too', async () => {
    expect(await conditionHolds(leaf('resource:owner', 'not-equals', 'resource:missing'), read)).toBeUndefined();
  });

  test('an ordering operator on a value that is not a number is unknown', async () => {
    expect(await conditionHolds(leaf('resource:owner', 'greater-or-equal', 1), read)).toBeUndefined();
  });
});

describe('the tree is judged per node (Jim, question 3)', () => {
  const any = (...c: PolicyCondition[]) => ({ 'any-of': c }) as PolicyCondition;
  const all = (...c: PolicyCondition[]) => ({ 'all-of': c }) as PolicyCondition;
  const not = (c: PolicyCondition) => ({ not: c }) as PolicyCondition;

  test.each([
    ['any-of', any(T, T), true],
    ['any-of', any(F, T), true],
    ['any-of', any(F, F), false],
    ['any-of', any(U, T), true],
    ['any-of', any(T, U), true],
    ['any-of', any(U, F), undefined],
    ['any-of', any(U, U), undefined],
    ['all-of', all(T, T), true],
    ['all-of', all(T, F), false],
    ['all-of', all(U, F), false],
    ['all-of', all(F, U), false],
    ['all-of', all(T, U), undefined],
    ['all-of', all(U, U), undefined]
  ])('%s %j', async (_name, condition, expected) => {
    expect(await conditionHolds(condition, read)).toBe(expected);
  });

  test.each([
    [not(T), false],
    [not(F), true],
    [not(U), undefined],
    [not(not(U)), undefined],
    [not(any(U, T)), false],
    [all(not(F), any(U, T)), true]
  ])('%j', async (condition, expected) => {
    expect(await conditionHolds(condition, read)).toBe(expected);
  });
});

describe('policies over a tree', () => {
  function evaluatorWith(policies: Policy[]): PolicyEvaluator {
    const config: Record<string, unknown> = { 'ngdpbase.access.resource-types': { page: { attributes: PAGE_ATTRIBUTES }, 'system-category': {} } };
    const engine = {
      getManager: (name: string) => {
        if (name === 'ConfigurationManager') return { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d) };
        if (name === 'PolicyDecisionPoint') return { policies: () => policies, categoriesGranting: () => [] };
        return null;
      }
    } as never;
    return new PolicyEvaluator(engine);
  }
  const editor = { username: 'erin', roles: ['editor'], isAuthenticated: true };
  const policy = (id: string, effect: string, condition: PolicyCondition): Policy => ({
    id, effect, priority: 50,
    subjects: [{ type: 'role', value: 'editor' }],
    resources: [{ type: 'page', pattern: '*' }],
    actions: ['page-edit'],
    condition
  });
  const decide = async (policies: Policy[], reader = read) => {
    const ev = evaluatorWith(policies);
    await ev.initialize();
    const direct = await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: reader });
    const listed = await ev.compile(editor, 'page-edit')('P', {}, reader);
    expect(listed.allowed).toBe(direct.allowed);
    expect(listed.policyIds).toEqual(direct.policyIds);
    return direct;
  };

  test('an allow over any-of with one true branch applies, even beside a missing one', async () => {
    const r = await decide([policy('a', 'allow', { 'any-of': [U, T] })]);
    expect(r).toMatchObject({ allowed: true, policyIds: ['a'] });
  });

  test('an allow whose only undecided branch is unknown does not apply', async () => {
    const r = await decide([policy('a', 'allow', { 'any-of': [U, F] })]);
    expect(r).toMatchObject({ allowed: false, hasDecision: false });
  });

  test('a deny over not of unknown applies', async () => {
    const r = await decide([policy('a', 'allow', T), policy('d', 'deny', { not: U })]);
    expect(r).toMatchObject({ allowed: false, policyIds: ['d'] });
  });

  test('a deny over all-of with a false branch does not apply, however unknown the rest', async () => {
    const r = await decide([policy('a', 'allow', T), policy('d', 'deny', { 'all-of': [U, F] })]);
    expect(r).toMatchObject({ allowed: true, policyIds: ['a'] });
  });

  test('a nested not-equals deny refuses a non-author and not the author', async () => {
    const d = policy('not-own', 'deny', { not: { attribute: 'resource:owner', equals: 'subject:id' } });
    expect(await decide([d], (n) => (n === 'resource:owner' ? 'sam' : facts[n]))).toMatchObject({ allowed: false, policyIds: ['not-own'] });
    expect(await decide([d, policy('a', 'allow', T)])).toMatchObject({ allowed: true, policyIds: ['a'] });
  });

  test('a condition with a problem inside a tree never applies as an allow, and applies as a deny', async () => {
    const bad = { 'any-of': [T, { attribute: 'resource:department', equals: 'x' }] } as PolicyCondition;
    expect(await decide([policy('a', 'allow', bad)])).toMatchObject({ allowed: false, hasDecision: false });
    expect(await decide([policy('d', 'deny', bad)])).toMatchObject({ allowed: false, policyIds: ['d'] });
  });
});

describe('depth limit', () => {
  const nest = (levels: number): PolicyCondition => {
    let c: PolicyCondition = T;
    for (let i = 1; i < levels; i++) c = { not: c };
    return c;
  };
  test('4 levels are fine', () => {
    expect(conditionProblems(nest(4), PAGE_ATTRIBUTES)).toEqual([]);
  });
  test('5 levels are refused', () => {
    expect(conditionProblems(nest(5), PAGE_ATTRIBUTES)).toEqual(['conditions are nested 5 deep; the limit is 4; flatten with all-of or any-of']);
  });
  test('a condition nested too deep never holds', async () => {
    expect(await conditionHolds(nest(5), read)).toBeUndefined();
  });
});

describe('validator messages', () => {
  const problems = (condition: unknown) => conditionProblems(condition, PAGE_ATTRIBUTES);

  test.each([
    [{ attribute: 'resource:owner', equals: 'subject:id', in: ['x'] }, "condition has both 'equals' and 'in'; use one operator per condition, combine with all-of"],
    [{ attribute: 'resource:owner' }, /has no operator/],
    [{ attribute: 'resource:owner', contains: 'x' }, "condition uses 'contains'; use one of equals, not-equals, in, greater-or-equal, less-or-equal, any-of, all-of, not"],
    [{ 'any-of': [] }, "'any-of' is empty; list at least one condition, or remove the condition"],
    [{ 'all-of': [] }, "'all-of' is empty; list at least one condition, or remove the condition"],
    [{ 'any-of': 'x' }, /'any-of' must be a list of conditions/],
    [{ 'any-of': [T], 'all-of': [T] }, "condition has both 'any-of' and 'all-of'; use one operator per condition, combine with all-of"],
    [{ not: [] }, /condition must be an object/],
    [{ attribute: 'resource:owner', in: [] }, "'in' is empty; list at least one value, or remove the condition"],
    [{ attribute: 'resource:owner', in: 'x' }, /'in' must be a list of values or a list attribute/],
    [{ attribute: 'resource:owner', in: ['subject:id'] }, /names an attribute; list literal values only/],
    [{ attribute: 'resource:owner', in: 'resource:level' }, /'in' needs a list/],
    [{ attribute: 'resource:department', equals: 'x' }, "condition reads 'resource:department', which is not declared; declare it on the page resource type in ngdpbase.access.resource-types"],
    [{ attribute: 'subject:department-id', equals: 'x' }, /'subject:department-id', which is not declared/],
    [{ attribute: 'environment:is-business-hours', equals: true }, /'environment:is-business-hours', which is not declared/],
    [{ attribute: 'resource:level', equals: 'resource:owner' }, "condition compares 'resource:level' (integer) with 'resource:owner' (identity); both sides must have the same type"],
    [{ attribute: 'resource:level', 'greater-or-equal': 'high' }, /compares 'resource:level' \(integer\) with "high" \(string\)/],
    [{ attribute: 'resource:level', in: ['a'] }, /compares 'resource:level' \(integer\) with "a" \(string\)/],
    [{ attribute: 'resource:owner', 'greater-or-equal': 1 }, /'greater-or-equal' works on integer attributes/],
    [{ attribute: 'resource:tags', equals: 'a' }, /'equals' works on string, integer, boolean, identity attributes/],
    [{ attribute: 'resource:draft', equals: 'no' }, /compares 'resource:draft' \(boolean\) with "no" \(string\)/],
    [{ 'any-of': [T, { 'all-of': [{ attribute: 'resource:department', equals: 'x' }] }] }, /not declared/]
  ])('%j', (condition, message) => {
    const got = problems(condition);
    expect(got.length).toBeGreaterThan(0);
    if (typeof message === 'string') expect(got).toEqual([message]);
    else expect(got.join(' ')).toMatch(message);
  });

  test('valid trees have no problems', () => {
    expect(problems({ 'any-of': [T, { not: leaf('resource:level', 'less-or-equal', 2) }, { 'all-of': [leaf('resource:system-category', 'in', ['a']), leaf('resource:owner', 'not-equals', 'subject:id')] }] })).toEqual([]);
  });

  test('the old { attribute, equals } form is valid as it was', () => {
    expect(problems({ attribute: 'resource:owner', equals: 'subject:id' })).toEqual([]);
  });

  test('PolicyValidator reports them as semantic errors on the condition field', () => {
    const validator = new PolicyValidator({
      getManager: (name: string) => (name === 'ConfigurationManager'
        ? { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.access.resource-types' ? { page: { attributes: PAGE_ATTRIBUTES } } : d) }
        : null)
    });
    const errors = validator.validateSemantics({
      id: 'p', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-edit'],
      conditions: [], condition: { 'any-of': [] }
    });
    expect(errors).toContainEqual({ type: 'semantic', field: 'condition', message: "'any-of' is empty; list at least one condition, or remove the condition" });
  });
});
