/**
 * The XACML 3.0 condition format in lowercase (#2330): `datatype` is required
 * and checked, function names are XACML's, the old shape is refused with a
 * message that shows the new one, `rule-combining-algorithm` is deny-overrides
 * and nothing else, and a leftover `priority` is ignored and reported once.
 */

import PolicyEvaluator, { conditionHolds, conditionProblems } from '../PolicyEvaluator';
import PolicyValidator from '../PolicyValidator';
import type { Policy, PolicyCondition } from '../../types/Policy';
import { CONDITION_FUNCTIONS, DENY_OVERRIDES_EXPLANATION, RULE_COMBINING_ALGORITHM_KEY } from '../../utils/policyAttributes';
import logger from '../../utils/logger';

const PAGE_ATTRIBUTES = { owner: { type: 'identity' }, level: { type: 'integer' }, draft: { type: 'boolean' }, tags: { type: 'list' } };
const SUBJECT_ATTRIBUTES = { 'department-id': { type: 'string', from: 'profile:department' } };
const problems = (condition: unknown) => conditionProblems(condition, PAGE_ATTRIBUTES, { 'department-id': SUBJECT_ATTRIBUTES['department-id'], id: { type: 'identity', from: 'account:id' } });

// The department example of #2330, in the new form.
const SAME_DEPARTMENT = {
  'string-equal': [
    { attributeid: 'subject:department-id', datatype: 'string' },
    { value: 'sales', datatype: 'string' }
  ]
};

describe('the condition format (#2330)', () => {
  test('the department example is a valid condition', () => {
    expect(problems(SAME_DEPARTMENT)).toEqual([]);
  });

  test('the functions are the XACML 3.0 names in lowercase, and and, or, not', () => {
    expect([...CONDITION_FUNCTIONS].sort()).toEqual([
      'and', 'boolean-equal', 'integer-equal', 'integer-greater-than', 'integer-greater-than-or-equal', 'integer-is-in',
      'integer-less-than', 'integer-less-than-or-equal', 'not', 'or', 'string-equal', 'string-is-in'
    ]);
  });

  describe('datatype is required', () => {
    test('missing on an attribute', () => {
      expect(problems({ 'string-equal': [{ attributeid: 'subject:department-id' }, { value: 'sales', datatype: 'string' }] }))
        .toEqual(['\'subject:department-id\' has no datatype; add "datatype": "string"']);
    });

    test('missing on a value', () => {
      expect(problems({ 'string-equal': [{ attributeid: 'subject:department-id', datatype: 'string' }, { value: 'sales' }] }))
        .toEqual(['value "sales" has no datatype; add "datatype": "string"']);
    });

    test('a name that is not an XACML short name is refused', () => {
      expect(problems({ 'string-equal': [{ attributeid: 'subject:department-id', datatype: 'text' }, { value: 'x', datatype: 'string' }] })[0])
        .toContain('datatype "text"; use one of string, integer, boolean, double, date, time, dateTime, anyURI');
    });

    test('the evaluator does not guess one: a comparison with no datatype is unknown', async () => {
      const read = () => 'sales';
      expect(await conditionHolds({ 'string-equal': [{ attributeid: 'subject:department-id' }, { value: 'sales', datatype: 'string' }] }, read)).toBeUndefined();
      expect(await conditionHolds({ 'string-equal': [{ attributeid: 'subject:department-id', datatype: 'string' }, { value: 'sales' }] }, read)).toBeUndefined();
      expect(await conditionHolds(SAME_DEPARTMENT, read)).toBe(true);
    });
  });

  describe('a datatype that does not match is a problem', () => {
    test.each([
      ['an attribute declared integer, written as string', { 'string-equal': [{ attributeid: 'resource:level', datatype: 'string' }, { value: 'x', datatype: 'string' }] },
        '\'resource:level\' is declared integer; its datatype must be "integer", not "string"'],
      ['an attribute declared string, written as integer', { 'integer-equal': [{ attributeid: 'subject:department-id', datatype: 'integer' }, { value: 1, datatype: 'integer' }] },
        '\'subject:department-id\' is declared string; its datatype must be "string", not "integer"'],
      ['a function that takes another type than the attribute', { 'integer-equal': [{ attributeid: 'subject:department-id', datatype: 'string' }, { value: 1, datatype: 'integer' }] },
        '\'integer-equal\' takes integer; \'subject:department-id\' has datatype "string"'],
      ['a value written with another type than the function takes', { 'string-equal': [{ attributeid: 'subject:department-id', datatype: 'string' }, { value: 1, datatype: 'integer' }] },
        '\'string-equal\' takes string; value 1 has datatype "integer"'],
      ['a value that is not of its datatype', { 'integer-equal': [{ attributeid: 'resource:level', datatype: 'integer' }, { value: '5', datatype: 'integer' }] },
        'value "5" is a string, not the datatype "integer" it is declared with'],
      ['a datatype no function takes yet', { 'string-equal': [{ attributeid: 'subject:department-id', datatype: 'string' }, { value: 'x', datatype: 'double' }] },
        '\'string-equal\' takes string; value "x" has datatype "double"']
    ])('%s', (_name, condition, message) => {
      expect(problems(condition)).toEqual([message]);
    });

    test('and the evaluator fails closed on it: an allow does not apply, a deny does', async () => {
      const mismatched = { 'string-equal': [{ attributeid: 'resource:level', datatype: 'string' }, { value: 'x', datatype: 'string' }] } as PolicyCondition;
      const decide = async (effect: string) => {
        const ev = evaluatorWith([policy('p', effect, mismatched)]);
        await ev.initialize();
        return ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: () => 'x' });
      };
      expect(await decide('allow')).toMatchObject({ allowed: false, hasDecision: false });
      expect(await decide('deny')).toMatchObject({ allowed: false, hasDecision: true, policyIds: ['p'] });
    });
  });

  describe('an unknown function name', () => {
    test.each(['string-equals', 'equals', 'string-contains', 'String-Equal', 'integer-greater-or-equal', 'any-of'])('%s', (name) => {
      const got = problems({ [name]: [{ attributeid: 'subject:department-id', datatype: 'string' }, { value: 'x', datatype: 'string' }] });
      expect(got).toHaveLength(1);
      expect(got[0]).toMatch(new RegExp(`^condition (uses '${name}'; use one of string-equal|is in the old form)`));
    });

    test('names the functions there are', () => {
      expect(problems({ 'string-contains': [] })).toEqual([`condition uses 'string-contains'; use one of ${CONDITION_FUNCTIONS.join(', ')}`]);
    });
  });

  describe('the old shape is refused, with the new form in the message', () => {
    const NEW = '{ "string-equal": [ { "attributeid": "subject:department-id", "datatype": "string" }, { "value": "sales", "datatype": "string" } ] }';
    test.each([
      [{ attribute: 'subject:department-id', equals: 'sales' }, 'equals is string-equal, integer-equal or boolean-equal'],
      [{ attribute: 'subject:department-id', 'not-equals': 'sales' }, 'not-equals is not around string-equal'],
      [{ attribute: 'subject:department-id', in: ['sales'] }, 'in is string-is-in or integer-is-in'],
      [{ attribute: 'resource:level', 'greater-or-equal': 3 }, 'greater-or-equal is integer-greater-than-or-equal'],
      [{ attribute: 'resource:level', 'less-or-equal': 3 }, 'less-or-equal is integer-less-than-or-equal'],
      [{ 'any-of': [SAME_DEPARTMENT] }, 'any-of is or'],
      [{ 'all-of': [SAME_DEPARTMENT] }, 'all-of is and'],
      [{ not: SAME_DEPARTMENT }, 'not takes a list of one condition']
    ])('%j', (condition, hint) => {
      const got = problems(condition);
      expect(got).toHaveLength(1);
      expect(got[0]).toContain('is in the old form');
      expect(got[0]).toContain(NEW);
      expect(got[0]).toContain(hint);
    });

    test('inside a tree too, and the old shape never silently works', async () => {
      const old = { attribute: 'subject:department-id', equals: 'sales' } as never;
      expect(problems({ or: [SAME_DEPARTMENT, old] })[0]).toContain('is in the old form');
      expect(await conditionHolds(old, () => 'sales')).toBeUndefined();
      expect(await conditionHolds({ or: [old] }, () => 'sales')).toBeUndefined();
    });

    test('through the evaluator it never applies as an allow, and applies as a deny', async () => {
      const old = { attribute: 'subject:department-id', equals: 'sales' } as unknown as PolicyCondition;
      const ev = evaluatorWith([policy('a', 'allow', old)]);
      await ev.initialize();
      expect(await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: () => 'sales' })).toMatchObject({ allowed: false, hasDecision: false });
      const ev2 = evaluatorWith([policy('d', 'deny', old)]);
      await ev2.initialize();
      expect(await ev2.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: () => 'other' })).toMatchObject({ allowed: false, policyIds: ['d'] });
    });

    test('start-up reports it by policy id', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      await evaluatorWith([policy('legacy', 'allow', { attribute: 'subject:department-id', equals: 'sales' })]).initialize();
      const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes("'legacy'"));
      warn.mockRestore();
      expect(lines.join()).toContain('is in the old form');
    });
  });
});

describe('rule-combining-algorithm (#2330)', () => {
  test('the one value accepted is deny-overrides, and the start-up log says so in one line', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    await evaluatorWith([policy('a', 'allow'), policy('b', 'deny')], 'deny-overrides').initialize();
    const lines = info.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('Access policies:'));
    info.mockRestore();
    expect(lines).toEqual(['Access policies: 2 loaded, rule-combining-algorithm deny-overrides']);
  });

  test.each([['permit-overrides'], ['first-applicable'], ['Deny-Overrides'], [''], [null], [7], [['deny-overrides']]])('%j stops start-up', async (value) => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    await expect(evaluatorWith([policy('a', 'allow')], value).initialize()).rejects.toThrow(/rule-combining-algorithm is .*the only value accepted is "deny-overrides"/);
    expect(error.mock.calls.map((c) => String(c[0])).join()).toContain('the site does not start');
    error.mockRestore();
  });

  test('the validator refuses it on save, with the same message', () => {
    const validator = new PolicyValidator({ getManager: () => null });
    expect(validator.combiningAlgorithmProblems('deny-overrides')).toEqual([]);
    expect(validator.combiningAlgorithmProblems('permit-overrides')).toEqual([`${RULE_COMBINING_ALGORITHM_KEY} is "permit-overrides"; the only value accepted is "deny-overrides"`]);
  });

  test('the sentence Admin → Configuration shows', () => {
    expect(DENY_OVERRIDES_EXPLANATION).toBe('Any matching deny wins. Order and priority don\'t matter.');
  });
});

describe('a leftover priority (#2330)', () => {
  test('is reported once at start-up as ignored, naming each policy', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    await evaluatorWith([policy('old-one', 'allow', undefined, { priority: 90 }), policy('old-two', 'deny', undefined, { priority: 1 }), policy('clean', 'allow')]).initialize();
    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('priority'));
    warn.mockRestore();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("'old-one', 'old-two' have a priority, which is ignored");
    expect(lines[0]).not.toContain('clean');
  });

  test('is not reported when there is none', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    await evaluatorWith([policy('clean', 'allow')]).initialize();
    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('priority'));
    warn.mockRestore();
    expect(lines).toEqual([]);
  });

  test('changes nothing: a deny of priority 1 beats an allow of priority 900, and the list order is the configured one', async () => {
    const policies = [policy('high-allow', 'allow', undefined, { priority: 900 }), policy('low-deny', 'deny', undefined, { priority: 1 })];
    const ev = evaluatorWith(policies);
    await ev.initialize();
    const r = await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor });
    expect(r).toMatchObject({ allowed: false, policyIds: ['low-deny'] });
    const withoutPriority = evaluatorWith(policies.map(({ priority: _p, ...rest }) => rest as Policy));
    await withoutPriority.initialize();
    expect(await withoutPriority.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor })).toEqual(r);
  });
});

const editor = { username: 'erin', roles: ['editor'], isAuthenticated: true };

function policy(id: string, effect: string, condition?: unknown, extra: Record<string, unknown> = {}): Policy {
  return {
    id, effect,
    subjects: [{ type: 'role', value: 'editor' }],
    resources: [{ type: 'page', pattern: '*' }],
    actions: ['page-edit'],
    ...(condition === undefined ? {} : { condition }),
    ...extra
  } as Policy;
}

function evaluatorWith(policies: Policy[], algorithm: unknown = 'deny-overrides'): PolicyEvaluator {
  const config: Record<string, unknown> = {
    'ngdpbase.access.resource-types': { page: { attributes: PAGE_ATTRIBUTES }, 'system-category': {} },
    'ngdpbase.access.subject-attributes': SUBJECT_ATTRIBUTES,
    [RULE_COMBINING_ALGORITHM_KEY]: algorithm
  };
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d), getUnresolvedProperty: (k: string, d: unknown) => (k in config ? config[k] : d) };
      if (name === 'PolicyDecisionPoint') return { policies: () => policies, categoriesGranting: () => [] };
      return null;
    }
  } as never;
  return new PolicyEvaluator(engine);
}
