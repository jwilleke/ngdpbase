/**
 * Search shows a page only to someone who may open it — #1962.
 *
 * The search index knows nothing of a page's `audience`, its `access` rules or
 * the policies, so SearchManager puts every hit through the page-list door
 * (`PageManager.filterPagesFor` → `PolicyInformationPoint.filterAccessiblePages`)
 * before its limit. Run against the SHIPPED policies plus one system-category
 * deny, with a real PolicyEvaluator, PolicyDecisionPoint,
 * PolicyInformationPoint and PageManager; only the two indexes are fakes.
 *
 * The property that matters is agreement with the page view: for every
 * subject and page, the page is a hit exactly when `canUserAccessPage` would
 * open it. Then: counts and pages never count a hidden page.
 *
 * Sabotage: make `hitsVisibleTo` return the provider's hits unfiltered, or
 * filter after the limit, and these go red.
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

const shipped = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')
) as Record<string, unknown>;

/** A system-category deny, as an add-on or an operator would add one. */
const TREASURY_DENY = {
  id: 'test-treasury-deny',
  name: 'Treasury pages are not for readers',
  priority: 200,
  effect: 'deny',
  subjects: [{ type: 'role', value: 'reader' }, { type: 'role', value: 'anonymous' }],
  resources: [{ type: 'system-category', pattern: 'treasury' }],
  actions: ['page-read']
};

type Meta = Record<string, unknown>;
const page = (title: string, extra: Meta = {}): Meta => ({ title, uuid: `u-${title}`, 'system-category': 'general', ...extra });

/** Title → frontmatter. Every body holds the word `apricot`. */
const PAGES: Record<string, Meta> = {
  'Open Page': page('Open Page'),
  'Admins Only': page('Admins Only', { audience: ['admin'] }),
  'Editors View': page('Editors View', { access: { view: ['editor'] } }),
  'Treasury Ledger': page('Treasury Ledger', { 'system-category': 'treasury' })
};

const anonymous = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false };
const reader = { username: 'rita', roles: ['reader'], isAuthenticated: true };
const editor = { username: 'ed', roles: ['editor'], isAuthenticated: true };
const admin = { username: 'root', roles: ['admin'], isAuthenticated: true };
const SUBJECTS: Array<[string, Record<string, unknown>]> = [
  ['anonymous', anonymous], ['reader', reader], ['editor', editor], ['admin', admin]
];

describe('search hits are the pages the searcher may open (#1962)', () => {
  let pip: PolicyInformationPoint;
  let searchManager: SearchManager;
  let corpus: Record<string, Meta>;
  /** The order the fake index ranks its hits in. */
  let ranking: string[];
  let config: Record<string, unknown>;
  let providerLimits: number[];

  /** A search index: every page whose title or word list matches, ranked, cut at maxResults. */
  const hitsFor = (query: string, maxResults: number) => ranking
    .filter((name) => !query || query === 'apricot' || name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, maxResults)
    .map((name, i) => ({ name, title: name, score: 100 - i, snippet: `${name}: apricot`, metadata: {} }));

  beforeEach(async () => {
    corpus = { ...PAGES };
    ranking = Object.keys(corpus);
    providerLimits = [];
    config = {
      ...shipped,
      'ngdpbase.access.policies': [...(shipped['ngdpbase.access.policies'] as unknown[]), TREASURY_DENY]
    };
    const managers: Record<string, unknown> = {
      ConfigurationManager: { getProperty: (key: string, def: unknown) => (key in config ? config[key] : def) }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;

    const evaluator = new PolicyEvaluator(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
    await evaluator.initialize();
    pip = new PolicyInformationPoint(engine);
    await pip.initialize();
    managers.PolicyInformationPoint = pip;

    const pageManager = new PageManager(engine);
    (pageManager as unknown as { provider: unknown }).provider = {
      getPageMetadata: async (name: string) => corpus[name] ?? null
    };
    managers.PageManager = pageManager;

    searchManager = new SearchManager(engine);
    (searchManager as unknown as { provider: unknown }).provider = {
      search: vi.fn(async (query: string, options: { maxResults: number }) => {
        providerLimits.push(options.maxResults);
        return hitsFor(query, options.maxResults);
      }),
      advancedSearch: vi.fn(async (options: { query?: string; maxResults: number }) => {
        providerLimits.push(options.maxResults);
        return hitsFor(options.query ?? '', options.maxResults);
      })
    };
  });

  const names = (rows: Array<{ name: string }>): string[] => rows.map((r) => r.name).sort();

  test.each(SUBJECTS)('%s: a page is a hit exactly when the page view would open it — text search', async (_label, subject) => {
    const hits = new Set(names(await searchManager.searchWithContext({ userContext: subject }, 'apricot')));
    for (const title of Object.keys(PAGES)) {
      const opens = await pip.canUserAccessPage(subject, title, 'view');
      expect(hits.has(title), `${_label} / ${title}: hit=${hits.has(title)} opens=${opens}`).toBe(opens);
    }
  });

  test.each(SUBJECTS)('%s: the same for the advanced and no-text search', async (_label, subject) => {
    for (const query of ['apricot', '']) {
      const hits = new Set(names(await searchManager.advancedSearchWithContext({ userContext: subject }, { query })));
      for (const title of Object.keys(PAGES)) {
        const opens = await pip.canUserAccessPage(subject, title, 'view');
        expect(hits.has(title), `${_label} / "${query}" / ${title}`).toBe(opens);
      }
    }
  });

  test('audience, access.view and the system-category deny each hide their page from a reader and from anonymous', async () => {
    for (const subject of [reader, anonymous]) {
      expect(names(await searchManager.searchWithContext({ userContext: subject }, 'apricot'))).toEqual(['Open Page']);
    }
  });

  test('an admin finds the audience and treasury pages, but not one whose access rule names only editors', async () => {
    // `access.view` overrides global policy (#1054), so /view refuses the admin too.
    expect(names(await searchManager.searchWithContext({ userContext: admin }, 'apricot')))
      .toEqual(['Admins Only', 'Open Page', 'Treasury Ledger']);
    expect(names(await searchManager.searchWithContext({ userContext: editor }, 'apricot')))
      .toEqual(['Editors View', 'Open Page', 'Treasury Ledger']);
  });

  test('with no subject at all, nothing restricted is found', async () => {
    expect(names(await searchManager.searchWithContext({}, 'apricot'))).toEqual([]);
  });

  describe('counts and pages never count a hidden page', () => {
    beforeEach(() => {
      // Thirty hidden pages that out-rank five open ones.
      for (let i = 0; i < 30; i++) corpus[`Secret ${i}`] = page(`Secret ${i}`, { audience: ['admin'] });
      for (let i = 0; i < 5; i++) corpus[`Visible ${i}`] = page(`Visible ${i}`);
      ranking = [...Array.from({ length: 30 }, (_, i) => `Secret ${i}`), ...Array.from({ length: 5 }, (_, i) => `Visible ${i}`)];
    });

    test('a short page is filled from beyond the hidden hits — decided before the limit', async () => {
      const hits = await searchManager.searchWithContext({ userContext: reader }, 'apricot', { maxResults: 3 });
      expect(hits.map((h) => h.name)).toEqual(['Visible 0', 'Visible 1', 'Visible 2']);
      // Asked for 3, then 6, 12, 24, 48 until the index held no more.
      expect(providerLimits).toEqual([3, 6, 12, 24, 48]);
    });

    test('the total a caller counts is the visible total', async () => {
      const all = await searchManager.advancedSearchWithContext({ userContext: reader }, { query: '', maxResults: 200 });
      expect(all).toHaveLength(5);
      expect(all.every((h) => h.name.startsWith('Visible'))).toBe(true);
      const asAdmin = await searchManager.advancedSearchWithContext({ userContext: admin }, { query: '', maxResults: 200 });
      expect(asAdmin).toHaveLength(35);
    });

    test('no hidden hit fills the window a page-two request slices', async () => {
      // The route slices offset/pageSize out of what SearchManager returns.
      const all = await searchManager.advancedSearchWithContext({ userContext: anonymous }, { query: '', maxResults: 4 });
      expect(all.map((h) => h.name)).toEqual(['Visible 0', 'Visible 1', 'Visible 2', 'Visible 3']);
    });

    test('ngdpbase.search.access-filter.max-candidates bounds the work: the result is short, not slow', async () => {
      config['ngdpbase.search.access-filter.max-candidates'] = 10;
      const hits = await searchManager.searchWithContext({ userContext: reader }, 'apricot', { maxResults: 3 });
      expect(hits).toEqual([]);
      expect(providerLimits).toEqual([3, 6, 10]);
    });
  });

  test('a hit for a page that no longer exists is dropped', async () => {
    ranking = ['Ghost', 'Open Page'];
    expect(names(await searchManager.searchWithContext({ userContext: admin }, 'apricot'))).toEqual(['Open Page']);
  });

  test('without the page-list door no page hit is returned — never the unfiltered index', async () => {
    (searchManager as unknown as { engine: unknown }).engine = {
      getManager: (name: string) => (name === 'PageManager' ? {} : null)
    };
    expect(await searchManager.searchWithContext({ userContext: admin }, 'apricot')).toEqual([]);
    expect(await searchManager.advancedSearchWithContext({ userContext: admin }, { query: '' })).toEqual([]);
  });
});
