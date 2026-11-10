/**
 * The XACML 3.0 condition format in lowercase (#2330): `datatype` is required
 * and checked, function names are XACML's, the old shape is refused with a
 * message that shows the new one, `rule-combining-algorithm` is deny-overrides
 * and nothing else, and a leftover `priority` is ignored and reported once.
 */

import PolicyEvaluator, { conditionHolds, conditionProblems } from '../PolicyEvaluator';
import PolicyValidator from '../PolicyValidator';
import type { Policy, PolicyCondition } from '../../types/Policy';
import { CONDITION_FUNCTIONS, DENY_OVERRIDES_EXPLANATION, RULE_COMBINING_ALGORITHM_KEY, unenforcedConditionsNotice } from '../../utils/policyAttributes';
import logger from '../../utils/logger';

/** The needs-attention item as an administrator reads it: the headline, then one line per problem (#2348). */
const itemText = (call: unknown[]): string => [String(call[0]), ...(((call[2] as { details?: string[] } | undefined)?.details) ?? [])].join(' ');

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

  describe('an is-in over a list attribute (#2330)', () => {
    const attr = (id: string, datatype: string) => ({ attributeid: id, datatype });
    test.each([
      ['a string', { 'string-is-in': [attr('subject:department-id', 'string'), attr('resource:tags', 'string')] }],
      ['an identity', { 'string-is-in': [attr('subject:id', 'string'), attr('resource:tags', 'string')] }],
      ['an integer', { 'integer-is-in': [attr('resource:level', 'integer'), attr('resource:tags', 'integer')] }]
    ])('a list attribute bag with %s on the left is valid', (_name, condition) => {
      expect(problems(condition)).toEqual([]);
    });

    test('an allow with a list attribute bag applies when the list holds the value', async () => {
      const condition = { 'string-is-in': [attr('subject:department-id', 'string'), attr('resource:tags', 'string')] } as PolicyCondition;
      const ev = evaluatorWith([policy('p', 'allow', condition)]);
      await ev.initialize();
      const read = (tags: string[]) => (name: string) => (name === 'resource:tags' ? tags : 'sales');
      expect(await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: read(['a', 'sales']) })).toMatchObject({ allowed: true, hasDecision: true, policyIds: ['p'] });
      expect(await ev.evaluateAccess({ pageName: 'P', action: 'page-edit', userContext: editor, readAttribute: read(['a']) })).toMatchObject({ allowed: false });
    });
  });

  describe('a literal that looks like an attribute name is a literal (#2330)', () => {
    test('"subject:id" as a string value is valid and compared as text', async () => {
      const condition = { 'string-equal': [{ attributeid: 'resource:cat', datatype: 'string' }, { value: 'subject:id', datatype: 'string' }] };
      expect(conditionProblems(condition, { cat: { type: 'string' } })).toEqual([]);
      expect(await conditionHolds(condition as PolicyCondition, (n) => (n === 'resource:cat' ? 'subject:id' : 'erin'))).toBe(true);
      expect(await conditionHolds(condition as PolicyCondition, (n) => (n === 'resource:cat' ? 'erin' : 'erin'))).toBe(false);
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

describe('a leftover conditions array (#2334)', () => {
  const startupLines = async (policies: unknown[]) => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    await evaluatorWith(policies as ReturnType<typeof policy>[]).initialize();
    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('conditions array'));
    warn.mockRestore();
    return lines;
  };

  test('is reported once at start-up as not enforced, naming each policy and the condition to write', async () => {
    const lines = await startupLines([
      policy('old-one', 'allow', undefined, { conditions: [{ type: 'user-attribute', key: 'department', value: 'IT', operator: '==' }] }),
      policy('old-two', 'deny', undefined, { conditions: [{ type: 'time-range', startTime: '09:00', endTime: '17:00' }] }),
      policy('clean', 'allow')
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("'old-one', 'old-two' have a conditions array, which is not enforced");
    expect(lines[0]).toContain('"string-equal"');
    expect(lines[0]).toContain('time-range, ip-range');
    expect(lines[0]).toContain('have no equivalent');
    expect(lines[0]).toContain('"from": "profile:department"');
    expect(lines[0]).not.toContain('clean');
  });

  test('a mix with a leftover priority and an old-shape condition: each line once, none garbled', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    await evaluatorWith([
      policy('old-one', 'allow', undefined, { priority: 5, conditions: [{ type: 'time-range', startTime: '09:00', endTime: '17:00' }] }),
      policy('old-two', 'deny', undefined, { condition: { operator: 'equals', key: 'x', value: 'y' } }),
      policy('clean', 'allow')
    ]).initialize();
    const all = warn.mock.calls.map((c) => String(c[0]));
    warn.mockRestore();
    expect(all.filter((l) => l.includes('conditions array'))).toHaveLength(1);
    expect(all.filter((l) => l.includes('a priority, which is ignored'))).toHaveLength(1);
    expect(all.find((l) => l.includes('conditions array'))).toContain("'old-one' has a conditions array");
    expect(all.find((l) => l.includes('a priority'))).toContain("'old-one' has a priority");
  });

  test('a policy with no id is named by its position in the list, not in the filtered list', async () => {
    const lines = await startupLines([{ id: 'a' }, { id: 'b', conditions: [] }, { effect: 'allow', actions: [], subjects: [], resources: [] }, { effect: 'allow', actions: [], subjects: [], resources: [], conditions: [1] }, { id: 'c', conditions: [{ type: 'bogus' }] }]);
    expect(lines[0]).toContain("'#4', 'c' have a conditions array");
  });

  test('an empty conditions array is not reported', async () => {
    expect(await startupLines([policy('old-one', 'allow', undefined, { conditions: [] })])).toEqual([]);
  });

  test('the notice an admin sees has no issue number or JSON', () => {
    const one = unenforcedConditionsNotice([policy('a', 'allow', undefined, { conditions: [{ type: 'x' }] })]);
    expect(one).toBe("This rule has an old 'conditions' list that the site ignores, so it doesn't limit anyone: 'a'. Move it into the rule's condition, or remove it.");
    const two = unenforcedConditionsNotice([{ id: 'a', conditions: [1] }, { id: 'b', conditions: [1] }]);
    expect(two).toContain("These rules have an old 'conditions' list that the site ignores, so it doesn't limit anyone: 'a', 'b'. Move each one");
    expect(two).not.toMatch(/#\d{4}|[{}]/);
  });

  test('is not reported when no policy has one', async () => {
    expect(await startupLines([policy('clean', 'allow')])).toEqual([]);
  });

  test('changes nothing: the policy is still loaded and the site starts', async () => {
    const ev = evaluatorWith([policy('old-one', 'allow', undefined, { conditions: [{ type: 'time-range' }] })]);
    await expect(ev.initialize()).resolves.not.toThrow();
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

function evaluatorWith(policies: Policy[], algorithm: unknown = 'deny-overrides', extra: Record<string, unknown> = {}, managerProps: Record<string, unknown> = {}): PolicyEvaluator {
  const config: Record<string, unknown> = {
    'ngdpbase.access.resource-types': { page: { attributes: PAGE_ATTRIBUTES }, 'system-category': {} },
    'ngdpbase.access.subject-attributes': SUBJECT_ATTRIBUTES,
    [RULE_COMBINING_ALGORITHM_KEY]: algorithm,
    ...extra
  };
  const engine = {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') return { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d), getUnresolvedProperty: (k: string, d: unknown) => (k in config ? config[k] : d), ...managerProps };
      if (name === 'PolicyDecisionPoint') return { policies: () => policies, categoriesGranting: () => [] };
      return null;
    }
  } as never;
  return new PolicyEvaluator(engine);
}

describe('the needs-attention item for the access policies (#2343)', () => {
  const withAll = () => {
    const onCategory = { resources: [{ type: 'system-category', pattern: 'general' }] };
    const ev = evaluatorWith(
      [policy('old-priority', 'allow', undefined, { priority: 5, ...onCategory }), policy('old-list', 'allow', undefined, { conditions: [{ type: 'time-range' }], ...onCategory })],
      'deny-overrides',
      { 'ngdpbase.system-category': { locked: { label: 'Locked', storageLocation: { path: 'x' } } } }
    );
    const attention = vi.fn();
    (ev as unknown as { markNeedsAttention: typeof attention }).markNeedsAttention = attention;
    return { ev, attention };
  };

  test('says each thing in plain words: no issue number, doc path, or start-up log', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const { ev, attention } = withAll();
    await ev.initialize();
    warn.mockRestore();
    const text = itemText(attention.mock.calls[0]);
    expect(text).toContain('Access policies need review (3 problems): ');
    expect(text).toContain("'old-priority'");
    expect(text).toContain('locked');
    expect(text).toContain("'old-list'");
    expect(text).not.toMatch(/#\d/);
    expect(text).not.toContain('docs/');
    expect(text).not.toContain('start-up log');
    expect(text).not.toMatch(/system-category|pushed-pages-edit|deny-overrides/);
  });

  test('the start-up log keeps the full detail of each line', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const { ev } = withAll();
    await ev.initialize();
    const all = warn.mock.calls.map((c) => String(c[0]));
    warn.mockRestore();
    expect(all.find((l) => l.includes('a priority'))).toContain('(#2330)');
    expect(all.find((l) => l.includes('system-category locked'))).toContain('(#2255)');
    expect(all.find((l) => l.includes('conditions array'))).toContain('docs/access-policies.md#subject-attributes');
  });

  const itemFor = async (policies: ReturnType<typeof policy>[], categories: Record<string, unknown> = {}) => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const ev = evaluatorWith(policies, 'deny-overrides', { 'ngdpbase.system-category': categories });
    const attention = vi.fn();
    (ev as unknown as { markNeedsAttention: typeof attention }).markNeedsAttention = attention;
    await ev.initialize();
    warn.mockRestore();
    return attention.mock.calls.length ? itemText(attention.mock.calls[0]) : null;
  };
  const onCategory = { resources: [{ type: 'system-category', pattern: 'general' }] };
  const stored = (label: string) => ({ label, storageLocation: { path: 'x' } });

  test('a leftover priority alone: one problem, singular', async () => {
    const text = await itemFor([policy('p1', 'allow', undefined, { priority: 5, ...onCategory })]);
    expect(text).toBe("Access policies need review (1 problem): This rule has an old 'priority' that the site ignores, so it changes nothing: 'p1'. Remove it.");
  });

  test('leftover priorities on two rules: plural, remove it from each one', async () => {
    const text = await itemFor([policy('p1', 'allow', undefined, { priority: 5, ...onCategory }), policy('p2', 'allow', undefined, { priority: 6, ...onCategory })]);
    expect(text).toBe("Access policies need review (1 problem): These rules have an old 'priority' that the site ignores, so it changes nothing: 'p1', 'p2'. Remove it from each one.");
  });

  test('an old conditions list alone', async () => {
    const text = await itemFor([policy('old-list', 'allow', undefined, { conditions: [{ type: 'time-range' }], ...onCategory })]);
    expect(text).toMatch(/^Access policies need review \(1 problem\): .*'old-list'.*\.$/);
    expect(text).not.toContain('; ');
  });

  test('an uneditable category alone: singular', async () => {
    const text = await itemFor([], { locked: stored('Locked') });
    expect(text).toBe('Access policies need review (1 problem): Nobody can edit the pages in this category, not even an admin: locked. Add a rule that lets a role edit it.');
  });

  test('two uneditable categories: plural', async () => {
    const text = await itemFor([], { locked: stored('Locked'), shut: stored('Shut') });
    expect(text).toBe('Access policies need review (1 problem): Nobody can edit the pages in these categories, not even an admin: locked, shut. Add a rule that lets a role edit them.');
  });

  test('the parts are joined as separate sentences, not with a semicolon', async () => {
    const { ev, attention } = withAll();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    await ev.initialize();
    warn.mockRestore();
    expect(itemText(attention.mock.calls[0])).toContain("Remove it. This rule has an old 'conditions' list");
  });

  test('the problems are passed as a list, one per line, under a headline that counts them', async () => {
    const { ev, attention } = withAll();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    await ev.initialize();
    warn.mockRestore();
    const [headline, key, opts] = attention.mock.calls[0] as [string, string, { details: string[] }];
    expect(headline).toBe('Access policies need review (3 problems):');
    expect(key).toBe('ngdpbase.access.policies');
    expect(opts.details).toHaveLength(3);
    for (const line of opts.details) expect(line).toMatch(/\.$/);
  });

  test('no problems: no item', async () => {
    expect(await itemFor([])).toBeNull();
  });
});

describe('every line of the access-policies needs-attention item is plain (#2348)', () => {
  const onGeneral = { resources: [{ type: 'system-category', pattern: 'general' }] };
  const run = async (policies: Policy[], extra: Record<string, unknown> = {}, managerProps: Record<string, unknown> = {}) => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const ev = evaluatorWith(policies, 'deny-overrides', extra, managerProps);
    const attention = vi.fn();
    (ev as unknown as { markNeedsAttention: typeof attention }).markNeedsAttention = attention;
    await ev.initialize();
    const log = warn.mock.calls.map((c) => String(c[0])).join('\n');
    warn.mockRestore();
    return { item: attention.mock.calls.length ? itemText(attention.mock.calls[0]) : '', log };
  };
  /** What an administrator must never meet: ids, setting names, issue numbers, paths, "see the log", JSON. */
  const expectPlain = (item: string): void => {
    expect(item).not.toMatch(/#\d/);
    expect(item).not.toContain('docs/');
    expect(item).not.toContain('ngdpbase.');
    expect(item).not.toContain('start-up log');
    expect(item).not.toMatch(/page-(edit|delete|rename|create|categorize|raw-edit|public)|pushed-pages-edit|admin-config|system-category|resource type|\{|\}/);
  };
  const sample = (id: string, effect: string, extra: Record<string, unknown>) => policy(id, effect, undefined, { ...onGeneral, ...extra });

  test('a deny: says what to check, names the rule', async () => {
    const { item, log } = await run([sample('no-docs', 'deny', { actions: ['page-read'] })]);
    expect(item).toBe("Access policies need review (1 problem): The rule 'no-docs' denies access, and a deny beats every rule that allows it. Check that it denies only what you mean it to; if not, change or remove it.");
    expectPlain(item);
    expect(log).toContain("'no-docs' is a deny: since #2255 a deny overrides any allow");
  });

  test('a grant to everyone: no permission ids', async () => {
    const { item, log } = await run([sample('open-edit', 'allow', { subjects: [{ type: 'anyone' }], actions: ['page-read', 'page-edit'] })]);
    expect(item).toBe("Access policies need review (1 problem): The rule 'open-edit' lets anyone (including signed-out visitors) do more than read. Give those abilities to named roles instead.");
    expectPlain(item);
    expect(log).toContain("'open-edit' grants page-edit to anyone, including signed-out visitors, so");
    expect(log).toContain('(#2261)');
  });

  test('a page write by name: names the roles, not the permission or the resource type', async () => {
    const { item, log } = await run([policy('my-own', 'allow', undefined, { actions: ['page-edit', 'page-delete'] })]);
    expect(item).toBe("Access policies need review (1 problem): The rule 'my-own' lets the role editor change pages by name, which reaches system, documentation and add-on pages. Change it to apply to page categories instead.");
    expectPlain(item);
    expect(log).toContain("'my-own' grants page-edit, page-delete on pages by name to editor");
    expect(log).toContain('grant it on system categories instead (#2255)');
  });

  test('the upgrade of a stored policy: said without permission ids, saying to save', async () => {
    const line = "'editor-permissions' in custom config granted page-edit, page-delete on every page; that now comes from the category policies (#2255)";
    const { item, log } = await run([], {}, { pageWritePolicyMigration: [line], pageWritePolicyMigrationShown: { [line]: "The saved rule 'editor-permissions' let its roles change every page, which the site now handles with its page category rules, so it was changed for this run only. Save the policy list in Admin → Configuration to keep the change." } });
    expect(item).toContain("The saved rule 'editor-permissions' let its roles change every page");
    expect(item).toContain('Save the policy list in Admin → Configuration');
    expectPlain(item);
    expect(log).toContain(line);
  });

  test('a condition that cannot work: names the rule once, however many things are wrong', async () => {
    const { item, log } = await run([policy('bad-cond', 'allow', { 'no-such-function': [1] }), policy('bad-deny', 'deny', { 'no-such-function': [1] })]);
    expect(item).toContain("The rule 'bad-cond' has a condition that cannot work, so it never gives anyone access. Open the rule in Admin → Configuration and fix its condition, or remove it.");
    expect(item).toContain("The rule 'bad-deny' has a condition that cannot work, so it always denies.");
    expectPlain(item);
    expect(log).toMatch(/'bad-cond': .*the policy never applies as an allow/);
    expect(log).toMatch(/'bad-deny': .*the deny always applies/);
  });

  describe('the user-detail list', () => {
    test('not an object', async () => {
      const { item, log } = await run([], { 'ngdpbase.access.subject-attributes': ['x'] });
      expect(item).toContain('The list of user details that rules can check is not in a form the site can read');
      expectPlain(item);
      expect(log).toContain('ngdpbase.access.subject-attributes must be an object');
    });
    test('a built-in one redefined', async () => {
      const { item, log } = await run([], { 'ngdpbase.access.subject-attributes': { aal: { type: 'string', from: 'profile:x' } } });
      expect(item).toContain("The user detail 'aal' is built into the site and cannot be redefined");
      expectPlain(item);
      expect(log).toContain("subject attribute 'aal' in ngdpbase.access.subject-attributes cannot be redefined");
    });
    test('a wrong declaration', async () => {
      const { item, log } = await run([], { 'ngdpbase.access.subject-attributes': { dept: { type: 'nope', from: 'profile:department' } } });
      expect(item).toContain("The user detail 'dept' is not set up correctly");
      expectPlain(item);
      expect(log).toContain("subject attribute 'dept' in ngdpbase.access.subject-attributes has type");
    });
    test('private account data', async () => {
      const { item, log } = await run([], { 'ngdpbase.access.subject-attributes': { secret: { type: 'string', from: 'account:password' } } });
      expect(item).toContain("The user detail 'secret' reads private account data");
      expectPlain(item);
      expect(log).toContain("'account:password' cannot be used in a condition");
    });
  });

  describe('the check list and schedules', () => {
    const declared = { 'ngdpbase.access.environment-attributes': { 'open-hours': { type: 'boolean', from: 'schedule:office' } } };
    test('not an object', async () => {
      const { item, log } = await run([], { 'ngdpbase.access.environment-attributes': 'x' });
      expect(item).toContain('The list of checks that depend on a schedule or a setting is not in a form the site can read');
      expectPlain(item);
      expect(log).toContain('ngdpbase.access.environment-attributes must be an object');
    });
    test('a wrong declaration', async () => {
      const { item, log } = await run([], { 'ngdpbase.access.environment-attributes': { 'open-hours': { type: 'string', from: 'schedule:office' } } });
      expect(item).toContain("The check 'open-hours' (for rules that depend on a schedule or a setting) is not set up correctly");
      expectPlain(item);
      expect(log).toContain("environment attribute 'open-hours' in ngdpbase.access.environment-attributes has type");
    });
    test('a schedule that does not exist', async () => {
      const { item, log } = await run([], { ...declared, 'ngdpbase.schedules': {} });
      expect(item).toContain("The check 'open-hours' uses a schedule called 'office' that does not exist, so a rule that depends on it never holds: an allow rule stops applying and a deny rule keeps applying. Add that schedule in Admin → Configuration, or point the check at one that exists.");
      expectPlain(item);
      expect(log).toContain("reads schedule 'office', which is not in ngdpbase.schedules");
    });
    test('a schedule with a mistake', async () => {
      const { item, log } = await run([], { ...declared, 'ngdpbase.schedules': { office: { bogus: 1 } } });
      expect(item).toContain("The schedule 'office', used by the check 'open-hours', has a mistake the site cannot read");
      expectPlain(item);
      expect(log).toContain('bogus is not a schedule setting');
    });
    test('a schedule switched off', async () => {
      const { item, log } = await run([], { ...declared, 'ngdpbase.schedules': { office: { enabled: false, rules: [] } } });
      expect(item).toContain("The schedule 'office', used by the check 'open-hours', is switched off");
      expectPlain(item);
      expect(log).toContain('(enabled: false)');
    });
    test('a schedule with no rules', async () => {
      const { item, log } = await run([], { ...declared, 'ngdpbase.schedules': { office: { rules: [] } } });
      expect(item).toContain("The schedule 'office', used by the check 'open-hours', has no times in it, so it counts as always open.");
      expectPlain(item);
      expect(log).toContain("schedule 'office', which has no rules");
    });
    test('schedules that cannot be read', async () => {
      const { item, log } = await run([], declared, { getProperty: (k: string, d: unknown) => { if (k === 'ngdpbase.schedules') throw new Error('boom'); return d; } });
      expect(item).toContain('The schedules could not be read');
      expectPlain(item);
      expect(log).toContain('ngdpbase.schedules could not be read');
    });
  });
});
