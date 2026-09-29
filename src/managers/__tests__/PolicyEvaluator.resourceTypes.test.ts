/**
 * #1504 part 5 — policy resource types are declared once, in configuration
 * (`ngdpbase.access.resource-types`), read through ConfigurationManager. The
 * evaluator keeps one matcher per type; a type that is not declared, or that
 * has no matcher, never matches. `system-category` matches a page by its
 * system-category frontmatter, supplied with the request.
 */
vi.unmock('../PolicyEvaluator');
import fs from 'fs';
import path from 'path';
import PolicyEvaluator, { RESOURCE_MATCHERS } from '../PolicyEvaluator';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';

const jim = { username: 'jim', roles: ['contributor'], isAuthenticated: true };

function evaluatorWith(policies: unknown[], resourceTypes?: Record<string, unknown>) {
  const config: Record<string, unknown> = {
    'ngdpbase.access.policies.enabled': true,
    'ngdpbase.access.policies': policies,
    ...(resourceTypes ? { 'ngdpbase.access.resource-types': resourceTypes } : {})
  };
  const configManager = { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def) };
  const managers: Record<string, unknown> = { ConfigurationManager: configManager };
  const engine = { getManager: (n: string) => managers[n] ?? null };
  managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
  const pe = new PolicyEvaluator(engine);
  (pe as unknown as { configManager: unknown }).configManager = configManager;
  return pe;
}

const declared = { page: { description: 'by name' }, 'system-category': { description: 'by system-category' } };
const publicJournal = {
  id: 'journal-public', effect: 'allow', subjects: [{ type: 'role', value: 'contributor' }],
  resources: [{ type: 'system-category', pattern: 'journal' }], actions: ['page-public']
};

describe('system-category resources (#1504)', () => {
  test('match a page by its system-category, not its name', async () => {
    const pe = evaluatorWith([publicJournal], declared);
    const ask = (category?: string) => pe.evaluateAccess({ pageName: 'Diary', action: 'page-public', userContext: jim, attributes: { 'system-category': category } });
    expect((await ask('journal')).allowed).toBe(true);
    expect((await ask('general')).hasDecision).toBe(false);
    expect((await ask(undefined)).hasDecision).toBe(false);
  });

  test('compile() matches them the same way', () => {
    const decide = evaluatorWith([publicJournal], declared).compile(jim, 'page-public');
    expect(decide('Diary', { 'system-category': 'journal' }).allowed).toBe(true);
    expect(decide('Diary', { 'system-category': 'general' }).hasDecision).toBe(false);
  });

  test('page resources still match by name', async () => {
    const pe = evaluatorWith([{ id: 'p', effect: 'allow', subjects: [{ type: 'role', value: 'contributor' }], resources: [{ type: 'page', pattern: 'Admin*' }], actions: ['page-edit'] }], declared);
    expect((await pe.evaluateAccess({ pageName: 'AdminPanel', action: 'page-edit', userContext: jim })).allowed).toBe(true);
    expect((await pe.evaluateAccess({ pageName: 'Main', action: 'page-edit', userContext: jim })).hasDecision).toBe(false);
  });
});

describe('only declared resource types match (#1504)', () => {
  test('a type the configuration does not declare never matches', async () => {
    const pe = evaluatorWith([publicJournal], { page: { description: 'by name' } });
    expect((await pe.evaluateAccess({ pageName: 'Diary', action: 'page-public', userContext: jim, attributes: { 'system-category': 'journal' } })).hasDecision).toBe(false);
  });

  test('a declared type with no matcher never matches', async () => {
    const pe = evaluatorWith([{ ...publicJournal, resources: [{ type: 'tag', pattern: '*' }] }], { ...declared, tag: { description: 'no matcher' } });
    expect((await pe.evaluateAccess({ pageName: 'Diary', action: 'page-public', userContext: jim })).hasDecision).toBe(false);
  });

  test('the shipped declaration and the evaluator\'s matchers are the same set', () => {
    const shipped = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'app-default-config.json'), 'utf8')) as Record<string, unknown>;
    const types = Object.keys(shipped['ngdpbase.access.resource-types'] as Record<string, unknown>).sort();
    expect(types).toEqual(Object.keys(RESOURCE_MATCHERS).sort());
  });
});
