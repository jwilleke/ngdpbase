/**
 * Required Pages Sync status comes from the page body and a source-hash stamp — issue #1395.
 *
 * The list compared the whole file, less `lastModified`, `user-modified` and
 * `editor`. Since #1376 the sync saves through PageManager, which writes a
 * `created` date the source never has — so every synced page still read as
 * 'modified', and "Sync all Outdated" reloaded onto the same list.
 *
 * Required pages now use the addon rule (#931): source body, live body and the
 * `required-source-hash` stamped at sync or seed. Frontmatter is not compared.
 */

// #1406: Sync saves through PageManager's shared seeder — a real PageManager
// over the real FileSystemProvider, so the created date, the stamp and the
// protection are the ones a site gets.
vi.unmock('../../managers/PageManager');
vi.unmock('../../providers/FileSystemProvider');

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import { JSDOM } from 'jsdom';
import WikiRoutes from '../WikiRoutes';
import PageManager from '../../managers/PageManager';
import { withWriteDoorAllowing } from '../../__tests__/__fixtures__/pageWriteDoor';
import { SeededShippedPages } from '../../utils/seededShippedPages';
import { pageSourceHash, REQUIRED_SOURCE_HASH_KEY } from '../../utils/addonPageSync';

const UUID = 'b780e809-d45b-4c4b-84ec-ad30a74a3605';
const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../views');

const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

const createMockReq = (body: unknown = {}) => ({
  params: {},
  query: {},
  body,
  session: { csrfToken: 'tok' },
  path: '/admin/required-pages',
  originalUrl: '/admin/required-pages',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: admin
});

const createMockRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  redirect: vi.fn().mockReturnThis(),
  render: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis()
});

const page = (body: string, extra = '') =>
  `---\ntitle: FootnoteExample\nuuid: ${UUID}\nslug: footnoteexample\n${extra}---\n${body}\n`;

/** mkdtemp keeps teardown scoped to a directory this test created — never a live `data/` tree. */
async function makeDirs() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-required-hash-'));
  const requiredDir = path.join(root, 'required-pages');
  const pagesDir = path.join(root, 'pages');
  const instanceDir = path.join(root, 'instance');
  await fs.mkdir(requiredDir);
  await fs.mkdir(pagesDir);
  await fs.mkdir(instanceDir);
  return { root, requiredDir, pagesDir, instanceDir };
}

async function makeRoutes(dirs: { requiredDir: string; pagesDir: string; instanceDir: string; addonPagesDir?: string }) {
  const configManager = {
    getProperty: vi.fn((key: string, def: unknown) => {
      if (key === 'ngdpbase.page.provider') return 'filesystemprovider';
      if (key === 'ngdpbase.page.provider.filesystem.storagedir') return dirs.pagesDir;
      if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return dirs.requiredDir;
      return def;
    }),
    getResolvedDataPath: vi.fn(() => dirs.pagesDir),
    getInstanceDataFolder: vi.fn(() => dirs.instanceDir)
  };
  const holder: { pageManager?: PageManager } = {};
  const engine = {
    // #1815: the write door's deciders allow; the sync status is the subject here.
    getManager: vi.fn(withWriteDoorAllowing((name: string) => {
      if (name === 'UserManager') return { hasPermission: vi.fn().mockResolvedValue(true) };
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'ValidationManager') {
        return {
          checkConflicts: vi.fn().mockResolvedValue({ hasConflict: false }),
          // #1462 slice 2: every save goes through the one door, which sanitises.
          sanitizeMetadata: (m: unknown) => m,
          getCategoryStored: () => 'public'
        };
      }
      if (name === 'PageManager') return holder.pageManager;
      if (name === 'SearchManager') return { rebuildIndex: vi.fn().mockResolvedValue(undefined) };
      if (name === 'AddonsManager' && dirs.addonPagesDir) {
        return {
          getEnabledAddonPagesDirectories: () => [{ name: 'demo', pagesDir: dirs.addonPagesDir }],
          findOrphanedAddonPages: async () => []
        };
      }
      return null;
    }))
  };
  const pageManager = new PageManager(engine);
  holder.pageManager = pageManager;
  await pageManager.initialize();
  const savePage = vi.spyOn(pageManager, 'savePage');

  const routes = new WikiRoutes(engine) as unknown as {
    adminRequiredPages(req: unknown, res: unknown): Promise<void>;
    adminSyncRequiredPages(req: unknown, res: unknown): Promise<void>;
    createWikiContext: unknown;
    hasAdminViewAccess: unknown;
    getCommonTemplateData: unknown;
    findRequiredCategoryPagesNotInSource: unknown;
  };
  routes.createWikiContext = () => ({ userContext: admin, hasPermission: async () => true });
  routes.hasAdminViewAccess = async () => true;
  routes.getCommonTemplateData = async () => ({});
  routes.findRequiredCategoryPagesNotInSource = async () => [];
  return { routes, savePage, pageManager };
}

/** Refresh the provider's view after writing live files around it. */
async function reload(pm: PageManager) {
  await pm.refreshPageList();
}

/** The status and userModified flag the list renders for UUID. */
async function listed(routes: ReturnType<typeof makeRoutes>['routes']) {
  const res = createMockRes();
  await routes.adminRequiredPages(createMockReq(), res);
  expect(res.render).toHaveBeenCalledWith('admin-required-pages', expect.anything());
  const data = res.render.mock.calls[0][1] as { comparison: Array<{ uuid: string; status: string; userModified: boolean; syncState?: string }> };
  return data.comparison.find((p) => p.uuid === UUID);
}

describe('Required Pages Sync status — body and source-hash stamp (#1395)', () => {
  let dirs: Awaited<ReturnType<typeof makeDirs>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    dirs = await makeDirs();
  });

  afterEach(async () => {
    // Scoped to the mkdtemp directory created above — never a project path.
    await fs.rm(dirs.root, { recursive: true, force: true });
  });

  test('a synced page reads as current, although the save added a created date', async () => {
    // THE regression: sync, reload, same list.
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
    await fs.writeFile(path.join(dirs.pagesDir, `${UUID}.md`), page('old body', `${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('old body')}\n`), 'utf8');
    const { routes, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);
    expect(await listed(routes)).toMatchObject({ status: 'modified', syncState: 'update-ready' });

    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), createMockRes());

    const live = await fs.readFile(path.join(dirs.pagesDir, `${UUID}.md`), 'utf8');
    expect(live).toContain('created:');
    expect(await listed(routes)).toMatchObject({ status: 'current', syncState: 'same-as-shipped' });
  });

  test('a live copy with broken front matter is Update ready, so Sync All heals it (M1)', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('shipped body'), 'utf8');
    // No closing `---`: the front matter does not parse.
    await fs.writeFile(path.join(dirs.pagesDir, `${UUID}.md`), `---\ntitle: FootnoteExample\nuuid: ${UUID}\nslug: footnoteexample\n\nSome body\n- list\n`, 'utf8');
    const { routes, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    // #2414: the row says its header could not be read.
    expect(await listed(routes)).toMatchObject({ status: 'modified', syncState: 'update-ready', headerUnreadable: true });

    const res = createMockRes();
    await routes.adminRequiredPages(createMockReq(), res);
    const data = res.render.mock.calls[0][1] as { counts: { outdatedSyncable: number }; comparison: Array<{ uuid: string; bulkOutdated?: boolean }> };
    expect(data.counts.outdatedSyncable).toBe(1);
    expect(data.comparison.find((p) => p.uuid === UUID)?.bulkOutdated).toBe(true);
  });

  describe('an add-on live copy with broken front matter (#2389)', () => {
    const ADDON_UUID = '7d3f1c9a-2b4e-4f6a-8c1d-5e9a0b7c3d21';
    const addonSource = `---\ntitle: AddonPage\nuuid: ${ADDON_UUID}\nslug: addonpage\n---\nshipped add-on body\n`;
    // No closing `---`: the front matter does not parse.
    const brokenLive = (tag: string) => `---\ntitle: AddonPage\nuuid: ${ADDON_UUID}\nslug: addonpage\n\nbroken ${tag}\n- list\n`;

    async function renderAddonRows(routes: Awaited<ReturnType<typeof makeRoutes>>['routes']) {
      const res = createMockRes();
      await routes.adminRequiredPages(createMockReq(), res);
      // The screen loads: no 500 from the outer catch.
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.render).toHaveBeenCalledWith('admin-required-pages', expect.anything());
      return res.render.mock.calls[0][1] as {
        addonComparison: Array<{ uuid: string; status: string; userModified: boolean; syncState?: string; bulkOutdated?: boolean }>;
        addonCounts: { outdatedSyncable: number };
      };
    }

    test('nothing has parsed the text yet: the screen loads and the row is Update ready, counted for Sync All', { retry: 0 }, async () => {
      const addonDir = path.join(dirs.root, 'addon-pages');
      await fs.mkdir(addonDir);
      const { routes } = await makeRoutes({ ...dirs, addonPagesDir: addonDir });
      await fs.writeFile(path.join(addonDir, 'addonpage.md'), addonSource, 'utf8');
      // Written after the provider started and never reloaded: the route parses it first.
      await fs.writeFile(path.join(dirs.pagesDir, `${ADDON_UUID}.md`), brokenLive('uncached'), 'utf8');

      const data = await renderAddonRows(routes);
      expect(data.addonComparison.find((p) => p.uuid === ADDON_UUID)).toMatchObject({ status: 'modified', userModified: false, syncState: 'update-ready', bulkOutdated: true, headerUnreadable: true });
      expect(data.addonCounts.outdatedSyncable).toBe(1);
    });

    test('the page provider parsed the text first: the row is Update ready, not Edited here', { retry: 0 }, async () => {
      const addonDir = path.join(dirs.root, 'addon-pages');
      await fs.mkdir(addonDir);
      await fs.writeFile(path.join(addonDir, 'addonpage.md'), addonSource, 'utf8');
      await fs.writeFile(path.join(dirs.pagesDir, `${ADDON_UUID}.md`), brokenLive('cached'), 'utf8');
      const { routes, pageManager } = await makeRoutes({ ...dirs, addonPagesDir: addonDir });
      await reload(pageManager);

      const data = await renderAddonRows(routes);
      expect(data.addonComparison.find((p) => p.uuid === ADDON_UUID)).toMatchObject({ status: 'modified', userModified: false, syncState: 'update-ready', bulkOutdated: true, headerUnreadable: true });
      expect(data.addonCounts.outdatedSyncable).toBe(1);
    });
  });

  test('a page without a stamp whose body matches the source is current — frontmatter is not compared', async () => {
    // The nine pages on jimstest: synced before the stamp existed, differing only by `created`.
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('same body'), 'utf8');
    await fs.writeFile(path.join(dirs.pagesDir, `${UUID}.md`), page('same body', "created: '2026-09-15T11:41:04.559Z'\neditor: system\n"), 'utf8');
    const { routes, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    expect(await listed(routes)).toMatchObject({ status: 'current', userModified: false, syncState: 'same-as-shipped' });
  });

  test('a page without a stamp whose body differs is Edited here, not confirmed, and sync leaves it (R7)', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
    await fs.writeFile(path.join(dirs.pagesDir, `${UUID}.md`), page('old body'), 'utf8');
    const { routes, savePage, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    expect(await listed(routes)).toMatchObject({ status: 'modified', userModified: true, syncState: 'edited-not-confirmed' });

    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), createMockRes());
    expect(savePage).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(dirs.pagesDir, `${UUID}.md`), 'utf8')).toContain('old body');
  });

  test('a page saved with only its title changed (user-modified, text unchanged) is Edited here, not confirmed (Q1)', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('same body'), 'utf8');
    await fs.writeFile(
      path.join(dirs.pagesDir, `${UUID}.md`),
      `---\ntitle: My own title\nuuid: ${UUID}\nslug: footnoteexample\nuser-modified: true\n${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('same body')}\n---\nsame body\n`,
      'utf8'
    );
    const { routes, savePage, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    expect(await listed(routes)).toMatchObject({ syncState: 'edited-not-confirmed', userModified: true });

    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), createMockRes());
    expect(savePage).not.toHaveBeenCalled();
  });

  test('edited here and a newer version shipped reads Both changed, and sync leaves it', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('shipped v2'), 'utf8');
    await fs.writeFile(
      path.join(dirs.pagesDir, `${UUID}.md`),
      page('edited here', `${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('shipped v1')}\n`),
      'utf8'
    );
    const { routes, savePage, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    expect(await listed(routes)).toMatchObject({ syncState: 'both-changed' });

    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), createMockRes());
    expect(savePage).not.toHaveBeenCalled();
  });

  test('a stamped page edited since its sync, with a newer shipped version, is Both changed, and sync skips it', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new source body'), 'utf8');
    await fs.writeFile(
      path.join(dirs.pagesDir, `${UUID}.md`),
      page('locally edited body', `${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('synced body')}\n`),
      'utf8'
    );
    const { routes, savePage, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    expect(await listed(routes)).toMatchObject({ status: 'modified', userModified: true, syncState: 'both-changed' });

    const res = createMockRes();
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), res);
    expect(savePage).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('a stamped page untouched since its sync is outdated when the source changes, and sync saves it', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new source body'), 'utf8');
    await fs.writeFile(
      path.join(dirs.pagesDir, `${UUID}.md`),
      page('synced body', `${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('synced body')}\n`),
      'utf8'
    );
    const { routes, savePage, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    expect(await listed(routes)).toMatchObject({ status: 'modified', userModified: false, syncState: 'update-ready' });

    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), createMockRes());
    expect(savePage).toHaveBeenCalledTimes(1);
  });

  test('the sync stamps the saved page with the hash of the source body', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
    const { routes, savePage, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), createMockRes());

    const [, content, meta] = savePage.mock.calls[0];
    expect(meta[REQUIRED_SOURCE_HASH_KEY]).toBe(pageSourceHash(content));
    expect(meta).not.toHaveProperty('addon-source-hash');
  });

  describe('#1412 declining a shipped page', () => {
    const declineBody = (reason = "slug 'x' already exists under UUID other") =>
      ({ decline: [{ source: 'required-pages', uuid: UUID, reason }] });

    test('the route records the decline, and the seeder then skips the page', async () => {
      await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
      const { routes, pageManager, savePage } = await makeRoutes(dirs);

      const res = createMockRes();
      await routes.adminSyncRequiredPages(createMockReq(declineBody()), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, declined: [UUID] }));
      const record = await SeededShippedPages.load(dirs.instanceDir);
      expect(record.isDeclined('required-pages', UUID)).toBe(true);
      expect(record.declinedEntry('required-pages', UUID)).toMatchObject({ by: 'admin' });

      savePage.mockClear();
      const report = await pageManager.seedShippedPages(pageManager.requiredPagesSource(), { origin: 'test', user: 'system' });
      expect(report.declined).toEqual(['FootnoteExample']);
      expect(savePage).not.toHaveBeenCalled();
    });

    test('allow undoes it', async () => {
      await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
      const { routes } = await makeRoutes(dirs);
      await routes.adminSyncRequiredPages(createMockReq(declineBody()), createMockRes());

      const res = createMockRes();
      await routes.adminSyncRequiredPages(createMockReq({ allow: [{ source: 'required-pages', uuid: UUID }] }), res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ allowed: [UUID] }));
      expect((await SeededShippedPages.load(dirs.instanceDir)).isDeclined('required-pages', UUID)).toBe(false);
    });

    test('an explicit Sync of a declined page overrides the decline', async () => {
      await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
      const { routes } = await makeRoutes(dirs);
      await routes.adminSyncRequiredPages(createMockReq(declineBody()), createMockRes());

      await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), createMockRes());

      expect((await SeededShippedPages.load(dirs.instanceDir)).isDeclined('required-pages', UUID)).toBe(false);
      expect(await fs.readFile(path.join(dirs.pagesDir, `${UUID}.md`), 'utf8')).toContain('new body');
    });

    test('the list shows what this site declined, with its source', async () => {
      await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
      const { routes } = await makeRoutes(dirs);
      await routes.adminSyncRequiredPages(createMockReq(declineBody('slug taken')), createMockRes());

      const res = createMockRes();
      await routes.adminRequiredPages(createMockReq(), res);

      const data = res.render.mock.calls[0][1] as { declined: Array<{ source: string; uuid: string; title: string; reason: string }> };
      expect(data.declined).toEqual([expect.objectContaining({ source: 'required-pages', uuid: UUID, title: 'FootnoteExample', reason: 'slug taken' })]);
    });
  });

  test('push to source does not copy the stamp into the source file', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('old source body'), 'utf8');
    await fs.writeFile(
      path.join(dirs.pagesDir, `${UUID}.md`),
      page('edited body', `${REQUIRED_SOURCE_HASH_KEY}: abc\nuser-modified: true\n`),
      'utf8'
    );
    const { routes, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    await routes.adminSyncRequiredPages(createMockReq({ pushToSource: [UUID] }), createMockRes());

    const source = await fs.readFile(path.join(dirs.requiredDir, `${UUID}.md`), 'utf8');
    expect(source).toContain('edited body');
    expect(source).not.toContain(REQUIRED_SOURCE_HASH_KEY);
  });
});

/**
 * #1871: "Sync All Outdated (N)" counted user-edited pages the bulk sync skips,
 * so a site whose only outdated page was user-edited showed "(1)" and the click
 * answered "No pages to sync." The route marks each row in or out of the bulk
 * sync and counts from that same flag; the view renders both from it. These
 * render the real template (header and footer stubbed) from the route's data.
 */
describe('#1871 Sync All Outdated counts only the pages it will sync', () => {
  const OTHER = '0c7a1b2e-5d4f-4e6a-9b8c-1d2e3f4a5b6c';
  const otherPage = (body: string, extra = '') =>
    `---\ntitle: OtherExample\nuuid: ${OTHER}\nslug: otherexample\n${extra}---\n${body}\n`;
  const includer = (original: string): { template: string } | undefined =>
    original === 'header' || original === 'footer' ? { template: '<!-- stub -->' } : undefined;

  let dirs: Awaited<ReturnType<typeof makeDirs>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    dirs = await makeDirs();
  });

  afterEach(async () => {
    // Scoped to the mkdtemp directory created above — never a project path.
    await fs.rm(dirs.root, { recursive: true, force: true });
  });

  /** A user-edited outdated page: stamped at sync, body edited since. */
  async function writeUserEdited() {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new source body'), 'utf8');
    await fs.writeFile(
      path.join(dirs.pagesDir, `${UUID}.md`),
      page('locally edited body', `${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('synced body')}\n`),
      'utf8'
    );
  }

  async function renderList() {
    const { routes, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);
    const res = createMockRes();
    await routes.adminRequiredPages(createMockReq(), res);
    const data = res.render.mock.calls[0][1] as Record<string, unknown> & {
      counts: { new: number; modified: number; outdatedSyncable: number; outdatedUserEdited: number };
    };
    const html = await ejs.renderFile(path.join(VIEWS, 'admin-required-pages.ejs'), { ...data, locals: {} }, { includer });
    return { data, doc: new JSDOM(html).window.document };
  }

  test('only an edited page differs: Sync All (0) is disabled and the summary says a decision is needed', async () => {
    await writeUserEdited();
    const { data, doc } = await renderList();

    expect(data.counts).toMatchObject({ modified: 1, outdatedSyncable: 0, outdatedUserEdited: 1 });
    const button = doc.querySelector('[data-testid="sync-all-outdated"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    // Nothing is ready, so the label carries no "(0)".
    expect(button.textContent?.replace(/\s+/g, ' ').trim()).toBe('Sync All');
    // R5 (#2414): the table's own header says one page needs a decision and nothing is ready;
    // the line at the top of the page says how to act and carries no number.
    const tableLine = doc.querySelector('[data-testid="core-sync-summary"]')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(tableLine).toBe('1 needs a decision; Sync All has nothing to update');
    expect(tableLine).not.toContain('(0)');
    const summary = doc.querySelector('[data-testid="sync-summary"]')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(summary).toContain('To act on an edited page, open Diff, then Use shipped version.');
    expect(summary).not.toMatch(/\d/);
    // The count badges name the two kinds apart.
    const badge = (name: string) => doc.querySelector(`[data-testid="count-${name}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
    expect(badge('update-ready')).toBe('0 Update ready');
    expect(badge('edited-here')).toBe('1 Edited here');
    expect(doc.body.textContent).not.toContain('Not same as shipped');
    // What the button's sync would select: nothing.
    expect(doc.querySelectorAll('#pagesTable tr[data-bulk-outdated="true"]')).toHaveLength(0);
    // #1918: the row reads and syncs through the shared partials; Force Sync asks first.
    const row = doc.querySelector(`#pagesTable tr[data-uuid="${UUID}"]`) as HTMLElement;
    expect([...row.querySelectorAll('[data-sync-status]')].map((el) => el.getAttribute('data-sync-status'))).toEqual(['both-changed']);
    const force = row.querySelector('[data-action="force-sync"]') as HTMLButtonElement;
    expect(force.dataset.syncId).toBe(UUID);
    expect(force.textContent?.trim()).toBe('Use shipped version');
    expect(force.dataset.confirm).toContain('Your version stays in the page history.');
  });

  test('a user-edited and a plain outdated page: the count is the one it will sync', async () => {
    await writeUserEdited();
    await fs.writeFile(path.join(dirs.requiredDir, `${OTHER}.md`), otherPage('new body'), 'utf8');
    await fs.writeFile(path.join(dirs.pagesDir, `${OTHER}.md`), otherPage('old body', `${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('old body')}\n`), 'utf8');
    const { data, doc } = await renderList();

    expect(data.counts).toMatchObject({ modified: 2, outdatedSyncable: 1, outdatedUserEdited: 1 });
    const button = doc.querySelector('[data-testid="sync-all-outdated"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Sync All (1)');
    expect(doc.querySelector('[data-testid="core-sync-summary"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('1 needs a decision; Sync All updates 1');
    const summary = doc.querySelector('[data-testid="sync-summary"]')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(summary).not.toMatch(/\d/);
    const badge = (name: string) => doc.querySelector(`[data-testid="count-${name}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
    expect(badge('update-ready')).toBe('1 Update ready');
    expect(badge('edited-here')).toBe('1 Edited here');
    const selected = [...doc.querySelectorAll('#pagesTable tr[data-bulk-outdated="true"]')]
      .map((row) => row.getAttribute('data-uuid'));
    expect(selected).toEqual([OTHER]);
  });

  test('the page says an unreadable header also shows as Update ready, and updating repairs it — in view, not in the collapsed list', async () => {
    await writeUserEdited();
    const { doc } = await renderList();
    const sentence = "A page whose header can't be read also shows as Update ready; updating it repairs it.";
    expect(doc.querySelector('#updateProtectionInfo')?.textContent?.replace(/\s+/g, ' ')).not.toContain(sentence);
    expect(doc.querySelector('[data-testid="sync-summary"]')?.textContent?.replace(/\s+/g, ' ')).toContain(sentence);
  });

  test('Sync All says how many edited pages it left alone', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new source body'), 'utf8');
    await fs.writeFile(
      path.join(dirs.pagesDir, `${UUID}.md`),
      page('synced body', `${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('synced body')}\n`),
      'utf8'
    );
    const { routes, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    const res = createMockRes();
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID], leftAlone: [OTHER, '11111111-2222-4333-8444-555555555555'] }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, message: '1 page synced; 2 edited pages left alone' }));

    const one = createMockRes();
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID], leftAlone: [OTHER] }), one);
    expect(one.json.mock.calls[0][0].message).toContain('1 edited page left alone');
    const none = createMockRes();
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), none);
    expect(none.json.mock.calls[0][0].message).not.toContain('left alone');
  });

  test('the add-on rows use the same rule: only Update ready is taken, New keeps its own button', () => {
    const rows = [
      { status: 'modified', userModified: true, syncState: 'edited-not-confirmed' },
      { status: 'new', userModified: false },
      { status: 'current', userModified: false, syncState: 'same-as-shipped' },
      { status: 'modified', userModified: false, syncState: 'update-ready' },
      { status: 'modified', userModified: true, syncState: 'both-changed' },
      { status: 'uuid-mismatch', userModified: false }
    ] as Array<{ status: string; userModified: boolean; syncState?: string; bulkOutdated?: boolean }>;
    expect(WikiRoutes.markBulkOutdated(rows)).toEqual({ outdatedSyncable: 1, outdatedUserEdited: 2 });
    expect(rows.map((r) => r.bulkOutdated)).toEqual([false, false, false, true, false, false]);
  });
});
