/**
 * A search over 5,000 candidates with conditions on subject, environment and
 * resource attributes costs at most twice the same search with none (#2261,
 * slice 6, decided in #2261 Q4).
 *
 * Real SearchManager, PageManager, PolicyEvaluator, PolicyDecisionPoint and
 * PolicyInformationPoint, with the shipped configuration plus the page-based
 * worked example's attributes. Only the search index and the page index are
 * fakes (in memory, as the page index is). The conditioned run reads the
 * subject's department from the account record, the business-hours schedule
 * and each page's `department`, `system-category` and `author`.
 * Sabotage check: read the subject's account or the schedule once per
 * candidate instead of once per search and the ratio goes over the budget.
 */
vi.unmock('../SearchManager');
vi.unmock('../PageManager');

import fs from 'fs';
import path from 'path';
import SearchManager from '../SearchManager';
import PageManager from '../PageManager';
import PolicyEvaluator from '../PolicyEvaluator';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import PolicyInformationPoint from '../../security/PolicyInformationPoint';
import { attr, val } from './__fixtures__/conditions';
import { projectDocumentsConfig } from './__fixtures__/projectDocumentsConfig';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

const CANDIDATES = 5000;
const RUNS = 7;
const BUDGET = 2;
const TUESDAY_10 = new Date('2026-03-10T14:00:00Z');

const policy = (id: string, condition?: unknown) => ({
  id, name: id, effect: 'allow',
  subjects: [{ type: 'authenticated' }],
  resources: [{ type: 'system-category', pattern: 'project-document' }],
  actions: ['page-read'],
  ...(condition ? { condition } : {})
});

/** One condition on each source: the subject, the environment and the page. */
const CONDITIONED = {
  and: [
    { 'integer-greater-than-or-equal': [attr('subject:aal', 'integer'), val(1, 'integer')] },
    { 'boolean-equal': [attr('environment:is-business-hours', 'boolean'), val(true, 'boolean')] },
    { 'string-equal': [attr('subject:department-id'), attr('resource:owning-department')] }
  ]
};

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe(`search over ${CANDIDATES} candidates with conditions (#2261 slice 6)`, () => {
  const corpus: Record<string, Record<string, unknown>> = {};
  const names = Array.from({ length: CANDIDATES }, (_, i) => `Plan ${i}`);
  names.forEach((name, i) => {
    corpus[name] = { title: name, uuid: `u-${i}`, 'system-category': 'project-document', author: `author-${i % 50}`, department: i % 2 ? 'engineering' : 'sales' };
  });
  const searcher = { username: 'lena', roles: ['member'], isAuthenticated: true, signIn: { provider: 'password', factors: [], at: '2026-03-10T13:00:00Z', aal: 2 } };

  const build = async (policies: unknown[]) => {
    const config = { ...projectDocumentsConfig(shipped), 'ngdpbase.access.policies': policies, 'ngdpbase.search.access-filter.max-candidates': CANDIDATES };
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def), getUnresolvedProperty: (key: string, def: unknown) => (key in config ? config[key] : def) },
      ValidationManager: { getDefaultSystemCategory: () => 'general' },
      UserManager: { getUser: () => Promise.resolve({ department: 'engineering' }) }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;
    const evaluator = new PolicyEvaluator(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
    await evaluator.initialize();
    const pip = new PolicyInformationPoint(engine, () => TUESDAY_10);
    await pip.initialize();
    managers.PolicyInformationPoint = pip;
    const pageManager = new PageManager(engine);
    (pageManager as unknown as { provider: unknown }).provider = { getPageMetadata: async (name: string) => corpus[name] ?? null };
    managers.PageManager = pageManager;
    const search = new SearchManager(engine);
    const hits = (max: number) => names.slice(0, max).map((name, i) => ({ name, title: name, score: CANDIDATES - i, snippet: name, metadata: {} }));
    (search as unknown as { provider: unknown }).provider = {
      search: async (_q: string, o: { maxResults: number }) => hits(o.maxResults),
      advancedSearch: async (o: { maxResults: number }) => hits(o.maxResults)
    };
    return search;
  };

  const timeIt = async (search: SearchManager): Promise<{ ms: number; hits: number }> => {
    const start = performance.now();
    const found = await search.searchWithContext({ userContext: searcher }, 'plan', { maxResults: CANDIDATES });
    return { ms: performance.now() - start, hits: found.length };
  };

  test('with conditions the search takes at most 2x the time with none, and returns the right pages', async () => {
    const plain = await build([policy('read-plain')]);
    const conditioned = await build([policy('read-conditioned', CONDITIONED)]);
    await timeIt(plain);
    await timeIt(conditioned); // warm-up: compile, JIT
    const plainMs: number[] = [];
    const conditionedMs: number[] = [];
    let plainHits = 0;
    let conditionedHits = 0;
    for (let i = 0; i < RUNS; i++) { // alternate, so drift hits both alike
      const a = await timeIt(plain);
      const b = await timeIt(conditioned);
      plainMs.push(a.ms); conditionedMs.push(b.ms); plainHits = a.hits; conditionedHits = b.hits;
    }
    const base = median(plainMs);
    const withConditions = median(conditionedMs);
    process.stdout.write(`[#2261 slice 6 budget] ${CANDIDATES} candidates, median of ${RUNS}: no conditions ${base.toFixed(1)} ms (${plainHits} hits), conditions on subject, environment and resource ${withConditions.toFixed(1)} ms (${conditionedHits} hits), ratio ${(withConditions / base).toFixed(2)}\n`);

    expect(plainHits).toBe(CANDIDATES);
    expect(conditionedHits).toBe(CANDIDATES / 2); // only the engineering half
    expect(withConditions).toBeLessThanOrEqual(base * BUDGET);
  }, 120000);
});
