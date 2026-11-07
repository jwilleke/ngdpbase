/**
 * #2261 slice 3 — saving a policy in Admin → Configuration is checked against the
 * subject attributes the site declares (`policyProblems`, the save check).
 *
 * @jest-environment node
 */
import PolicyValidator from '../PolicyValidator';
import fs from 'fs';
import path from 'path';

const core = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

async function validatorWith(extra: Record<string, unknown> = {}): Promise<PolicyValidator> {
  const config: Record<string, unknown> = { ...core, ...extra };
  const engine = { getManager: (name: string) => (name === 'ConfigurationManager' ? { getProperty: (k: string, d: unknown) => (k in config ? config[k] : d) } : null) };
  const v = new PolicyValidator(engine);
  await v.initialize();
  return v;
}
const withCondition = (condition: unknown) => [{ id: 'p', name: 'p', effect: 'allow', subjects: [{ type: 'role', value: 'editor' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-edit'], condition }];

describe('policyProblems and subject attributes', () => {
  test('subject:aal is declared as shipped', async () => {
    expect((await validatorWith()).policyProblems(withCondition({ attribute: 'subject:aal', 'greater-or-equal': 2 }))).toEqual([]);
  });

  test('an undeclared subject:department-id is refused with where to declare it', async () => {
    const problems = (await validatorWith()).policyProblems(withCondition({ attribute: 'subject:department-id', equals: 'x' }));
    expect(problems.join(' ')).toContain("condition reads 'subject:department-id', which is not declared; add it to ngdpbase.access.subject-attributes");
  });

  test('declared with profile:department, it is accepted; with a bad source or type it is not', async () => {
    const declare = (decl: unknown) => ({ 'ngdpbase.access.subject-attributes': { 'department-id': decl } });
    const cond = withCondition({ attribute: 'subject:department-id', equals: 'x' });
    expect((await validatorWith(declare({ type: 'string', from: 'profile:department' }))).policyProblems(cond)).toEqual([]);
    expect((await validatorWith(declare({ type: 'string', from: 'account:password' }))).policyProblems(cond).join(' ')).toContain("'account:password' cannot be used in a condition");
    expect((await validatorWith(declare({ type: 'string', from: 'somewhere' }))).policyProblems(cond).join(' ')).toContain('start it with account:, profile:, sign-in');
    expect((await validatorWith(declare({ type: 'number', from: 'profile:department' }))).policyProblems(cond).join(' ')).toContain('use one of string, integer, boolean, identity, list');
  });

  test('greater-or-equal on a string attribute is still a type error', async () => {
    const v = await validatorWith({ 'ngdpbase.access.subject-attributes': { 'department-id': { type: 'string', from: 'profile:department' } } });
    expect(v.policyProblems(withCondition({ attribute: 'subject:department-id', 'greater-or-equal': 2 })).join(' ')).toContain("applies 'greater-or-equal' to 'subject:department-id' (string)");
  });
});

describe('subjectAttributeProblems — the key itself (#2287)', () => {
  test('the shipped declaration has no problem', async () => {
    expect((await validatorWith()).subjectAttributeProblems(core['ngdpbase.access.subject-attributes'])).toEqual([]);
  });

  test('redefining aal or id is reported, with where and what to do', async () => {
    const problems = (await validatorWith()).subjectAttributeProblems({ aal: { type: 'integer', from: 'profile:aal' }, id: { type: 'string', from: 'profile:id' } });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("'aal' in ngdpbase.access.subject-attributes cannot be redefined");
    expect(problems[0]).toContain('remove it');
  });

  test('a sensitive account field and a non-object are reported', async () => {
    const v = await validatorWith();
    expect(v.subjectAttributeProblems({ x: { type: 'string', from: 'account:email' } }).join(' ')).toContain("'account:email' cannot be used in a condition");
    expect(v.subjectAttributeProblems('nope')).toHaveLength(1);
  });

  test('a policy reading subject:aal is judged against the built-in even when config redefines it', async () => {
    const v = await validatorWith({ 'ngdpbase.access.subject-attributes': { aal: { type: 'string', from: 'profile:department' } } });
    expect(v.policyProblems(withCondition({ attribute: 'subject:aal', 'greater-or-equal': 2 }))).toEqual([]);
  });
});

describe('add-ons that ship config (#2287)', () => {
  test('none declares subject:id or subject:aal with another meaning', () => {
    const dir = path.join(__dirname, '../../../addons');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).map((a) => path.join(dir, a, 'config/default-config.json')).filter((f) => fs.existsSync(f)) : [];
    for (const f of files) {
      const declared = (JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, unknown>)['ngdpbase.access.subject-attributes'];
      expect({ f, problems: declared === undefined ? [] : new PolicyValidator({ getManager: () => null }).subjectAttributeProblems(declared) }).toEqual({ f, problems: [] });
    }
  });
});
