/**
 * Environment attributes (#2261, slice 4).
 *
 * Run against the SHIPPED configuration with a real PolicyEvaluator,
 * PolicyDecisionPoint and PolicyInformationPoint and an injected clock.
 * Sabotage check: read the clock per attribute instead of once, drop the
 * `readFacts` hand-over in `PolicyDecisionPoint.onSomeCategory`, or log the
 * value in `environmentAttribute`, and the clock, capability and no-leak rows go red.
 */
import fs from 'fs';
import path from 'path';
import PolicyInformationPoint from '../PolicyInformationPoint';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import PolicyValidator from '../../managers/PolicyValidator';
import logger from '../../utils/logger';

const core = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

// 2026-03-08 is the day New York moves to daylight time, so 2026-03-09 is EDT (UTC-4) and 2026-03-02 is EST (UTC-5).
const TUESDAY_10 = new Date('2026-03-10T14:00:00Z'); // 10:00 EDT
const SATURDAY_10 = new Date('2026-03-14T14:00:00Z'); // 10:00 EDT
const MONDAY_AFTER_DST_0930 = new Date('2026-03-09T13:30:00Z'); // 09:30 EDT (08:30 if EST were wrongly used)
const MONDAY_AFTER_DST_1730 = new Date('2026-03-09T21:30:00Z'); // 17:30 EDT (16:30 if EST were wrongly used)
const MONDAY_BEFORE_DST_0930 = new Date('2026-03-02T14:30:00Z'); // 09:30 EST

const OUTSIDE = { attribute: 'environment:is-business-hours', equals: false };
const INSIDE = { attribute: 'environment:is-business-hours', equals: true };
const policy = (id: string, effect: 'allow' | 'deny', actions: string[], condition?: unknown, subjects: unknown[] = [{ type: 'anyone' }]) =>
  ({ id, name: id, effect, subjects, resources: [{ type: 'system-category', pattern: 'general' }], actions, ...(condition ? { condition } : {}) });
const editor = { username: 'quinn', roles: ['qa'], isAuthenticated: true };
const meta = { title: 'P', uuid: 'u1', lastModified: '', 'system-category': 'general', author: 'system' };

const resolveRefs = (value: unknown): unknown => {
  if (typeof value === 'string' && /^\$[A-Z_][A-Z0-9_]*$/.test(value)) {
    const found = process.env[value.slice(1)];
    if (found === undefined) throw new Error(`environment variable ${value.slice(1)} is not set`);
    return found;
  }
  if (Array.isArray(value)) return value.map(resolveRefs);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRefs(v)]));
  return value;
};

describe('environment attributes (#2261 slice 4, shipped configuration)', () => {
  let pip: PolicyInformationPoint;
  let pdp: PolicyDecisionPoint;
  let evaluator: PolicyEvaluator;
  let validator: PolicyValidator;
  let config: Record<string, unknown>;
  let audit: Array<Record<string, unknown>>;
  let now: Date;
  let clockReads: number;

  const boot = async (policies: unknown[]) => {
    config = { ...core, 'ngdpbase.access.policies': policies, 'ngdpbase.permissions.definitions': { 'page-edit': {}, 'page-read': {} } };
    const managers: Record<string, unknown> = {
      // Like the real one: getProperty resolves a `$NAME` string inside a map (and throws when it is unset), getUnresolvedProperty does not.
      ConfigurationManager: {
        getProperty: (key: string, def: unknown) => (key in config ? resolveRefs(config[key]) : def),
        getUnresolvedProperty: (key: string, def: unknown) => (key in config ? config[key] : def)
      },
      ValidationManager: { getDefaultSystemCategory: () => 'general' },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve(); } },
      PageManager: { checkPrivatePageAccess: () => Promise.resolve(null) }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    evaluator = new PolicyEvaluator(engine);
    pdp = new PolicyDecisionPoint(engine);
    validator = new PolicyValidator(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = pdp;
    await evaluator.initialize();
    pip = new PolicyInformationPoint(engine, () => { clockReads++; return now; });
    await pip.initialize();
    managers.PolicyInformationPoint = pip;
    await validator.initialize();
  };
  const decide = (action = 'page-edit', subject: unknown = editor) =>
    pdp.decide(subject, { action, resource: { type: 'page', id: 'P' }, pageMetadata: meta });

  beforeEach(() => { audit = []; clockReads = 0; now = TUESDAY_10; });

  describe('is-business-hours, from the schedule business-hours', () => {
    beforeEach(() => boot([]));

    test('Tuesday 10:00 in America/New_York is open, Saturday 10:00 is closed', () => {
      expect(pip.environmentAttribute('environment:is-business-hours', TUESDAY_10)).toBe(true);
      expect(pip.environmentAttribute('environment:is-business-hours', SATURDAY_10)).toBe(false);
    });

    test('the zone is the schedule\'s, across the daylight-saving change', () => {
      expect(pip.environmentAttribute('environment:is-business-hours', MONDAY_AFTER_DST_0930)).toBe(true);
      expect(pip.environmentAttribute('environment:is-business-hours', MONDAY_AFTER_DST_1730)).toBe(false);
      expect(pip.environmentAttribute('environment:is-business-hours', MONDAY_BEFORE_DST_0930)).toBe(true);
    });

    test('it follows a change to ngdpbase.schedules at once, with no restart', () => {
      expect(pip.environmentAttribute('environment:is-business-hours', TUESDAY_10)).toBe(true);
      config['ngdpbase.schedules'] = { 'business-hours': { timeZone: 'America/New_York', rules: [{ days: ['saturday'], startTime: '09:00', endTime: '17:00', type: 'allow' }] } };
      expect(pip.environmentAttribute('environment:is-business-hours', TUESDAY_10)).toBe(false);
      expect(pip.environmentAttribute('environment:is-business-hours', SATURDAY_10)).toBe(true);
    });

    test('an attribute that is not declared, or not an environment name, is missing', () => {
      expect(pip.environmentAttribute('environment:nope', TUESDAY_10)).toBeUndefined();
      expect(pip.environmentAttribute('subject:id', TUESDAY_10)).toBeUndefined();
    });
  });

  describe('a policy: deny outside business hours', () => {
    beforeEach(() => boot([policy('qa-edit', 'allow', ['page-edit', 'page-read'], undefined, [{ type: 'role', value: 'qa' }]), policy('no-edit-outside-hours', 'deny', ['page-edit'], OUTSIDE)]));

    test('refused on Saturday with that policy id, allowed on Tuesday, changing the time needs no restart', async () => {
      now = SATURDAY_10;
      expect(await decide()).toMatchObject({ permit: false, policyIds: ['no-edit-outside-hours'] });
      now = TUESDAY_10;
      expect(await decide()).toMatchObject({ permit: true, policyIds: ['qa-edit'] });
    });

    test('reading is unaffected, and the page list agrees with the door both ways', async () => {
      const candidates = [{ title: 'P', metadata: meta }];
      now = SATURDAY_10;
      expect((await decide('page-read')).permit).toBe(true);
      expect(await pip.filterAccessiblePages(editor as never, 'edit', candidates)).toEqual([]);
      now = TUESDAY_10;
      expect(await pip.filterAccessiblePages(editor as never, 'edit', candidates)).toEqual(['P']);
    });

    test('the refusal\'s audit record carries the policy id', async () => {
      now = SATURDAY_10;
      const refused = await decide();
      await pip.recordPageRefusal(editor, 'P', 'edit', refused.reason, refused.policyIds);
      const denials = audit.filter((e) => e.eventType === 'authorization-deny');
      expect(denials).toHaveLength(1);
      expect(denials[0]).toMatchObject({ metadata: { policyIds: ['no-edit-outside-hours'] } });
    });

    test('a page write asked with no page (a capability) reads the same moment: the deny holds on every category', async () => {
      now = SATURDAY_10;
      expect((await pdp.decide(editor, { action: 'page-edit' })).permit).toBe(false);
      now = TUESDAY_10;
      expect((await pdp.decide(editor, { action: 'page-edit' })).permit).toBe(true);
    });

    test('the clock is read once for a listing of many pages, however many policies and pages ask', async () => {
      const candidates = ['A', 'B', 'C', 'D'].map((title) => ({ title, metadata: { ...meta, title } }));
      await boot([policy('qa-edit', 'allow', ['page-edit'], INSIDE, [{ type: 'role', value: 'qa' }]), policy('no-edit-outside-hours', 'deny', ['page-edit'], OUTSIDE)]);
      clockReads = 0;
      expect(await pip.filterAccessiblePages(editor as never, 'edit', candidates)).toEqual(['A', 'B', 'C', 'D']);
      expect(clockReads).toBe(1);
      clockReads = 0;
      await decide();
      expect(clockReads).toBe(1);
    });
  });

  describe('a schedule name that is misspelled', () => {
    const declare = () => { config['ngdpbase.access.environment-attributes'] = { 'is-business-hours': { type: 'boolean', from: 'schedule:business-hour' } }; };

    test('is missing, so an allow with the condition does not apply and a deny does', async () => {
      await boot([policy('qa-edit', 'allow', ['page-edit'], INSIDE, [{ type: 'role', value: 'qa' }])]);
      declare();
      expect(pip.environmentAttribute('environment:is-business-hours', TUESDAY_10)).toBeUndefined();
      expect((await decide()).permit).toBe(false);
      await boot([policy('qa-edit', 'allow', ['page-edit'], undefined, [{ type: 'role', value: 'qa' }]), policy('no-edit-outside-hours', 'deny', ['page-edit'], OUTSIDE)]);
      declare();
      expect(await decide()).toMatchObject({ permit: false, policyIds: ['no-edit-outside-hours'] });
    });

    test('the boot log names the missing schedule', async () => {
      const warn = vi.spyOn(logger, 'warn');
      try {
        await boot([]);
        config['ngdpbase.access.environment-attributes'] = { 'is-business-hours': { type: 'boolean', from: 'schedule:business-hour' } };
        // The report is part of initialize(): run it again now that the misspelling is declared.
        await evaluator.initialize();
        const said = warn.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(said).toContain("schedule 'business-hour', which is not in ngdpbase.schedules");
      } finally {
        warn.mockRestore();
      }
    });

    test('a schedule with no rules is said to read as always open', async () => {
      await boot([]);
      config['ngdpbase.schedules'] = { 'business-hours': { rules: [] } };
      const warn = vi.spyOn(logger, 'warn');
      try {
        await evaluator.initialize();
        expect(warn.mock.calls.map((c) => c.join(' ')).join('\n')).toContain("schedule 'business-hours', which has no rules");
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('the config: source reads a boolean', () => {
    const declare = (key: string) => { config['ngdpbase.access.environment-attributes'] = { flag: { type: 'boolean', from: `config:${key}` } }; };
    beforeEach(() => boot([]));

    test('true and false are read; a value that is not a boolean, or no value, is missing', () => {
      declare('x.flag');
      config['x.flag'] = true;
      expect(pip.environmentAttribute('environment:flag')).toBe(true);
      config['x.flag'] = false;
      expect(pip.environmentAttribute('environment:flag')).toBe(false);
      for (const bad of ['true', 'yes', 1, 0, null, {}, []]) {
        config['x.flag'] = bad;
        expect(pip.environmentAttribute('environment:flag')).toBeUndefined();
      }
      delete config['x.flag'];
      expect(pip.environmentAttribute('environment:flag')).toBeUndefined();
    });

    test('a deny on it applies when the key is absent, an allow on it does not', async () => {
      declare('x.flag');
      await boot([policy('qa-edit', 'allow', ['page-edit'], { attribute: 'environment:flag', equals: true }, [{ type: 'role', value: 'qa' }])]);
      declare('x.flag');
      expect((await decide()).permit).toBe(false);
      config['x.flag'] = true;
      expect((await decide()).permit).toBe(true);
    });

    test('the shipped vaults-admin-access reads ngdpbase.vaults.admin-access', () => {
      config['ngdpbase.vaults.admin-access'] = true;
      expect(pip.environmentAttribute('environment:vaults-admin-access')).toBe(true);
      config['ngdpbase.vaults.admin-access'] = false;
      expect(pip.environmentAttribute('environment:vaults-admin-access')).toBe(false);
    });
  });

  describe('declarations are checked', () => {
    beforeEach(() => boot([]));

    test('a condition on an undeclared environment attribute says where to declare it', () => {
      const problems = validator.policyProblems([policy('p', 'deny', ['page-edit'], { attribute: 'environment:nope', equals: true })]);
      expect(problems).toEqual(["'p': condition reads 'environment:nope', which is not declared; add it to ngdpbase.access.environment-attributes"]);
    });

    test('a condition on the shipped attribute passes policyProblems, and a type mismatch does not', () => {
      expect(validator.policyProblems([policy('p', 'deny', ['page-edit'], OUTSIDE)])).toEqual([]);
      expect(validator.policyProblems([policy('p', 'deny', ['page-edit'], { attribute: 'environment:is-business-hours', equals: 'no' })])[0]).toMatch(/both sides must have the same type/);
    });

    test('a non-boolean type, an unknown source and a missing name are refused', () => {
      expect(validator.environmentAttributeProblems({ a: { type: 'string', from: 'config:x' } })[0]).toMatch(/boolean only/);
      expect(validator.environmentAttributeProblems({ a: { type: 'boolean', from: 'frontmatter:x' } })[0]).toMatch(/start it with schedule: or config:/);
      expect(validator.environmentAttributeProblems({ a: { type: 'boolean', from: 'config:' } })[0]).toMatch(/no key/);
      expect(validator.environmentAttributeProblems({ a: { type: 'boolean', from: 'schedule:' } })[0]).toMatch(/no schedule name/);
      expect(validator.environmentAttributeProblems([])[0]).toMatch(/must be an object/);
    });

    test('the shipped declarations have no problems', () => {
      expect(validator.environmentAttributeProblems(core['ngdpbase.access.environment-attributes'])).toEqual([]);
    });
  });

  describe('a config: value is never written anywhere', () => {
    // Generated at run time, never a literal (AGENTS.md).
    const SECRET = `s3cr3t-${Math.random().toString(36).slice(2)}-${Date.now()}`;

    test('declaring a secret key is accepted, and no log line, audit record or validator message holds its value', async () => {
      const spies = (['error', 'warn', 'info', 'debug'] as const).map((level) => vi.spyOn(logger, level as 'info'));
      try {
        await boot([
          policy('qa-edit', 'allow', ['page-edit'], undefined, [{ type: 'role', value: 'qa' }]),
          policy('deny-secret', 'deny', ['page-edit'], { attribute: 'environment:probe', equals: true }),
          policy('deny-secret-not', 'deny', ['page-read'], { attribute: 'environment:probe', 'not-equals': true })
        ]);
        const declaration = { probe: { type: 'boolean', from: 'config:ngdpbase.session.secret' } };
        config['ngdpbase.access.environment-attributes'] = declaration;
        config['ngdpbase.session.secret'] = SECRET;
        const messages = [
          ...validator.environmentAttributeProblems(declaration),
          ...validator.policyProblems(config['ngdpbase.access.policies'])
        ];
        expect(messages).toEqual([]);

        // Read as a string: missing, so the deny applies, and the refusal is audited.
        const refused = await decide();
        expect(refused.permit).toBe(false);
        await pip.recordPageRefusal(editor, 'P', 'edit', refused.reason, refused.policyIds);
        await pip.filterAccessiblePages(editor, 'edit', [{ title: 'P', metadata: meta }]);
        await evaluator.initialize();
        // A boolean secret reads as itself: the outcome is the only channel, not the text.
        config['ngdpbase.session.secret'] = true;
        expect((await decide()).permit).toBe(false);

        const logged = spies.flatMap((s) => s.mock.calls.map((c) => JSON.stringify(c))).join('\n');
        expect(logged).not.toContain(SECRET);
        expect(JSON.stringify(audit)).not.toContain(SECRET);
        expect(JSON.stringify([messages, validator.policyProblems([policy('p', 'deny', ['page-edit'], { attribute: 'environment:probe', equals: 'x' })])])).not.toContain(SECRET);
        // Both the missing read and a mismatched condition keep the value out of the evaluator's own messages.
        expect(JSON.stringify(evaluator.conditionProblemsInForce())).not.toContain(SECRET);
      } finally {
        spies.forEach((s) => s.mockRestore());
      }
    });
  });

  describe('review fixes (#2300): declarations as written, malformed schedules fail closed', () => {
    const SECRET = `env-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const allLogged = (spies: Array<{ mock: { calls: unknown[][] } }>) => spies.flatMap((s) => s.mock.calls.map((c) => JSON.stringify(c))).join('\n');
    const logSpies = () => (['error', 'warn', 'info', 'debug'] as const).map((level) => vi.spyOn(logger, level as 'info'));
    const declareSchedule = (schedule: unknown) => {
      config['ngdpbase.schedules'] = { 'business-hours': schedule };
      config['ngdpbase.access.environment-attributes'] = { 'is-business-hours': { type: 'boolean', from: 'schedule:business-hours' } };
    };
    const rule = (extra: Record<string, unknown>) => ({ timeZone: 'America/New_York', rules: [{ days: ['monday', 'tuesday'], startTime: '09:00', endTime: '17:00', type: 'allow', ...extra }] });

    test('a $VAR in type or from is judged and shown as written, and its value is in no message, log line or audit record', async () => {
      const spies = logSpies();
      process.env.PROBE_ENV_SECRET = SECRET;
      try {
        await boot([policy('qa-edit', 'allow', ['page-edit'], undefined, [{ type: 'role', value: 'qa' }]), policy('p', 'deny', ['page-edit'], { attribute: 'environment:a', equals: true })]);
        config['ngdpbase.access.environment-attributes'] = { a: { type: '$PROBE_ENV_SECRET', from: '$PROBE_ENV_SECRET' }, b: { type: 'boolean', from: '$PROBE_ENV_SECRET' } };
        const messages = [...validator.environmentAttributeProblems(config['ngdpbase.access.environment-attributes']), ...validator.policyProblems(config['ngdpbase.access.policies'])];
        expect(messages.join('\n')).toContain('$PROBE_ENV_SECRET');
        const refused = await decide();
        await pip.recordPageRefusal(editor, 'P', 'edit', refused.reason, refused.policyIds);
        await evaluator.initialize();
        expect(pip.environmentAttribute('environment:b', TUESDAY_10)).toBeUndefined();
        expect(JSON.stringify(evaluator.conditionProblemsInForce())).not.toContain(SECRET);
        expect(JSON.stringify(messages)).not.toContain(SECRET);
        expect(allLogged(spies)).not.toContain(SECRET);
        expect(JSON.stringify(audit)).not.toContain(SECRET);
        // The boot log says the declaration as written.
        expect(allLogged(spies)).toContain('$PROBE_ENV_SECRET');
      } finally {
        delete process.env.PROBE_ENV_SECRET;
        spies.forEach((s) => s.mockRestore());
      }
    });

    test('an unset $VAR in a declaration does not throw at boot, in a decision or in the validator: the attribute is missing and reported', async () => {
      const warn = vi.spyOn(logger, 'warn');
      try {
        delete process.env.PROBE_UNSET_VAR;
        await boot([policy('qa-edit', 'allow', ['page-edit'], undefined, [{ type: 'role', value: 'qa' }]), policy('p', 'allow', ['page-edit'], { attribute: 'environment:a', equals: true }, [{ type: 'role', value: 'qa' }])]);
        config['ngdpbase.access.environment-attributes'] = { a: { type: 'boolean', from: '$PROBE_UNSET_VAR' } };
        await expect(evaluator.initialize()).resolves.not.toThrow();
        expect(() => pip.environmentAttribute('environment:a', TUESDAY_10)).not.toThrow();
        expect(pip.environmentAttribute('environment:a', TUESDAY_10)).toBeUndefined();
        await expect(decide()).resolves.toMatchObject({ permit: true, policyIds: ['qa-edit'] });
        expect(() => validator.policyProblems(config['ngdpbase.access.policies'])).not.toThrow();
        expect(validator.environmentAttributeProblems(config['ngdpbase.access.environment-attributes'])[0]).toContain('$PROBE_UNSET_VAR');
        expect(warn.mock.calls.map((c) => c.join(' ')).join('\n')).toContain('$PROBE_UNSET_VAR');
      } finally {
        warn.mockRestore();
      }
    });

    test.each([
      ['a time that is not a time of day', rule({ startTime: '9am' }), 'startTime'],
      ['an end time that is not a time of day', rule({ endTime: '25:00' }), 'endTime'],
      ['only one of the two times', rule({ endTime: undefined }), 'endTime'],
      ['a day that is not a weekday', rule({ days: ['monday', 'funday'] }), 'days'],
      ['days that are not a list', rule({ days: 'monday' }), 'days'],
      ['rules that are not a list', { timeZone: 'America/New_York', rules: 'always' }, 'rules'],
      ['a rule that is not an object', { timeZone: 'America/New_York', rules: ['monday'] }, 'rule 1'],
      ['a time zone that does not exist', rule({}) && { ...rule({}), timeZone: 'Mars/Olympus' }, 'timeZone'],
      ['a time zone that is not text', { ...rule({}), timeZone: 5 }, 'timeZone']
    ])('%s: the attribute is missing (not open), an allow does not apply, and the boot log names the schedule and the field', async (_label, schedule, field) => {
      const warn = vi.spyOn(logger, 'warn');
      try {
        await boot([policy('qa-edit', 'allow', ['page-edit'], INSIDE, [{ type: 'role', value: 'qa' }])]);
        declareSchedule(schedule);
        // Monday 03:00 in New York: a malformed window read as open would let the allow apply.
        const monday3am = new Date('2026-03-09T07:00:00Z');
        expect(pip.environmentAttribute('environment:is-business-hours', monday3am)).toBeUndefined();
        expect(pip.environmentAttribute('environment:is-business-hours', TUESDAY_10)).toBeUndefined();
        now = monday3am;
        expect((await decide()).permit).toBe(false);
        await evaluator.initialize();
        const said = warn.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes("schedule 'business-hours'")).join('\n');
        expect(said).toContain(field);
        expect(said).toContain('cannot be read');
      } finally {
        warn.mockRestore();
      }
    });

    test('a well-formed schedule and a rule with no times (open all day) still read normally', async () => {
      await boot([]);
      declareSchedule(rule({}));
      expect(pip.environmentAttribute('environment:is-business-hours', TUESDAY_10)).toBe(true);
      declareSchedule(rule({ startTime: undefined, endTime: undefined }));
      expect(pip.environmentAttribute('environment:is-business-hours', TUESDAY_10)).toBe(true);
    });

    test('a schedule with enabled: false is missing, as the site gate treats it as off, and the boot log says so', async () => {
      const warn = vi.spyOn(logger, 'warn');
      try {
        await boot([]);
        declareSchedule({ ...rule({}), enabled: false });
        expect(pip.environmentAttribute('environment:is-business-hours', TUESDAY_10)).toBeUndefined();
        await evaluator.initialize();
        expect(warn.mock.calls.map((c) => c.join(' ')).join('\n')).toContain("schedule 'business-hours', which is switched off");
        declareSchedule({ ...rule({}), enabled: true });
        expect(pip.environmentAttribute('environment:is-business-hours', TUESDAY_10)).toBe(true);
      } finally {
        warn.mockRestore();
      }
    });

    test('an unknown site time zone, used when the schedule has none, is missing and warned at boot, not read as UTC', async () => {
      const warn = vi.spyOn(logger, 'warn');
      try {
        await boot([]);
        declareSchedule({ rules: [{ startTime: '00:00', endTime: '23:59', type: 'allow' }] });
        config['ngdpbase.time-zone'] = 'Not/AZone';
        expect(pip.environmentAttribute('environment:is-business-hours', TUESDAY_10)).toBeUndefined();
        await evaluator.initialize();
        expect(warn.mock.calls.map((c) => c.join(' ')).join('\n')).toContain('ngdpbase.time-zone');
      } finally {
        warn.mockRestore();
      }
    });
  });
});
