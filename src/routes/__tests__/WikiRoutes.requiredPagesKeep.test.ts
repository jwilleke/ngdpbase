/**
 * #2389 slice 2: POST /admin/required-pages/keep, the Keep edited version
 * action, and what the list reads from the kept mark.
 *
 * A real PageManager over the real FileSystemProvider, so what reaches disk is
 * what a site gets.
 */
vi.unmock('../../managers/PageManager');
vi.unmock('../../providers/FileSystemProvider');

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import matter from 'gray-matter';
import WikiRoutes from '../WikiRoutes';
import PageManager from '../../managers/PageManager';
import { pageSourceHash, REQUIRED_SOURCE_HASH_KEY } from '../../utils/addonPageSync';
import { ALLOWING_PIP, ALLOWING_PDP } from '../../__tests__/__fixtures__/pageWriteDoor';

const UUID = 'b780e809-d45b-4c4b-84ec-ad30a74a3605';
const ADDON_UUID = 'c0ffee00-1111-2222-3333-444444444444';

const createMockReq = (body: unknown) => ({
  params: {},
  query: {},
  body,
  session: { csrfToken: 'tok' },
  path: '/admin/required-pages/keep',
  originalUrl: '/admin/required-pages/keep',
  protocol: 'http',
  get: vi.fn().mockReturnValue('localhost:3000'),
  userContext: { username: 'admin', isAuthenticated: true, roles: ['admin'] }
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

const shipped = (body: string, uuid = UUID, title = 'Welcome') => matter.stringify(`${body}\n`, { title, uuid, slug: title.toLowerCase(), 'system-category': 'documentation' });
const live = (body: string, extra: Record<string, unknown>, uuid = UUID, title = 'Welcome') => matter.stringify(`${body}\n`, { title, uuid, slug: title.toLowerCase(), 'system-category': 'documentation', ...extra });

/** The page list reads the folder at start-up and on refresh; a file written after boot needs two refreshes, as in PageManager's own tests. */
async function refresh(c: { pageManager: PageManager }) {
  await c.pageManager.refreshPageList();
  await c.pageManager.refreshPageList();
}

async function setup(opts: { permit?: boolean } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-keep-'));
  const dirs = {
    root,
    requiredDir: path.join(root, 'required-pages'),
    addonDir: path.join(root, 'addon-pages'),
    pagesDir: path.join(root, 'pages'),
    instanceDir: path.join(root, 'instance')
  };
  await Promise.all([dirs.requiredDir, dirs.addonDir, dirs.pagesDir, dirs.instanceDir].map((d) => fs.mkdir(d)));

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
      if (name === 'PolicyDecisionPoint') return { ...ALLOWING_PDP, permits: vi.fn().mockResolvedValue(opts.permit !== false) };
      if (name === 'PolicyInformationPoint') return ALLOWING_PIP;
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'PageManager') return holder.pageManager;
      if (name === 'SearchManager') return { rebuildIndex: vi.fn().mockResolvedValue(undefined) };
      if (name === 'AddonsManager') return { getEnabledAddonPagesDirectories: () => [{ name: 'demo', pagesDir: dirs.addonDir }] };
      return null;
    })
  };
  holder.pageManager = new PageManager(engine);
  await holder.pageManager.initialize();
  const routes = new WikiRoutes(engine) as unknown as {
    adminKeepRequiredPage(req: unknown, res: unknown): Promise<void>;
    adminSyncRequiredPages(req: unknown, res: unknown): Promise<void>;
  };
  const read = async (uuid = UUID) => matter(await fs.readFile(path.join(dirs.pagesDir, `${uuid}.md`), 'utf8'));
  return { dirs, routes, read, pageManager: holder.pageManager };
}

describe('POST /admin/required-pages/keep (#2389 slice 2)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  afterEach(async () => {
    // Scoped to the mkdtemp directory made in setup(), never a project path.
    await fs.rm(ctx.dirs.root, { recursive: true, force: true });
  });

  const edited = async (c: typeof ctx) => {
    await fs.writeFile(path.join(c.dirs.requiredDir, `${UUID}.md`), shipped('Shipped v1.'), 'utf8');
    await fs.writeFile(path.join(c.dirs.pagesDir, `${UUID}.md`), live('Edited here.', { 'user-modified': true, [REQUIRED_SOURCE_HASH_KEY]: pageSourceHash('Shipped v1.') }), 'utf8');
    await refresh(c);
  };

  test('without admin-system it is refused with 403 and nothing is written', async () => {
    ctx = await setup({ permit: false });
    await edited(ctx);
    const res = createMockRes();
    await ctx.routes.adminKeepRequiredPage(createMockReq({ source: 'required-pages', uuid: UUID, keep: true }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Only a site administrator can do this; ask one to sign in.' });
    expect((await ctx.read()).data['kept-edited']).toBeUndefined();
  });

  test('keep: true writes the three keys and no body change', async () => {
    ctx = await setup();
    await edited(ctx);
    const res = createMockRes();
    await ctx.routes.adminKeepRequiredPage(createMockReq({ source: 'required-pages', uuid: UUID, keep: true }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, kept: true }));
    const page = await ctx.read();
    expect(page.content.trim()).toBe('Edited here.');
    expect(page.data).toMatchObject({ 'kept-edited': true, 'kept-shipped-hash': pageSourceHash('Shipped v1.'), 'kept-working-parts': ['setting:slug=welcome', 'setting:system-category=documentation'] });
  });

  test('keep: false removes them', async () => {
    ctx = await setup();
    await edited(ctx);
    await ctx.routes.adminKeepRequiredPage(createMockReq({ source: 'required-pages', uuid: UUID, keep: true }), createMockRes());
    const res = createMockRes();
    await ctx.routes.adminKeepRequiredPage(createMockReq({ source: 'required-pages', uuid: UUID, keep: false }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, kept: false }));
    expect((await ctx.read()).data['kept-edited']).toBeUndefined();
  });

  test('an add-on page is kept the same way, by its source name', async () => {
    ctx = await setup();
    await fs.writeFile(path.join(ctx.dirs.addonDir, 'welcome-addon.md'), shipped('Addon v1.', ADDON_UUID, 'Addon Welcome'), 'utf8');
    await fs.writeFile(path.join(ctx.dirs.pagesDir, `${ADDON_UUID}.md`), live('Edited addon.', { 'user-modified': true, 'addon-source-hash': pageSourceHash('Addon v1.') }, ADDON_UUID, 'Addon Welcome'), 'utf8');
    await refresh(ctx);
    const res = createMockRes();
    await ctx.routes.adminKeepRequiredPage(createMockReq({ source: 'addon:demo', uuid: ADDON_UUID, keep: true }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, kept: true }));
    expect((await ctx.read(ADDON_UUID)).data['kept-edited']).toBe(true);
  });

  test.each([
    ['an id that is not one path segment', { source: 'required-pages', uuid: '../x', keep: true }],
    ['a keep that is not a boolean', { source: 'required-pages', uuid: UUID, keep: 'yes' }],
    ['a source that is not a shipped one', { source: 'elsewhere', uuid: UUID, keep: true }],
    ['an add-on that is not enabled', { source: 'addon:ghost', uuid: UUID, keep: true }]
  ])('%s is a 400 and nothing is written', async (_name, body) => {
    ctx = await setup();
    await edited(ctx);
    const res = createMockRes();
    await ctx.routes.adminKeepRequiredPage(createMockReq(body), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect((await ctx.read()).data['kept-edited']).toBeUndefined();
  });

  test('a page the source does not ship is a 404 and nothing is written', async () => {
    ctx = await setup();
    await edited(ctx);
    const res = createMockRes();
    await ctx.routes.adminKeepRequiredPage(createMockReq({ source: 'required-pages', uuid: 'deadbeef-0000-0000-0000-000000000000', keep: true }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('the Sync All message for a kept page says it was edited or kept, not "use Push to Source"', async () => {
    ctx = await setup();
    await edited(ctx);
    await ctx.routes.adminKeepRequiredPage(createMockReq({ source: 'required-pages', uuid: UUID, keep: true }), createMockRes());
    const res = createMockRes();
    await ctx.routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), res);
    const message = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].message as string;
    expect(message).toBe('1 skipped (edited or kept on this site; open Review to decide)');
  });

  test('Sync All with a forged uuid list that names a kept page changes nothing for it', async () => {
    ctx = await setup();
    await edited(ctx);
    await ctx.routes.adminKeepRequiredPage(createMockReq({ source: 'required-pages', uuid: UUID, keep: true }), createMockRes());
    await fs.writeFile(path.join(ctx.dirs.requiredDir, `${UUID}.md`), shipped('Shipped v2.'), 'utf8');
    const res = createMockRes();
    await ctx.routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID] }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ protected: [UUID] }));
    expect((await ctx.read()).content.trim()).toBe('Edited here.');
  });
});

describe('what the list reads from the kept mark (#2389 slice 2)', () => {
  const stamped = { 'required-source-hash': pageSourceHash('Shipped v1.'), 'user-modified': true };
  const BEHAVIOUR = ['setting:slug=welcome', 'setting:system-category=documentation'];
  const keptMark = (parts: string[]) => ({ 'kept-edited': true, 'kept-shipped-hash': pageSourceHash('Shipped v1.'), 'kept-working-parts': parts });

  test('an edited page that is kept reads Kept for this site', () => {
    const r = WikiRoutes.shippedStateDetail(shipped('Shipped v1.'), 'Edited here.', { ...stamped, ...keptMark(BEHAVIOUR) });
    expect(r.state).toBe('kept-for-site');
  });

  test('an edited page that is not kept still reads Edited here, not confirmed', () => {
    expect(WikiRoutes.shippedStateDetail(shipped('Shipped v1.'), 'Edited here.', stamped).state).toBe('edited-not-confirmed');
  });

  test('a kept page whose shipped version now calls a plugin reads Kept, needs your review, and says what changed', () => {
    const r = WikiRoutes.shippedStateDetail(shipped('Shipped v2.\n[{Calendar calendars=family}]'), 'Edited here.', { ...stamped, ...keptMark(BEHAVIOUR) });
    expect(r.state).toBe('kept-needs-review');
    expect(r.workingChanges).toEqual(['The shipped page now adds Calendar (calendars=family).']);
  });

  test('a kept page whose shipped version only changed wording reads Kept for this site with a newer version available', () => {
    const r = WikiRoutes.shippedStateDetail(shipped('Shipped v2, reworded.'), 'Edited here.', { ...stamped, ...keptMark(BEHAVIOUR) });
    expect(r.state).toBe('kept-for-site');
    expect(r.newerAvailable).toBe(true);
  });

  test('add-on pages go through the same call with their own stamp key', () => {
    const r = WikiRoutes.shippedStateDetail(shipped('Shipped v1.'), 'Edited here.', { 'addon-source-hash': pageSourceHash('Shipped v1.'), 'user-modified': true, ...keptMark(BEHAVIOUR) }, 'addon-source-hash');
    expect(r.state).toBe('kept-for-site');
  });

  test('Sync All counts a kept page that needs review as a decision, and never as ready', () => {
    const rows = [
      { status: 'modified', userModified: true, syncState: 'kept-needs-review' },
      { status: 'modified', userModified: true, syncState: 'kept-for-site' },
      { status: 'modified', userModified: false, syncState: 'update-ready' }
    ];
    expect(WikiRoutes.markBulkOutdated(rows)).toEqual({ outdatedSyncable: 1, outdatedUserEdited: 1 });
    expect(rows.map((r) => (r as { bulkOutdated?: boolean }).bulkOutdated)).toEqual([false, false, true]);
  });
});
