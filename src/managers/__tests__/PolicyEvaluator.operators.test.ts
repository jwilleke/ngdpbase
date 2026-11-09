/**
 * Condition functions and the condition tree (#2261 slice 1, XACML names in
 * #2330): each function, the true/false/unknown rules per node, the depth
 * limit, and every validator message.
 */

import PolicyEvaluator, { conditionHolds, conditionProblems } from '../PolicyEvaluator';
import PolicyValidator from '../PolicyValidator';
import type { Policy, PolicyCondition } from '../../types/Policy';
import { attr, val } from './__fixtures__/conditions';

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

const str = (id: string) => attr(id, 'string');
const int = (id: string) => attr(id, 'integer');
const bool = (id: string) => attr(id, 'boolean');
const T = { 'string-equal': [str('resource:system-category'), val('general')] } as PolicyCondition;
const F = { 'string-equal': [str('resource:system-category'), val('system')] } as PolicyCondition;
const U = { 'string-equal': [str('resource:missing'), val('x')] } as PolicyCondition;
const notEqual = (left: unknown, right: unknown) => ({ not: [{ 'string-equal': [left, right] }] }) as PolicyCondition;

describe('each function', () => {
  test.each([
    [{ 'string-equal': [str('resource:system-category'), val('general')] }, true],
    [{ 'string-equal': [str('resource:system-category'), val('system')] }, false],
    [{ 'string-equal': [str('resource:owner'), str('subject:id')] }, true],
    [notEqual(str('resource:system-category'), val('system')), true],
    [notEqual(str('resource:system-category'), val('general')), false],
    [notEqual(str('resource:owner'), str('subject:id')), false],
    [{ 'string-is-in': [str('resource:system-category'), val(['general', 'user'])] }, true],
    [{ 'string-is-in': [str('resource:system-category'), val(['system', 'user'])] }, false],
    [{ 'integer-is-in': [int('resource:level'), val([1, 3])] }, true],
    [{ 'string-is-in': [str('resource:system-category'), str('resource:tags')] }, false],
    [{ 'integer-greater-than-or-equal': [int('resource:level'), val(3)] }, true],
    [{ 'integer-greater-than-or-equal': [int('resource:level'), val(4)] }, false],
    [{ 'integer-less-than-or-equal': [int('resource:level'), val(3)] }, true],
    [{ 'integer-less-than-or-equal': [int('resource:level'), val(2)] }, false],
    [{ 'integer-greater-than': [int('resource:level'), val(3)] }, false],
    [{ 'integer-greater-than': [int('resource:level'), val(2)] }, true],
    [{ 'integer-less-than': [int('resource:level'), val(3)] }, false],
    [{ 'integer-less-than': [int('resource:level'), val(4)] }, true],
    [{ 'integer-equal': [int('resource:level'), val(3)] }, true],
    [{ 'boolean-equal': [bool('resource:draft'), val(false)] }, true]
  ] as Array<[PolicyCondition, boolean]>)('%j is %s', async (condition, expected) => {
    expect(await conditionHolds(condition, read)).toBe(expected);
  });

  test('is-in with a list attribute as the bag', async () => {
    const withTags = (name: string) => (name === 'resource:system-category' ? 'a' : facts[name]);
    expect(await conditionHolds({ 'string-is-in': [str('resource:system-category'), str('resource:tags')] }, withTags)).toBe(true);
  });

  test.each([
    ['string-equal', { 'string-equal': [str('resource:missing'), val('a')] }],
    ['not of string-equal (not-equals)', notEqual(str('resource:missing'), val('a'))],
    ['string-is-in', { 'string-is-in': [str('resource:missing'), val(['a'])] }],
    ['integer-greater-than-or-equal', { 'integer-greater-than-or-equal': [int('resource:missing'), val(1)] }],
    ['integer-less-than-or-equal', { 'integer-less-than-or-equal': [int('resource:missing'), val(1)] }]
  ] as Array<[string, PolicyCondition]>)('%s is unknown when the attribute is missing', async (_name, condition) => {
    expect(await conditionHolds(condition, read)).toBeUndefined();
  });

  test('a missing attribute on the right is unknown too', async () => {
    expect(await conditionHolds(notEqual(str('resource:owner'), str('resource:missing')), read)).toBeUndefined();
  });

  test('an ordering function on a value that is not a number is unknown', async () => {
    expect(await conditionHolds({ 'integer-greater-than-or-equal': [int('resource:owner'), val(1)] }, read)).toBeUndefined();
  });
});

describe('the tree is judged per node (Jim, question 3)', () => {
  const any = (...c: PolicyCondition[]) => ({ or: c }) as PolicyCondition;
  const all = (...c: PolicyCondition[]) => ({ and: c }) as PolicyCondition;
  const not = (c: PolicyCondition) => ({ not: [c] }) as PolicyCondition;

  test.each([
    ['or', any(T, T), true],
    ['or', any(F, T), true],
    ['or', any(F, F), false],
    ['or', any(U, T), true],
    ['or', any(T, U), true],
    ['or', any(U, F), undefined],
    ['or', any(U, U), undefined],
    ['and', all(T, T), true],
    ['and', all(T, F), false],
    ['and', all(U, F), false],
    ['and', all(F, U), false],
    ['and', all(T, U), undefined],
    ['and', all(U, U), undefined]
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
    id, effect,
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
    const r = await decide([policy('a', 'allow', { or: [U, T] })]);
    expect(r).toMatchObject({ allowed: true, policyIds: ['a'] });
  });

  test('an allow whose only undecided branch is unknown does not apply', async () => {
    const r = await decide([policy('a', 'allow', { or: [U, F] })]);
    expect(r).toMatchObject({ allowed: false, hasDecision: false });
  });

  test('a deny over not of unknown applies', async () => {
    const r = await decide([policy('a', 'allow', T), policy('d', 'deny', { not: [U] })]);
    expect(r).toMatchObject({ allowed: false, policyIds: ['d'] });
  });

  test('a deny over all-of with a false branch does not apply, however unknown the rest', async () => {
    const r = await decide([policy('a', 'allow', T), policy('d', 'deny', { and: [U, F] })]);
    expect(r).toMatchObject({ allowed: true, policyIds: ['a'] });
  });

  test('a nested not-equals deny refuses a non-author and not the author', async () => {
    const d = policy('not-own', 'deny', notEqual(str('resource:owner'), str('subject:id')));
    expect(await decide([d], (n) => (n === 'resource:owner' ? 'sam' : facts[n]))).toMatchObject({ allowed: false, policyIds: ['not-own'] });
    expect(await decide([d, policy('a', 'allow', T)])).toMatchObject({ allowed: true, policyIds: ['a'] });
  });

  test('a condition with a problem inside a tree never applies as an allow, and applies as a deny', async () => {
    const bad = { or: [T, { 'string-equal': [str('resource:department'), val('x')] }] } as PolicyCondition;
    expect(await decide([policy('a', 'allow', bad)])).toMatchObject({ allowed: false, hasDecision: false });
    expect(await decide([policy('d', 'deny', bad)])).toMatchObject({ allowed: false, policyIds: ['d'] });
  });
});

describe('depth limit', () => {
  const nest = (levels: number): PolicyCondition => {
    let c: PolicyCondition = T;
    for (let i = 1; i < levels; i++) c = { not: [c] };
    return c;
  };
  test('4 levels are fine', () => {
    expect(conditionProblems(nest(4), PAGE_ATTRIBUTES)).toEqual([]);
  });
  test('5 levels are refused', () => {
    expect(conditionProblems(nest(5), PAGE_ATTRIBUTES)).toEqual(['conditions are nested 5 deep; the limit is 4; flatten with and or or']);
  });
  test('a condition nested too deep never holds', async () => {
    expect(await conditionHolds(nest(5), read)).toBeUndefined();
  });
});

describe('validator messages', () => {
  const problems = (condition: unknown) => conditionProblems(condition, PAGE_ATTRIBUTES);
  const FUNCTIONS = 'string-equal, integer-equal, boolean-equal, string-is-in, integer-is-in, integer-greater-than, integer-greater-than-or-equal, integer-less-than, integer-less-than-or-equal, and, or, not';

  test.each([
    [{ 'string-equal': [str('resource:owner'), str('subject:id')], 'string-is-in': [str('resource:owner'), val(['x'])] }, "condition has both 'string-equal' and 'string-is-in'; use one function per condition, combine with and"],
    [{ 'string-equal': [str('resource:owner')] }, "'string-equal' takes two arguments; write { \"string-equal\": [ a, b ] }"],
    [{ 'string-contains': [str('resource:owner'), val('x')] }, `condition uses 'string-contains'; use one of ${FUNCTIONS}`],
    [{ or: [] }, "'or' is empty; list at least one condition, or remove the condition"],
    [{ and: [] }, "'and' is empty; list at least one condition, or remove the condition"],
    [{ or: 'x' }, /'or' must be a list of conditions/],
    [{ or: [T], and: [T] }, "condition has both 'or' and 'and'; use one function per condition, combine with and"],
    [{ not: [] }, "'not' takes a list of exactly one condition; write { \"not\": [ … ] }"],
    [{ not: [T, F] }, /'not' takes a list of exactly one condition/],
    [{ 'string-is-in': [str('resource:owner'), val([])] }, "'string-is-in' is empty; list at least one value, or remove the condition"],
    [{ 'string-is-in': [str('resource:owner'), val('x')] }, /'string-is-in' needs a list/],
    [{ 'string-is-in': [str('resource:owner'), int('resource:level')] }, /'string-is-in' needs a list; 'resource:level' is integer/],
    [{ 'string-equal': [str('resource:department'), val('x')] }, "condition reads 'resource:department', which is not declared; declare it on the page resource type in ngdpbase.access.resource-types"],
    [{ 'string-equal': [str('subject:department-id'), val('x')] }, /'subject:department-id', which is not declared/],
    [{ 'boolean-equal': [bool('environment:is-business-hours'), val(true)] }, /'environment:is-business-hours', which is not declared/],
    [{ 'string-equal': [str('resource:level'), val('x')] }, "'resource:level' is declared integer; its datatype must be \"integer\", not \"string\""],
    [{ 'integer-equal': [int('resource:level'), str('resource:owner')] }, "'integer-equal' takes integer; 'resource:owner' has datatype \"string\""],
    [{ 'string-equal': [str('resource:system-category'), str('resource:owner')] }, "condition compares 'resource:system-category' (string) with 'resource:owner' (identity); both sides must have the same type"],
    [{ 'integer-greater-than-or-equal': [int('resource:level'), val('high')] }, "'integer-greater-than-or-equal' takes integer; value \"high\" has datatype \"string\""],
    [{ 'integer-greater-than-or-equal': [int('resource:level'), val('high', 'integer')] }, /value "high" is a string, not the datatype "integer"/],
    [{ 'integer-is-in': [int('resource:level'), val(['a'], 'integer')] }, /"a" is a string, not the datatype "integer"/],
    [{ 'integer-greater-than-or-equal': [str('resource:owner'), val(1)] }, "'integer-greater-than-or-equal' takes integer; 'resource:owner' has datatype \"string\""],
    [{ 'string-equal': [str('resource:tags'), val('a')] }, /'resource:tags' is a list; 'string-equal' needs a single value there/],
    [{ 'boolean-equal': [bool('resource:draft'), val('no', 'boolean')] }, /value "no" is a string, not the datatype "boolean"/],
    [{ or: [T, { and: [{ 'string-equal': [str('resource:department'), val('x')] }] }] }, /not declared/]
  ] as Array<[unknown, string | RegExp]>)('%j', (condition, message) => {
    const got = problems(condition);
    expect(got.length).toBeGreaterThan(0);
    if (typeof message === 'string') expect(got).toEqual([message]);
    else expect(got.join(' ')).toMatch(message);
  });

  test('valid trees have no problems', () => {
    expect(problems({ or: [T, { not: [{ 'integer-less-than-or-equal': [int('resource:level'), val(2)] }] }, { and: [{ 'string-is-in': [str('resource:system-category'), val(['a'])] }, notEqual(str('resource:owner'), str('subject:id'))] }] })).toEqual([]);
  });

  test('the old { attribute, equals } form is refused, and the message shows the new one', () => {
    const got = problems({ attribute: 'resource:owner', equals: 'subject:id' });
    expect(got).toHaveLength(1);
    expect(got[0]).toContain('old form');
    expect(got[0]).toContain('{ "string-equal": [ { "attributeid": "subject:department-id", "datatype": "string" }, { "value": "sales", "datatype": "string" } ] }');
  });

  test('PolicyValidator reports them as semantic errors on the condition field', () => {
    const validator = new PolicyValidator({
      getManager: (name: string) => (name === 'ConfigurationManager'
        ? { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.access.resource-types' ? { page: { attributes: PAGE_ATTRIBUTES } } : d) }
        : null)
    });
    const errors = validator.validateSemantics({
      id: 'p', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-edit'],
      conditions: [], condition: { or: [] }
    });
    expect(errors).toContainEqual({ type: 'semantic', field: 'condition', message: "'or' is empty; list at least one condition, or remove the condition" });
  });
});
