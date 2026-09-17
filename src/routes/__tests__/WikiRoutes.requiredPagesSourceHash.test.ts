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
import WikiRoutes from '../WikiRoutes';
import PageManager from '../../managers/PageManager';
import { pageSourceHash, REQUIRED_SOURCE_HASH_KEY } from '../../utils/addonPageSync';

const UUID = 'b780e809-d45b-4c4b-84ec-ad30a74a3605';

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

async function makeRoutes(dirs: { requiredDir: string; pagesDir: string; instanceDir: string }) {
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
    getManager: vi.fn((name: string) => {
      if (name === 'UserManager') return { hasPermission: vi.fn().mockResolvedValue(true) };
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'ValidationManager') {
        return { checkConflicts: vi.fn().mockResolvedValue({ hasConflict: false }), getCategoryStorageLocation: () => 'regular' };
      }
      if (name === 'PageManager') return holder.pageManager;
      if (name === 'SearchManager') return { rebuildIndex: vi.fn().mockResolvedValue(undefined) };
      return null;
    })
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
  const data = res.render.mock.calls[0][1] as { comparison: Array<{ uuid: string; status: string; userModified: boolean }> };
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
    await fs.writeFile(path.join(dirs.pagesDir, `${UUID}.md`), page('old body'), 'utf8');
    const { routes, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);
    expect((await listed(routes))?.status).toBe('modified');

    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), createMockRes());

    const live = await fs.readFile(path.join(dirs.pagesDir, `${UUID}.md`), 'utf8');
    expect(live).toContain('created:');
    expect((await listed(routes))?.status).toBe('current');
  });

  test('a page without a stamp whose body matches the source is current — frontmatter is not compared', async () => {
    // The nine pages on jimstest: synced before the stamp existed, differing only by `created`.
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('same body'), 'utf8');
    await fs.writeFile(path.join(dirs.pagesDir, `${UUID}.md`), page('same body', "created: '2026-09-15T11:41:04.559Z'\neditor: system\n"), 'utf8');
    const { routes, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    expect(await listed(routes)).toMatchObject({ status: 'current', userModified: false });
  });

  test('a page without a stamp whose body differs is outdated, not an edit', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
    await fs.writeFile(path.join(dirs.pagesDir, `${UUID}.md`), page('old body'), 'utf8');
    const { routes, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    expect(await listed(routes)).toMatchObject({ status: 'modified', userModified: false });
  });

  test('a stamped page edited since its sync is flagged as modified by a user, and sync skips it', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new source body'), 'utf8');
    await fs.writeFile(
      path.join(dirs.pagesDir, `${UUID}.md`),
      page('locally edited body', `${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('synced body')}\n`),
      'utf8'
    );
    const { routes, savePage, pageManager } = await makeRoutes(dirs);
    await reload(pageManager);

    expect(await listed(routes)).toMatchObject({ status: 'modified', userModified: true });

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

    expect(await listed(routes)).toMatchObject({ status: 'modified', userModified: false });

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
