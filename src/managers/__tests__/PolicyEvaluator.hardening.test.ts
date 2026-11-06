/**
 * Condition width, cost and runtime types (#2261 slice 1, review round 2):
 * a value of the wrong type is unknown and not a definite answer, an identity
 * literal meets the normalised subject, a throwing read is one unknown leaf,
 * and a condition is bounded and checked once per policy.
 */

import PolicyEvaluator, { conditionHolds, conditionProblems } from '../PolicyEvaluator';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import { compareLeaf, MAX_CONDITION_NODES, MAX_GROUP_CHILDREN, MAX_IN_ITEMS } from '../../utils/policyAttributes';
import type { Policy, PolicyCondition } from '../../types/Policy';

const PAGE_ATTRIBUTES = {
  owner: { type: 'identity', from: 'frontmatter:author' },
  level: { type: 'integer', from: 'frontmatter:level' },
  status: { type: 'string', from: 'frontmatter:status' },
  draft: { type: 'boolean', from: 'frontmatter:draft' },
  tags: { type: 'list', from: 'frontmatter:tags' }
};
const leaf = (attribute: string, operator: string, value: unknown) => ({ attribute, [operator]: value }) as PolicyCondition;

describe('a value of the wrong type is unknown, not a definite answer', () => {
  test.each([
    ['equals', '5', 5],
    ['not-equals', '5', 5],
    ['equals', ['a'], 'a'],
    ['equals', 'true', true],
    ['not-equals', 'true', true],
    ['in', '5', [5]],
    ['in', 5, ['5']],
    ['greater-or-equal', NaN, 3],
    ['less-or-equal', NaN, 3],
    ['greater-or-equal', Infinity, 3],
    ['less-or-equal', -Infinity, 3],
    ['greater-or-equal', 2.5, 3],
    ['less-or-equal', 3, 2.5]
  ])('%s of %j with %j', (operator, left, right) => {
    expect(compareLeaf(operator, left, right)).toBeUndefined();
  });

  test('in over a list attribute whose entries are not the kind on the left is unknown', () => {
    expect(compareLeaf('in', 'a', ['a', 5])).toBeUndefined();
    expect(compareLeaf('in', 'a', ['a', 'b'])).toBe(true);
  });

  test('a deny on not-equals does not fail open when frontmatter has the wrong type', async () => {
    const read = (n: string) => ({ 'resource:level': '1' })[n];
    expect(await conditionHolds(leaf('resource:level', 'not-equals', 1), read)).toBeUndefined();
  });

  test('an empty string is a value, not a missing one', () => {
    expect(compareLeaf('equals', '', '')).toBe(true);
    expect(compareLeaf('not-equals', '', 'draft')).toBe(true);
  });
});

describe('the PIP reads a value only as its declared type', () => {
  const pip = (frontmatter: Record<string, unknown>) => {
    const engine = {
      getManager: (name: string) => (name === 'ConfigurationManager'
        ? { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.access.resource-types' ? { page: { attributes: PAGE_ATTRIBUTES } } : d) }
        : null)
    } as never;
    return new PolicyInformationPoint(engine).pageAttributesFrom('P', { title: 'P', uuid: 'u', lastModified: '', ...frontmatter }).read;
  };

  test.each([
    ['level', { level: '5' }],
    ['level', { level: NaN }],
    ['level', { level: 2.5 }],
    ['level', { level: Infinity }],
    ['draft', { draft: 'true' }],
    ['status', { status: ['a'] }],
    ['tags', { tags: 'a' }],
    ['tags', { tags: [{ a: 1 }] }]
  ])('%s from %j is missing', async (name, frontmatter) => {
    expect(await pip(frontmatter)(name)).toBeUndefined();
  });

  test('a value of the declared type is read as it is, an empty string included', async () => {
    expect(await pip({ level: 5 })('level')).toBe(5);
    expect(await pip({ draft: false })('draft')).toBe(false);
    expect(await pip({ status: '' })('status')).toBe('');
    expect(await pip({ tags: ['a', 'b'] })('tags')).toEqual(['a', 'b']);
  });

  test('without IdentityManager an owner is compared by its normalised username and a urn: id is missing', async () => {
    expect(await pip({ author: ' Alice ' })('owner')).toBe('alice');
    expect(await pip({ author: 'urn:uuid:3f6c' })('owner')).toBeUndefined();
  });
});

describe('through the evaluator', () => {
  const editor = { username: 'erin', roles: ['editor'], isAuthenticated: true };
  function evaluatorWith(policies: Policy[]): { ev: PolicyEvaluator; getProperty: ReturnType<typeof vi.fn> } {
    const getProperty = vi.fn((k: string, d: unknown) => (k === 'ngdpbase.access.resource-types' ? { page: { attributes: PAGE_ATTRIBUTES }, 'system-category': {} } : d));
    const engine = {
      getManager: (name: string) => {
        if (name === 'ConfigurationManager') return { getProperty };
        if (name === 'PolicyDecisionPoint') return { policies: () => policies, categoriesGranting: () => [] };
        return null;
      }
    } as never;
    return { ev: new PolicyEvaluator(engine), getProperty };
  }
  const policy = (id: string, effect: string, condition: PolicyCondition): Policy => ({
    id, effect, priority: 50,
    subjects: [{ type: 'role', value: 'editor' }],
    resources: [{ type: 'page', pattern: '*' }],
    actions: ['page-edit'],
    condition
  });
  const decide = async (policies: Policy[], read: (n: string) => unknown) => {
    const { ev } = evaluatorWith(policies);
    await ev.initialize();
    return ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: read });
  };

  test('a deny on "Mallory" fires for mallory (identity literals are normalised)', async () => {
    const d = policy('d', 'deny', leaf('subject:id', 'in', ['Mallory', ' Eve ']));
    expect(await decide([d], () => 'mallory')).toMatchObject({ allowed: false, policyIds: ['d'] });
    expect(await decide([d], () => 'eve')).toMatchObject({ allowed: false, policyIds: ['d'] });
    expect(await decide([d, policy('a', 'allow', leaf('subject:id', 'equals', 'ERIN'))], () => 'erin')).toMatchObject({ allowed: true, policyIds: ['a'] });
  });

  test('a not-equals on "Alice" is false for alice', async () => {
    const a = policy('a', 'allow', leaf('subject:id', 'not-equals', 'Alice'));
    expect(await decide([a], () => 'alice')).toMatchObject({ hasDecision: false });
    expect(await decide([a], () => 'bob')).toMatchObject({ allowed: true });
  });

  test('a read that throws makes that leaf unknown and does not abort the decision', async () => {
    const throwing = (n: string) => { if (n === 'resource:status') throw new Error('boom'); return 'erin'; };
    const any = { 'any-of': [leaf('resource:status', 'equals', 'x'), leaf('subject:id', 'equals', 'erin')] } as PolicyCondition;
    expect(await decide([policy('a', 'allow', any)], throwing)).toMatchObject({ allowed: true, policyIds: ['a'] });
    // unknown leaf alone: an allow does not apply, a deny does, as for a missing attribute
    expect(await decide([policy('d', 'deny', leaf('resource:status', 'equals', 'x'))], throwing)).toMatchObject({ allowed: false, policyIds: ['d'] });
    expect(await conditionHolds(leaf('resource:status', 'equals', 'x'), () => Promise.reject(new Error('boom')))).toBeUndefined();
  });

  test('the condition is checked once per policy in compile(), not once per page', async () => {
    const { ev, getProperty } = evaluatorWith([policy('a', 'allow', leaf('resource:level', 'in', [1, 2, 3]))]);
    await ev.initialize();
    const decide1 = ev.compile(editor, 'page-edit');
    getProperty.mockClear();
    for (let i = 0; i < 50; i++) await decide1(`P${i}`, {}, () => 2);
    const declaredReads = getProperty.mock.calls.filter(([k]) => k === 'ngdpbase.access.resource-types');
    // matchesResource reads the type list once per page; the attribute declarations are not read again
    expect(declaredReads.length).toBeLessThanOrEqual(50);
    const stats = vi.spyOn(ev, 'declaredPageAttributes');
    for (let i = 0; i < 50; i++) await decide1(`Q${i}`, {}, () => 2);
    expect(stats).not.toHaveBeenCalled();
  });
});

describe('width limits', () => {
  const ok = leaf('resource:status', 'equals', 'x');
  const problems = (c: unknown) => conditionProblems(c, PAGE_ATTRIBUTES);

  test(`an in list may have ${MAX_IN_ITEMS} values and not one more`, () => {
    expect(problems(leaf('resource:status', 'in', Array.from({ length: MAX_IN_ITEMS }, (_, i) => `v${i}`)))).toEqual([]);
    expect(problems(leaf('resource:status', 'in', Array.from({ length: MAX_IN_ITEMS + 1 }, (_, i) => `v${i}`)))).toEqual([
      `'in' lists ${MAX_IN_ITEMS + 1} values; the limit is ${MAX_IN_ITEMS}; use a list attribute or split it into several policies`
    ]);
  });

  test.each(['any-of', 'all-of'])('%s lists at most the group limit of conditions', (op) => {
    expect(problems({ [op]: Array.from({ length: MAX_GROUP_CHILDREN }, () => ok) })).toEqual([]);
    expect(problems({ [op]: Array.from({ length: MAX_GROUP_CHILDREN + 1 }, () => ok) })).toEqual([
      `'${op}' lists ${MAX_GROUP_CHILDREN + 1} conditions; the limit is ${MAX_GROUP_CHILDREN}; split it into several policies`
    ]);
  });

  test(`a condition may have ${MAX_CONDITION_NODES} nodes in all, however it is split across levels`, () => {
    const wide = { 'any-of': Array.from({ length: 32 }, () => ({ 'all-of': Array.from({ length: 32 }, () => ok) })) };
    expect(problems(wide)).toEqual([`condition has more than ${MAX_CONDITION_NODES} nodes; split it into several policies`]);
  });

  test('a 100k-wide condition is refused quickly, and never holds', async () => {
    const huge = { 'any-of': Array.from({ length: 100_000 }, () => ok) } as PolicyCondition;
    const started = Date.now();
    expect(problems(huge)).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(50);
    const { ev } = (() => {
      const engine = {
        getManager: (name: string) => (name === 'ConfigurationManager'
          ? { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.access.resource-types' ? { page: { attributes: PAGE_ATTRIBUTES } } : d) }
          : name === 'PolicyDecisionPoint' ? { policies: () => [{ id: 'a', effect: 'allow', priority: 1, subjects: [], resources: [], actions: [], condition: huge }], categoriesGranting: () => [] } : null)
      } as never;
      return { ev: new PolicyEvaluator(engine) };
    })();
    await ev.initialize();
    expect(await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: { username: 'e', roles: [] }, readAttribute: () => 'x' })).toMatchObject({ hasDecision: false });
  });
});
