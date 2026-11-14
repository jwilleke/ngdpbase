/**
 * Resource attributes on more than `page` (#2261 slice 5).
 *
 * `vault` and `shared-folder` can declare attributes in
 * `ngdpbase.access.resource-types`, as `page` does. A policy reads the `page`
 * set (as before, so no shipped policy changes), plus the set of each of those
 * two types it names in `resources`. A policy naming no type, or only
 * `system-category`, gets the `page` set alone.
 */
vi.unmock('../PolicyEvaluator');
import PolicyEvaluator, { conditionAttributeSource, conditionProblems } from '../PolicyEvaluator';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import { declaredAttributes } from '../../utils/policyAttributes';
import { attr, val } from './__fixtures__/conditions';

const TYPES = {
  page: { attributes: { 'system-category': { type: 'string', from: 'frontmatter:system-category' }, encrypted: { type: 'boolean', from: 'vault:encrypted' } } },
  'system-category': {},
  vault: { attributes: { tier: { type: 'string', from: 'frontmatter:tier' } } },
  'shared-folder': { attributes: { team: { type: 'string', from: 'frontmatter:team' } } }
};

const readsTier = { 'string-equal': [attr('resource:tier'), val('gold')] };
const readsTeam = { 'string-equal': [attr('resource:team'), val('ops')] };
const readsEncrypted = { 'boolean-equal': [attr('resource:encrypted', 'boolean'), val(true, 'boolean')] };

const problemsFor = (condition: unknown, resources: Array<{ type: string }> | undefined) => {
  const source = conditionAttributeSource(resources, TYPES);
  return conditionProblems(condition, source.attributes, undefined, {}, source.label);
};

describe('declaredAttributes(type)', () => {
  test('is the attributes one type declares, and {} for a type with none or an unknown type', () => {
    expect(Object.keys(declaredAttributes(TYPES, 'vault'))).toEqual(['tier']);
    expect(Object.keys(declaredAttributes(TYPES, 'page'))).toEqual(['system-category', 'encrypted']);
    expect(declaredAttributes(TYPES, 'system-category')).toEqual({});
    expect(declaredAttributes(TYPES, 'nope')).toEqual({});
    expect(declaredAttributes(null, 'page')).toEqual({});
  });

  test('does not read an inherited property', () => {
    expect(declaredAttributes(TYPES, 'constructor')).toEqual({});
    expect(declaredAttributes(TYPES, '__proto__')).toEqual({});
  });
});

describe('which attributes a policy may read', () => {
  test('an attribute declared on vault is readable by a policy naming vault', () => {
    expect(problemsFor(readsTier, [{ type: 'vault' }])).toEqual([]);
  });

  test('the same condition on a policy naming only system-category is reported "not declared"', () => {
    const problems = problemsFor(readsTier, [{ type: 'system-category' }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/resource:tier.*not declared/);
  });

  test('a policy naming no type, or a page, gets the page set only', () => {
    expect(problemsFor(readsTier, undefined).join(' ')).toMatch(/not declared/);
    expect(problemsFor(readsTier, []).join(' ')).toMatch(/not declared/);
    expect(problemsFor(readsTier, [{ type: 'page' }]).join(' ')).toMatch(/not declared/);
    expect(problemsFor(readsEncrypted, undefined)).toEqual([]);
    expect(problemsFor(readsEncrypted, [{ type: 'system-category' }])).toEqual([]);
  });

  test('a policy naming vault still reads the page set, as it did before', () => {
    expect(problemsFor(readsEncrypted, [{ type: 'vault' }])).toEqual([]);
  });

  test('the set of one type is not the set of another: vault does not give shared-folder\'s attribute', () => {
    expect(problemsFor(readsTeam, [{ type: 'vault' }]).join(' ')).toMatch(/not declared/);
    expect(problemsFor(readsTeam, [{ type: 'shared-folder' }])).toEqual([]);
    expect(problemsFor(readsTier, [{ type: 'shared-folder' }]).join(' ')).toMatch(/not declared/);
  });

  test('a policy naming both types reads both sets', () => {
    expect(problemsFor({ or: [readsTier, readsTeam] }, [{ type: 'vault' }, { type: 'shared-folder' }])).toEqual([]);
  });

  test('where a name is declared on page and on vault, the page declaration is the one in force', () => {
    const types = { ...TYPES, vault: { attributes: { encrypted: { type: 'string', from: 'frontmatter:x' } } } };
    expect(conditionAttributeSource([{ type: 'vault' }], types).attributes.encrypted).toEqual(TYPES.page.attributes.encrypted);
  });

  test('an add-on type naming only itself still reads only its own attributes', () => {
    const types = { ...TYPES, 'project-record': { attributes: { code: { type: 'string' } } } };
    const source = conditionAttributeSource([{ type: 'project-record' }], types);
    expect(Object.keys(source.attributes)).toEqual(['code']);
    expect(source.label).toBe('project-record');
  });
});

describe('the evaluator and the boot warning use the same sets', () => {
  const policy = (resources: unknown[]) => ({
    id: 'p', name: 'p', effect: 'allow', subjects: [{ type: 'anyone' }], resources, actions: ['page-read'], condition: readsTier
  });
  const evaluatorWith = (policies: unknown[]) => {
    const config: Record<string, unknown> = {
      'ngdpbase.access.policies.enabled': true,
      'ngdpbase.access.policies': policies,
      'ngdpbase.access.resource-types': TYPES
    };
    const configManager = { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def) };
    const managers: Record<string, unknown> = { ConfigurationManager: configManager };
    const engine = { getManager: (n: string) => managers[n] ?? null };
    managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
    const pe = new PolicyEvaluator(engine);
    (pe as unknown as { configManager: unknown }).configManager = configManager;
    return pe;
  };

  test('conditionProblemsInForce names a vault attribute read by a policy that does not name vault, and not one that does', () => {
    const pe = evaluatorWith([
      { ...policy([{ type: 'system-category', pattern: 'general' }]), id: 'wrong' },
      { ...policy([{ type: 'vault', pattern: '*' }]), id: 'right' }
    ]);
    expect(pe.conditionProblemsInForce().map((p) => p.id)).toEqual(['wrong']);
  });

  test('a policy that reads an attribute not declared for its types never holds: an allow does not apply', async () => {
    const pe = evaluatorWith([{ ...policy([{ type: 'system-category', pattern: 'general' }]) }]);
    const decide = pe.compile({ username: 'a', roles: [], isAuthenticated: true }, 'page-read');
    const result = await decide('P', { 'system-category': 'general' }, () => 'gold');
    expect(result.hasDecision).toBe(false);
  });

  test('declaredPageAttributes is the page set', () => {
    expect(Object.keys(evaluatorWith([]).declaredPageAttributes())).toEqual(['system-category', 'encrypted']);
  });
});
