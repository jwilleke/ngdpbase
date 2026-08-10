/**
 * Required Pages Sync must invalidate what it rewrites — issue #1040.
 *
 * The sync writes page files straight to disk with `fse.writeFile` rather than
 * going through `PageManager.savePage`. That bypass is deliberate: seeding must
 * not run the save-time content gate (`PageManager.ts:35`, kept that way by
 * #1037). But `savePage` is also what invalidates the caches, so nothing did.
 *
 * The endpoint returned `"N pages synced"` while every reader kept getting the
 * pre-sync render until the next restart, with nothing in the UI to suggest one
 * was needed. It surfaced on the demo: the file on disk was correct and the
 * page still showed the old content.
 *
 * `refreshPageList()` was already called and is NOT sufficient — it rebuilds the
 * page list, not the per-page content cache or the rendered-pages region.
 */

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import WikiRoutes from '../WikiRoutes';

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

const page = (body: string, extra = '') =>
  `---\ntitle: Using Current Time Plugin\nuuid: ${UUID}\nslug: using-current-time-plugin\n${extra}---\n${body}\n`;

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
  await fs.mkdir(requiredDir);
  await fs.mkdir(pagesDir);
  return { root, requiredDir, pagesDir };
}

function makeRoutes(dirs: { requiredDir: string; pagesDir: string }, overrides: {
  invalidatePageCache?: (id: string) => void;
} = {}) {
  const invalidatePageCache = vi.fn(overrides.invalidatePageCache ?? (() => {}));
  const refreshPageList = vi.fn().mockResolvedValue(undefined);
  const rebuildIndex = vi.fn().mockResolvedValue(undefined);

  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'UserManager') {
        return { hasPermission: vi.fn().mockResolvedValue(true) };
      }
      if (name === 'ConfigurationManager') {
        return {
          getProperty: vi.fn((key: string, def: unknown) =>
            key === 'ngdpbase.page.provider.filesystem.requiredpagesdir' ? dirs.requiredDir : def
          ),
          getResolvedDataPath: vi.fn(() => dirs.pagesDir)
        };
      }
      if (name === 'PageManager') {
        return { refreshPageList, invalidatePageCache, provider: {} };
      }
      if (name === 'SearchManager') return { rebuildIndex };
      if (name === 'AddonsManager') return null;
      return null;
    })
  };

  const routes = new WikiRoutes(engine) as unknown as {
    adminSyncRequiredPages(req: unknown, res: unknown): Promise<void>;
  };
  return { routes, invalidatePageCache, refreshPageList };
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

    const { routes, invalidatePageCache } = makeRoutes(dirs);
    const res = createMockRes();
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), res);

    expect(evicted(invalidatePageCache)).toContain(UUID);
  });

  test('the new content really is on disk — eviction is not covering for a failed write', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), page('new body'), 'utf8');
    await fs.writeFile(path.join(dirs.pagesDir, `${UUID}.md`), page('old body'), 'utf8');

    const { routes } = makeRoutes(dirs);
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

    const { routes, invalidatePageCache } = makeRoutes(dirs);
    const res = createMockRes();
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), res);

    expect(evicted(invalidatePageCache)).not.toContain(UUID);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ protected: [UUID] }));
  });

  test('every synced page is evicted, not just the first', async () => {
    for (const u of [UUID, OTHER_UUID]) {
      await fs.writeFile(path.join(dirs.requiredDir, `${u}.md`), page('new body'), 'utf8');
    }

    const { routes, invalidatePageCache } = makeRoutes(dirs);
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
    const { routes } = makeRoutes(dirs);
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

    const { routes } = makeRoutes(dirs, {
      invalidatePageCache: () => { throw new Error('cache exploded'); }
    });
    const res = createMockRes();
    await routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
