/**
 * The seed of attribute-based access (#2255; the rest is #2261): a policy's
 * `condition` with `equals`, a missing attribute failing closed, deny
 * overriding allow, and every decision naming the policies that decided it.
 */

import PolicyEvaluator, { conditionHolds, conditionProblems } from '../PolicyEvaluator';
import type { Policy } from '../../types/Policy';
import logger from '../../utils/logger';

const PAGE_ATTRIBUTES = { 'system-category': { type: 'string' }, owner: { type: 'identity' } };

function evaluatorWith(policies: Policy[]): PolicyEvaluator {
  const config: Record<string, unknown> = {
    'ngdpbase.access.resource-types': { page: { attributes: PAGE_ATTRIBUTES }, 'system-category': {} }
  };
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
const allow = (id: string, extra: Partial<Policy> = {}): Policy => ({
  id, effect: 'allow', priority: 50,
  subjects: [{ type: 'role', value: 'editor' }],
  resources: [{ type: 'page', pattern: '*' }],
  actions: ['page-edit'],
  ...extra
});
const OWNER = { attribute: 'resource:owner', equals: 'subject:id' };
const reader = (owner: unknown) => (name: string) => (name === 'resource:owner' ? owner : name === 'subject:id' ? 'erin' : undefined);

describe('conditions, deny-overrides and deciding policy ids (#2255)', () => {
  test('a deny beats an allow, even one of higher priority', async () => {
    const ev = evaluatorWith([allow('high-allow', { priority: 900 }), allow('low-deny', { effect: 'deny', priority: 1 })]);
    await ev.initialize();
    const r = await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor });
    expect(r.allowed).toBe(false);
    expect(r.policyIds).toEqual(['low-deny']);
  });

  test('with no deny, the decision lists every allow that matched', async () => {
    const ev = evaluatorWith([allow('a'), allow('b')]);
    await ev.initialize();
    const r = await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor });
    expect(r).toMatchObject({ allowed: true, hasDecision: true, policyIds: ['a', 'b'] });
  });

  test('no matching policy is a deny with no policy ids', async () => {
    const ev = evaluatorWith([allow('a', { actions: ['page-read'] })]);
    await ev.initialize();
    const r = await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor });
    expect(r).toMatchObject({ allowed: false, hasDecision: false, policyIds: [] });
  });

  test('an allow with a true condition applies; a false one does not', async () => {
    const ev = evaluatorWith([allow('own', { condition: OWNER })]);
    await ev.initialize();
    expect((await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: reader('erin') })).allowed).toBe(true);
    expect((await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: reader('bob') })).allowed).toBe(false);
  });

  test('a missing owner fails closed: the allow does not apply, the deny does', async () => {
    const ev = evaluatorWith([allow('own', { condition: OWNER }), allow('not-own', { effect: 'deny', actions: ['page-delete'], condition: OWNER })]);
    await ev.initialize();
    const edit = await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: reader(undefined) });
    expect(edit).toMatchObject({ allowed: false, policyIds: [] });
    const del = await ev.evaluateAccess({ pageName: 'P', action: 'page-delete', userContext: editor, readAttribute: reader(undefined) });
    expect(del).toMatchObject({ allowed: false, hasDecision: true, policyIds: ['not-own'] });
  });

  test('a literal on the right-hand side is compared as is', async () => {
    expect(await conditionHolds({ attribute: 'resource:system-category', equals: 'general' }, () => 'general')).toBe(true);
    expect(await conditionHolds({ attribute: 'resource:system-category', equals: 'general' }, () => 'system')).toBe(false);
    expect(await conditionHolds({ attribute: 'resource:system-category', equals: 'general' }, () => null)).toBeUndefined();
  });

  test('a policy granting the pushed-pages twin matches a page write (actions)', async () => {
    const ev = evaluatorWith([allow('pushed', { actions: ['pushed-pages-edit'] })]);
    await ev.initialize();
    const r = await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', actions: ['page-edit', 'pushed-pages-edit'], userContext: editor });
    expect(r.policyIds).toEqual(['pushed']);
  });

  test('the compiled list check combines the same way', async () => {
    const ev = evaluatorWith([allow('a'), allow('d', { effect: 'deny' })]);
    await ev.initialize();
    const check = ev.compile(editor, 'page-edit');
    expect(await check('P')).toMatchObject({ allowed: false, policyIds: ['d'] });
  });

  describe('a condition with a problem never applies as an allow', () => {
    test.each([
      [{ attribute: 'resource:owner', contains: 'subject:id' }, /uses 'contains'; use one of equals, not-equals/],
      [{ attribute: 'owner', equals: 'subject:id' }, /must name an attribute/],
      [{ attribute: 'resource:department', equals: 'subject:id' }, /'resource:department', which is not declared/],
      [{ attribute: 'environment:is-business-hours', equals: true }, /not declared/],
      [{ attribute: 'resource:system-category', equals: 'subject:id' }, /same type/]
    ])('%j', (condition, message) => {
      expect(conditionProblems(condition, PAGE_ATTRIBUTES).join(' ')).toMatch(message);
    });

    test('the shipped owner condition has none', () => {
      expect(conditionProblems(OWNER, PAGE_ATTRIBUTES)).toEqual([]);
    });

    test('an allow whose condition reads an undeclared attribute does not apply', async () => {
      const ev = evaluatorWith([allow('bad', { condition: { attribute: 'resource:department', equals: 'x' } })]);
      await ev.initialize();
      const r = await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: () => 'x' });
      expect(r.allowed).toBe(false);
    });
  });
});

describe('the boot warning for a condition with a problem (#2278)', () => {
  const bad = { 'any-of': [] } as never;
  const warned = async (policies: Policy[]): Promise<string[]> => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    await evaluatorWith(policies).initialize();
    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("'p1'"));
    warn.mockRestore();
    return lines;
  };

  test('an allow never applies', async () => {
    const lines = await warned([allow('p1', { condition: bad })]);
    expect(lines.join()).toContain('the policy never applies as an allow');
  });

  test('a deny always applies', async () => {
    const lines = await warned([allow('p1', { effect: 'deny', condition: bad })]);
    expect(lines.join()).toContain('the deny always applies');
    expect(lines.join()).not.toContain('never applies as an allow');
  });
});
