/**
 * Required Pages Sync must invalidate what it rewrites — issue #1040.
 *
 * The sync used to write page files straight to disk with `fse.writeFile`,
 * which invalidated nothing. Since #1376 it saves through `PageManager.savePage`
 * with `skipValidation` (shipped content skips the #1037 content gate), and the
 * route still evicts every page it touched.
 *
 * The endpoint returned `"N pages synced"` while every reader kept getting the
 * pre-sync render until the next restart, with nothing in the UI to suggest one
 * was needed. It surfaced on the demo: the file on disk was correct and the
 * page still showed the old content.
 *
 * `refreshPageList()` was already called and is NOT sufficient — it rebuilds the
 * page list, not the per-page content cache or the rendered-pages region.
 */

// #1406: the route delegates saving to PageManager's shared seeder. A real
// PageManager over the real FileSystemProvider does the writes here, so these
// tests exercise what reaches disk rather than a stand-in.
vi.unmock('../../managers/PageManager');
vi.unmock('../../providers/FileSystemProvider');

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import WikiRoutes from '../WikiRoutes';
import PageManager from '../../managers/PageManager';

const UUID = 'b780e809-d45b-4c4b-84ec-ad30a74a3605';
const OTHER_UUID = 'c0ffee00-1111-2222-3333-444444444444';

const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

const createMockReq = (body: unknown) => ({
  params: {},
  query: {},
  body,
  session: { csrfToken: 'tok' },
  path: '/admin/required-pages/sync',
  originalUrl: '/admin/required-pages/sync',
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

const page = (body: string, extra = '', title = 'Using Current Time Plugin', uuid = UUID) =>
  `---\ntitle: ${title}\nuuid: ${uuid}\nslug: ${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}\n${extra}---\n${body}\n`;

/**
 * Real directories — the handler does genuine filesystem work, and stubbing
 * fse would test the stub rather than the write-then-invalidate ordering that
 * is the entire point of this issue.
 *
 * mkdtemp keeps teardown scoped to a directory this test created. Cleanup must
 * never be able to reach a live `data/` tree.
 */
async function makeDirs() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-sync-'));
  const requiredDir = path.join(root, 'required-pages');
  const pagesDir = path.join(root, 'pages');
  const instanceDir = path.join(root, 'instance');
  await fs.mkdir(requiredDir);
  await fs.mkdir(pagesDir);
  await fs.mkdir(instanceDir);
  return { root, requiredDir, pagesDir, instanceDir };
}

async function makeRoutes(dirs: { requiredDir: string; pagesDir: string; instanceDir: string }, overrides: {
  invalidatePageCache?: (id: string) => void;
} = {}) {
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
  const rebuildIndex = vi.fn().mockResolvedValue(undefined);
  const holder: { pageManager?: PageManager } = {};
  const engine = {
    getManager: vi.fn((name: string) => {
      // #1431 step 14: decisions are the PDP's.
      if (name === 'PolicyDecisionPoint') return { permits: vi.fn().mockResolvedValue(true) };
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'PageManager') return holder.pageManager;
      if (name === 'SearchManager') return { rebuildIndex };
      return null;
    })
  };
  const pageManager = new PageManager(engine);
  holder.pageManager = pageManager;
  await pageManager.initialize();

  const order: string[] = [];
  const savePage = vi.spyOn(pageManager, 'savePage');
  savePage.mockImplementation(async function (this: PageManager, ...args: Parameters<PageManager['savePage']>) {
    order.push(`save ${String((args[2] as Record<string, unknown>).uuid)}`);
    return PageManager.prototype.savePage.apply(pageManager, args);
  });
  const invalidatePageCache = vi.spyOn(pageManager, 'invalidatePageCache');
  if (overrides.invalidatePageCache) invalidatePageCache.mockImplementation(overrides.invalidatePageCache);
  const refreshPageList = vi.spyOn(pageManager, 'refreshPageList');
  // #1462 slice 3: one delete door — spied here for its order among the writes.
  const deletePage = vi.spyOn(pageManager, 'deletePage');
  deletePage.mockImplementation(async function (this: PageManager, ...args: Parameters<PageManager['deletePage']>) {
    order.push(`delete ${args[0]}`);
    return PageManager.prototype.deletePage.apply(pageManager, args);
  });

  const routes = new WikiRoutes(engine) as unknown as {
    adminSyncRequiredPages(req: unknown, res: unknown): Promise<void>;
  };
  return { routes, pageManager, invalidatePageCache, refreshPageList, savePage, deletePage, order };
}

/** The identifiers passed to invalidatePageCache, in call order. */
const evicted = (spy: ReturnType<typeof vi.fn>): string[] =>
  spy.mock.calls.map((c) => c[0] as string);

describe('Required Pages Sync invalidates the caches it invalidates nothing of (#1040)', () => {
  let dirs: Awaited<ReturnType<typeof makeDirs>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    dirs = await makeDirs();
  });

  afterEach(async () => {
    // Scoped to the mkdtemp directory created above — never a project path.
    await fs.rm(dirs.root, { recursive: true, force: true });
  });

  test('a synced page is evicted from the cache', async () => {
    // THE regression. Without this the write lands and readers keep the old
    // render until a restart.
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
    await fs.writeFile(path.join(dirs.pagesDir, `${UUID}.md`), page('old body'), 'utf8');

    const { routes, invalidatePageCache } = await makeRoutes(dirs);
    const res = createMockRes();
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), res);

    expect(evicted(invalidatePageCache)).toContain(UUID);
  });

  test('the new content really is on disk — eviction is not covering for a failed write', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
    await fs.writeFile(path.join(dirs.pagesDir, `${UUID}.md`), page('old body'), 'utf8');

    const { routes } = await makeRoutes(dirs);
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), createMockRes());

    const live = await fs.readFile(path.join(dirs.pagesDir, `${UUID}.md`), 'utf8');
    expect(live).toContain('new body');
    expect(live).not.toContain('old body');
  });

  test('a page skipped as user-modified is NOT evicted', async () => {
    // Nothing was rewritten, so evicting would throw away a valid cache entry
    // for no reason. Also pins that eviction follows the write rather than the
    // request list.
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
    await fs.writeFile(
      path.join(dirs.pagesDir, `${UUID}.md`),
      page('hand-edited body', 'user-modified: true\n'),
      'utf8'
    );

    const { routes, invalidatePageCache } = await makeRoutes(dirs);
    const res = createMockRes();
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), res);

    expect(evicted(invalidatePageCache)).not.toContain(UUID);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ protected: [UUID] }));
  });

  test('every synced page is evicted, not just the first', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
    await fs.writeFile(path.join(dirs.requiredDir, `${OTHER_UUID}.md`), page('new body', '', 'Another Plugin', OTHER_UUID), 'utf8');

    const { routes, invalidatePageCache } = await makeRoutes(dirs);
    await routes.adminSyncRequiredPages(
      createMockReq({ uuids: [UUID, OTHER_UUID] }),
      createMockRes()
    );

    expect(evicted(invalidatePageCache).sort()).toEqual([UUID, OTHER_UUID].sort());
  });

  test('eviction runs after refreshPageList, so the page is resolvable', async () => {
    // invalidatePageCache resolves the identifier through the provider. Evicting
    // before the list is rebuilt can leave a just-written page unresolvable.
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');

    const order: string[] = [];
    const { routes } = await makeRoutes(dirs);
    const pm = (routes as unknown as { engine: { getManager(n: string): unknown } });
    const manager = pm.engine.getManager('PageManager') as {
      refreshPageList: ReturnType<typeof vi.fn>;
      invalidatePageCache: ReturnType<typeof vi.fn>;
    };
    manager.refreshPageList.mockImplementation(async () => { order.push('refresh'); });
    manager.invalidatePageCache.mockImplementation(() => { order.push('evict'); });

    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), createMockRes());

    expect(order).toEqual(['refresh', 'evict']);
  });

  test('a failing eviction does not fail a sync that already wrote to disk', async () => {
    // Best-effort by design: the file is written by the time we get here, so
    // reporting failure would be a lie in the other direction.
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');

    const { routes } = await makeRoutes(dirs, {
      invalidatePageCache: () => { throw new Error('cache exploded'); }
    });
    const res = createMockRes();
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('the sync saves through PageManager with skipValidation, as a version by system (#1376)', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body', 'user-modified: true\n'), 'utf8');

    const { routes, savePage } = await makeRoutes(dirs);
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID], force: true }), createMockRes());

    expect(savePage).toHaveBeenCalledTimes(1);
    const [name, content, meta, ctx, options] = savePage.mock.calls[0];
    expect(name).toBe('Using Current Time Plugin');
    expect(content).toContain('new body');
    expect(meta).toMatchObject({ uuid: UUID, title: 'Using Current Time Plugin', editor: 'system' });
    expect(meta).not.toHaveProperty('user-modified');
    // #1179: the sync acts as the admin who asked for it.
    expect(ctx).toMatchObject({ username: expect.any(String) });
    expect(options).toEqual({ skipValidation: true });
  });

  test('a page renamed at the source is saved under its live title, as a rename (#1376)', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');

    const { routes, pageManager, savePage } = await makeRoutes(dirs);
    // The site's page has the same uuid under its old title.
    await pageManager.savePage('Current Time Plugin (old name)', 'old body', { uuid: UUID }, { origin: 'test', user: 'admin' });
    savePage.mockClear();

    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID], force: true }), createMockRes());

    const [name, , meta] = savePage.mock.calls[0];
    expect(name).toBe('Current Time Plugin (old name)');
    expect(meta.title).toBe('Using Current Time Plugin');
  });

  test('reconcile deletes the old-UUID page through PageManager before saving the canonical one (#1376)', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('canonical body'), 'utf8');

    const { routes, pageManager, order, deletePage } = await makeRoutes(dirs);
    // The site holds the same page under the old uuid.
    await pageManager.savePage('Using Current Time Plugin', 'old body', { uuid: OTHER_UUID }, { origin: 'test', user: 'admin' });
    order.length = 0;
    await routes.adminSyncRequiredPages(createMockReq({ reconcile: [{ sourceUuid: UUID, liveUuid: OTHER_UUID }] }), createMockRes());

    expect(deletePage).toHaveBeenCalledWith(OTHER_UUID, expect.objectContaining({ username: 'admin' }));
    expect(order).toEqual([`delete ${OTHER_UUID}`, `save ${UUID}`]);
  });
});
