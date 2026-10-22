/**
 * #1964 — page audience `addon:<slug>`: people who turned on the per-person
 * add-on <slug>.
 *
 * One rule, in Tier 1, so the page view, the page list and search agree. Run
 * against the SHIPPED policies with a real PolicyEvaluator,
 * PolicyDecisionPoint, PolicyInformationPoint, PageManager and SearchManager,
 * and a real AddonsManager loading add-on folders from a mkdtemp directory.
 * Only the page store, the search index and the account store are fakes.
 *
 * Sabotage: drop the enabled add-ons from Tier 1 and the "phr on" rows go red;
 * match `addon:<slug>` against roles and the spoof row goes red; resolve the
 * add-ons per page and the once-per-batch rows go red.
 */
vi.unmock('../../managers/SearchManager');
vi.unmock('../../managers/PageManager');

import fs from 'fs';
import os from 'os';
import path from 'path';
import fse from 'fs-extra';
import SearchManager from '../../managers/SearchManager';
import PageManager from '../../managers/PageManager';
import PolicyEvaluator from '../../managers/PolicyEvaluator';
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyInformationPoint from '../PolicyInformationPoint';
import logger from '../../utils/logger';

const shipped = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')
) as Record<string, unknown>;

type Meta = Record<string, unknown>;
const page = (title: string, extra: Meta = {}): Meta => ({ title, uuid: `u-${title}`, 'system-category': 'general', ...extra });

/** Title → frontmatter. */
const PAGES: Record<string, Meta> = {
  'Open Page': page('Open Page'),
  'Health Notes': page('Health Notes', { audience: ['addon:phr'] }),
  'Health Or Admin': page('Health Or Admin', { audience: ['addon:phr', 'admin'] }),
  // `ledger` is enabled on the site but not per-person.
  'Ledger Notes': page('Ledger Notes', { audience: ['addon:ledger'] }),
  // No add-on of that name.
  'Ghost Notes': page('Ghost Notes', { audience: ['addon:nosuch'] }),
  // Per-person, but the site has not enabled it, so it is not loaded.
  'Dormant Notes': page('Dormant Notes', { audience: ['addon:dormant'] })
};

/** Add-ons on disk: slug → manifest. */
const ADDONS: Record<string, Meta> = { phr: { perPerson: true }, ledger: {}, dormant: { perPerson: true } };
const SITE_ENABLED = ['phr', 'ledger'];

const pat = { username: 'pat', roles: ['reader'], isAuthenticated: true };     // phr on
const olly = { username: 'olly', roles: ['reader'], isAuthenticated: true };   // phr off
const root = { username: 'root', roles: ['admin'], isAuthenticated: true };    // admin, phr off
const anonymous = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false };

/** What each subject may open, from the rule. */
const EXPECTED: Array<[string, Record<string, unknown>, string[]]> = [
  ['phr on', pat, ['Health Notes', 'Health Or Admin', 'Open Page']],
  ['phr off', olly, ['Open Page']],
  ['admin, phr off', root, ['Health Or Admin', 'Open Page']],
  ['anonymous', anonymous, ['Open Page']]
];

describe('page audience addon:<slug> (#1964)', () => {
  let tmpDir: string;
  let users: Record<string, { username: string; isActive: boolean; preferences: Record<string, unknown> }>;
  let corpus: Record<string, Meta>;
  let pip: PolicyInformationPoint;
  let pageManager: PageManager;
  let searchManager: SearchManager;
  let addonsManager: { enabledAddonsFor: (ctx: unknown) => Promise<string[]> };
  let enabledFor: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fse.mkdtemp(path.join(os.tmpdir(), 'pip-addon-audience-'));
    for (const [slug, manifest] of Object.entries(ADDONS)) {
      const dir = path.join(tmpDir, slug);
      await fse.ensureDir(dir);
      await fse.writeJson(path.join(dir, 'package.json'), { name: slug, version: '1.0.0', ngdpbase: manifest });
      await fse.writeFile(path.join(dir, 'index.js'), `module.exports = { name: '${slug}', version: '1.0.0', register: function () {} };\n`);
    }
    // Every switch is on for pat, including the add-ons that cannot match.
    users = {
      pat: { username: 'pat', isActive: true, preferences: { 'phr.enabled': true, 'ledger.enabled': true, 'dormant.enabled': true, 'nosuch.enabled': true } },
      olly: { username: 'olly', isActive: true, preferences: { 'phr.enabled': false } },
      root: { username: 'root', isActive: true, preferences: {} }
    };
    corpus = { ...PAGES };

    const config: Record<string, unknown> = {
      ...shipped,
      'ngdpbase.managers.addons-manager.enabled': true,
      'ngdpbase.managers.addons-manager.addons-path': tmpDir,
      'ngdpbase.page.provider.filesystem.storagedir': path.join(tmpDir, 'pages'),
      'ngdpbase.addons': {},
      'ngdpbase.version': '99.0.0'
    };
    for (const slug of SITE_ENABLED) config[`ngdpbase.addons.${slug}.enabled`] = true;
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (key: string, def: unknown) => (key in config ? config[key] : def),
        getAddonDeclaredDefaults: () => ({}),
        setProperty: async () => {},
        getAllProperties: () => ({}),
        getResolvedDataPath: () => path.join(tmpDir, 'pages'),
        getCustomProperty: () => null,
        setRuntimeProperty: () => {}
      },
      UserManager: { getUser: async (u: string) => users[u] }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null } as never;

    const evaluator = new PolicyEvaluator(engine);
    managers.PolicyEvaluator = evaluator;
    managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
    await evaluator.initialize();
    pip = new PolicyInformationPoint(engine);
    await pip.initialize();
    managers.PolicyInformationPoint = pip;

    vi.resetModules();
    const { default: AddonsManager } = await import('../../managers/AddonsManager');
    const am = new AddonsManager(engine);
    managers.AddonsManager = am;
    await am.initialize();
    addonsManager = am;
    enabledFor = vi.spyOn(addonsManager, 'enabledAddonsFor');

    pageManager = new PageManager(engine);
    (pageManager as unknown as { provider: unknown }).provider = {
      getPageMetadata: async (name: string) => corpus[name] ?? null,
      getAllPageInfo: async () => Object.entries(corpus).map(([title, metadata]) => ({ title, metadata }))
    };
    managers.PageManager = pageManager;

    searchManager = new SearchManager(engine);
    const hits = () => Object.keys(corpus).map((name, i) => ({ name, title: name, score: 100 - i, snippet: name, metadata: {} }));
    (searchManager as unknown as { provider: unknown }).provider = {
      search: async () => hits(),
      advancedSearch: async () => hits()
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fse.remove(tmpDir).catch(() => {});
  });

  const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

  test('only phr is a per-person add-on that can match (the fixture is as described)', async () => {
    expect(await pip.subjectEnabledAddons(pat as never)).toEqual(['phr']);
    expect(await pip.subjectEnabledAddons(olly as never)).toEqual([]);
  });

  test.each(EXPECTED)('%s: the page view opens exactly the expected pages', async (_label, subject, expected) => {
    const opened: string[] = [];
    for (const title of Object.keys(PAGES)) {
      if (await pip.canUserAccessPage(subject, title, 'view')) opened.push(title);
    }
    expect(sorted(opened)).toEqual(expected);
  });

  test.each(EXPECTED)('%s: the door for the request\'s own page agrees', async (_label, subject, expected) => {
    for (const title of Object.keys(PAGES)) {
      const allowed = await pip.checkPagePermissionWithContext(
        { pageName: title, content: '', userContext: subject, pageMetadata: corpus[title] }, 'view');
      expect(allowed, title).toBe(expected.includes(title));
    }
  });

  test.each(EXPECTED)('%s: the page list shows exactly the expected pages', async (_label, subject, expected) => {
    expect(sorted(await pageManager.listPagesFor(subject as never, 'view'))).toEqual(expected);
  });

  test.each(EXPECTED)('%s: search finds exactly the expected pages', async (_label, subject, expected) => {
    expect(sorted((await searchManager.searchWithContext({ userContext: subject }, 'notes')).map((h) => h.name))).toEqual(expected);
    expect(sorted((await searchManager.advancedSearchWithContext({ userContext: subject }, { query: '' })).map((h) => h.name))).toEqual(expected);
  });

  test('turning the add-on off hides the page again; on shows it', async () => {
    users.pat.preferences['phr.enabled'] = false;
    expect(await pip.canUserAccessPage(pat as never, 'Health Notes', 'view')).toBe(false);
    expect(await pageManager.listPagesFor(pat as never)).not.toContain('Health Notes');
    users.olly.preferences['phr.enabled'] = true;
    expect(await pip.canUserAccessPage(olly as never, 'Health Notes', 'view')).toBe(true);
    expect(await pageManager.listPagesFor(olly as never)).toContain('Health Notes');
  });

  test('an anonymous subject never matches, even carrying the name of someone with it on', async () => {
    const posing = { username: 'pat', roles: ['anonymous'], isAuthenticated: false };
    expect(await pip.canUserAccessPage(posing as never, 'Health Notes', 'view')).toBe(false);
    expect(await pageManager.listPagesFor(posing as never)).toEqual(['Open Page']);
  });

  test('a role or username spelled addon:phr does not match the entry', async () => {
    const spoof = { username: 'addon:phr', roles: ['reader', 'addon:phr'], isAuthenticated: true };
    expect(await pip.canUserAccessPage(spoof as never, 'Health Notes', 'view')).toBe(false);
  });

  test('a list or search resolves the subject\'s add-ons once, not once per page', async () => {
    for (let i = 0; i < 20; i++) corpus[`Health ${i}`] = page(`Health ${i}`, { audience: ['addon:phr'] });
    enabledFor.mockClear();
    const listed = await pageManager.listPagesFor(pat);
    expect(listed.filter((t) => /^Health \d+$/.test(t))).toHaveLength(20);
    expect(enabledFor).toHaveBeenCalledTimes(1);
    enabledFor.mockClear();
    await searchManager.searchWithContext({ userContext: pat }, 'notes');
    expect(enabledFor).toHaveBeenCalledTimes(1);
  });

  test('a list with no page naming an add-on never asks for the subject\'s add-ons', async () => {
    corpus = { 'Open Page': PAGES['Open Page'], 'Admins': page('Admins', { audience: ['admin'] }) };
    enabledFor.mockClear();
    await pageManager.listPagesFor(pat);
    await pip.canUserAccessPage(pat, 'Admins', 'view');
    expect(enabledFor).not.toHaveBeenCalled();
  });

  describe('a slug that can match nobody is warned about, naming the page and the slug', () => {
    test('at startup: unknown, not per-person, and not loaded', async () => {
      const warn = vi.spyOn(logger, 'warn');
      const found = await pageManager.reportUnmatchableAddonAudiences();
      expect(found).toEqual([
        { page: 'Ledger Notes', slug: 'ledger' },
        { page: 'Ghost Notes', slug: 'nosuch' },
        { page: 'Dormant Notes', slug: 'dormant' }
      ]);
      const lines = warn.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes("'Ghost Notes'") && l.includes("'addon:nosuch'"))).toBe(true);
      expect(lines.some((l) => l.includes('phr'))).toBe(false);
    });

    test('a page naming only loaded per-person add-ons is not warned about', () => {
      expect(pageManager.unmatchableAddonAudience({ audience: ['addon:phr', 'admin'] })).toEqual([]);
      expect(pageManager.unmatchableAddonAudience({ access: { view: ['addon:phr'], edit: ['addon:ledger'] } })).toEqual(['ledger']);
    });
  });

  test('without AddonsManager an addon entry matches nobody', async () => {
    const bare = new PolicyInformationPoint({
      getManager: (n: string) => (n === 'AddonsManager' ? null : (pip as unknown as { engine: { getManager(n: string): unknown } }).engine.getManager(n))
    });
    await bare.initialize();
    expect(await bare.canUserAccessPage(pat as never, 'Health Notes', 'view')).toBe(false);
    expect(await bare.canUserAccessPage(root as never, 'Health Or Admin', 'view')).toBe(true);
  });
});
