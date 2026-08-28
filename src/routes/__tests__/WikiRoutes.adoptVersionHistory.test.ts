/**
 * Adopt-UUID must carry a page's version history with it — issue #1107.
 *
 * `adminSyncRequiredPages`' adopt step re-points a live page onto its
 * required-pages source UUID: it rewrites `uuid:` in the frontmatter, writes
 * `{sourceUuid}.md`, removes `{liveUuid}.md`, and renames the page-index entry.
 * It never touched `versions/{liveUuid}/`.
 *
 * Version history is stored per-UUID, so the tree kept the old UUID while the
 * page answered to a new one — and `renamePageInIndex` copies the entry
 * wholesale, so `currentVersion` and `hasVersions` carried across describing a
 * tree that was not there. The index asserted history that could not be found,
 * with no tombstone and no log line for the destructive step.
 */

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import WikiRoutes from '../WikiRoutes';

const LIVE_UUID = '043c26b8-2161-4d7a-bac6-7b60edb6afc2';
const SOURCE_UUID = '51d6f3a1-ca69-4284-972a-8dd2b2fd0bb2';

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

/** Real directories — stubbing fse would test the stub, not the move. */
async function makeDirs() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-adopt-'));
  const requiredDir = path.join(root, 'required-pages');
  const pagesDir = path.join(root, 'pages');
  await fs.mkdir(requiredDir);
  await fs.mkdir(pagesDir);
  return { root, requiredDir, pagesDir };
}

async function writeVersionTree(pagesDir: string, uuid: string, pageName: string, count = 2) {
  const dir = path.join(pagesDir, 'versions', uuid);
  await fs.mkdir(path.join(dir, 'v1'), { recursive: true });
  await fs.writeFile(path.join(dir, 'v1', 'content.md'), `# ${pageName} v1\n`, 'utf8');
  if (count > 1) {
    await fs.mkdir(path.join(dir, 'v2'), { recursive: true });
    await fs.writeFile(path.join(dir, 'v2', 'content.diff'), 'diff-body', 'utf8');
  }
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ pageId: uuid, pageName, currentVersion: count, versions: [] }),
    'utf8'
  );
  return dir;
}

function makeRoutes(dirs: { requiredDir: string; pagesDir: string }) {
  const renamePageInIndex = vi.fn().mockResolvedValue(undefined);
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'UserManager') return { hasPermission: vi.fn().mockResolvedValue(true) };
      if (name === 'ConfigurationManager') {
        return {
          getProperty: vi.fn((key: string, def: unknown) =>
            key === 'ngdpbase.page.provider.filesystem.requiredpagesdir' ? dirs.requiredDir : def
          ),
          getResolvedDataPath: vi.fn(() => dirs.pagesDir)
        };
      }
      if (name === 'PageManager') {
        return {
          refreshPageList: vi.fn().mockResolvedValue(undefined),
          invalidatePageCache: vi.fn(),
          provider: { renamePageInIndex }
        };
      }
      if (name === 'SearchManager') return { rebuildIndex: vi.fn().mockResolvedValue(undefined) };
      return null;
    })
  };
  const routes = new WikiRoutes(engine) as unknown as {
    adminSyncRequiredPages(req: unknown, res: unknown): Promise<void>;
  };
  return { routes, renamePageInIndex };
}

const exists = async (p: string) => !!(await fs.stat(p).catch(() => null));

describe('#1107 adopt-UUID carries version history', () => {
  let dirs: Awaited<ReturnType<typeof makeDirs>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    dirs = await makeDirs();
    await fs.writeFile(
      path.join(dirs.pagesDir, `${LIVE_UUID}.md`),
      `---\ntitle: InterWikiLinks\nuuid: ${LIVE_UUID}\nslug: interwikilinks\n---\nbody\n`,
      'utf8'
    );
  });

  afterEach(async () => {
    // Scoped to the mkdtemp directory created above — never a project path.
    await fs.rm(dirs.root, { recursive: true, force: true });
  });

  const adopt = async () => {
    const { routes, renamePageInIndex } = makeRoutes(dirs);
    const res = createMockRes();
    await routes.adminSyncRequiredPages(
      createMockReq({ adoptUuid: [{ sourceUuid: SOURCE_UUID, liveUuid: LIVE_UUID }] }),
      res
    );
    return { res, renamePageInIndex };
  };

  test('the version tree moves to the adopted UUID', async () => {
    await writeVersionTree(dirs.pagesDir, LIVE_UUID, 'InterWikiLinks');
    await adopt();

    const moved = path.join(dirs.pagesDir, 'versions', SOURCE_UUID);
    expect(await exists(path.join(moved, 'v1', 'content.md'))).toBe(true);
    expect(await exists(path.join(moved, 'v2', 'content.diff'))).toBe(true);
    expect(await exists(path.join(dirs.pagesDir, 'versions', LIVE_UUID))).toBe(false);
  });

  test('the manifest pageId is rewritten to the adopted UUID', async () => {
    await writeVersionTree(dirs.pagesDir, LIVE_UUID, 'InterWikiLinks');
    await adopt();

    const manifest = JSON.parse(
      await fs.readFile(path.join(dirs.pagesDir, 'versions', SOURCE_UUID, 'manifest.json'), 'utf8')
    );
    expect(manifest.pageId).toBe(SOURCE_UUID);
    expect(manifest.currentVersion).toBe(2);
  });

  test('a page with no version history still adopts cleanly', async () => {
    const { res } = await adopt();
    expect(await exists(path.join(dirs.pagesDir, `${SOURCE_UUID}.md`))).toBe(true);
    expect(res.json).toHaveBeenCalled();
  });

  test('an existing tree at the destination is never overwritten', async () => {
    // Two histories cannot be interleaved without inventing an order, so the
    // adopt must leave both alone rather than merge or clobber.
    await writeVersionTree(dirs.pagesDir, LIVE_UUID, 'Live Page');
    await writeVersionTree(dirs.pagesDir, SOURCE_UUID, 'Source Page');
    await adopt();

    const destManifest = JSON.parse(
      await fs.readFile(path.join(dirs.pagesDir, 'versions', SOURCE_UUID, 'manifest.json'), 'utf8')
    );
    expect(destManifest.pageName).toBe('Source Page');
    expect(await exists(path.join(dirs.pagesDir, 'versions', LIVE_UUID, 'manifest.json'))).toBe(true);
  });

  test('the index entry is still re-pointed', async () => {
    await writeVersionTree(dirs.pagesDir, LIVE_UUID, 'InterWikiLinks');
    const { renamePageInIndex } = await adopt();
    expect(renamePageInIndex).toHaveBeenCalledWith(LIVE_UUID, SOURCE_UUID);
  });
});
