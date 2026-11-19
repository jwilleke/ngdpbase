/**
 * #2389 slice 4: Push to Source only from a source checkout.
 *
 * On an installed site the shipped folder is not a copy anyone commits, so the
 * button is hidden and the route refuses. A real PageManager over temp folders;
 * the checkout case has a .git folder beside required-pages.
 */
vi.unmock('../../managers/PageManager');
vi.unmock('../../providers/FileSystemProvider');

import os from 'os';
import path from 'path';
import ejs from 'ejs';
import { JSDOM } from 'jsdom';
import { promises as fs } from 'fs';
import matter from 'gray-matter';
import WikiRoutes from '../WikiRoutes';
import PageManager from '../../managers/PageManager';
import { pageSourceHash, REQUIRED_SOURCE_HASH_KEY } from '../../utils/addonPageSync';
import { ALLOWING_PIP, ALLOWING_PDP } from '../../__tests__/__fixtures__/pageWriteDoor';

const UUID = 'b780e809-d45b-4c4b-84ec-ad30a74a3605';
const OTHER = '0c7a1b2e-5d4f-4e6a-9b8c-1d2e3f4a5b6c';
const VIEWS = path.join(__dirname, '..', '..', '..', 'views');
const REFUSAL = 'This site is not running from a source checkout, so there is no shipped copy to change. Nothing was changed.';

const createMockReq = (body: unknown = {}) => ({
  params: {},
  query: {},
  body,
  session: { csrfToken: 'tok' },
  path: '/admin/required-pages/sync',
  originalUrl: '/admin/required-pages/sync',
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

const doc = (body: string, uuid: string, title: string, extra: Record<string, unknown> = {}) =>
  matter.stringify(`${body}\n`, { title, uuid, slug: title.toLowerCase(), 'system-category': 'documentation', ...extra });

async function setup(opts: { checkout: boolean }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-push-'));
  const dirs = {
    root,
    requiredDir: path.join(root, 'required-pages'),
    pagesDir: path.join(root, 'pages'),
    instanceDir: path.join(root, 'instance')
  };
  await Promise.all([dirs.requiredDir, dirs.pagesDir, dirs.instanceDir].map((d) => fs.mkdir(d)));
  if (opts.checkout) await fs.mkdir(path.join(root, '.git'));

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
      if (name === 'PolicyDecisionPoint') return { ...ALLOWING_PDP, permits: vi.fn().mockResolvedValue(true) };
      if (name === 'PolicyInformationPoint') return ALLOWING_PIP;
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'PageManager') return holder.pageManager;
      if (name === 'SearchManager') return { rebuildIndex: vi.fn().mockResolvedValue(undefined) };
      return null;
    })
  };
  holder.pageManager = new PageManager(engine);
  await holder.pageManager.initialize();
  const routes = new WikiRoutes(engine) as unknown as {
    adminRequiredPages(req: unknown, res: unknown): Promise<void>;
    adminSyncRequiredPages(req: unknown, res: unknown): Promise<void>;
    createWikiContext: unknown;
    hasAdminViewAccess: unknown;
    getCommonTemplateData: unknown;
    findRequiredCategoryPagesNotInSource: unknown;
  };
  routes.createWikiContext = () => ({ userContext: { username: 'admin', isAuthenticated: true, roles: ['admin'] }, hasPermission: async () => true });
  routes.hasAdminViewAccess = async () => true;
  routes.getCommonTemplateData = async () => ({});
  routes.findRequiredCategoryPagesNotInSource = async () => [{ uuid: OTHER, title: 'Not Shipped Yet', category: 'documentation', author: 'admin', lastModified: '2026-11-01T00:00:00.000Z' }];

  // An edited shipped page, and a live page the shipped set does not have yet.
  await fs.writeFile(path.join(dirs.requiredDir, `${UUID}.md`), doc('Shipped v1.', UUID, 'Welcome'), 'utf8');
  await fs.writeFile(
    path.join(dirs.pagesDir, `${UUID}.md`),
    doc('Edited here.', UUID, 'Welcome', { 'user-modified': true, [REQUIRED_SOURCE_HASH_KEY]: pageSourceHash('Shipped v1.') }),
    'utf8'
  );
  await fs.writeFile(path.join(dirs.pagesDir, `${OTHER}.md`), doc('New text.', OTHER, 'Not Shipped Yet'), 'utf8');
  await holder.pageManager.refreshPageList();
  await holder.pageManager.refreshPageList();
  return { dirs, routes };
}

async function renderList(ctx: Awaited<ReturnType<typeof setup>>, drop: string[] = []) {
  const res = createMockRes();
  await ctx.routes.adminRequiredPages(createMockReq(), res);
  const data = { ...(res.render.mock.calls[0][1] as Record<string, unknown>) };
  for (const key of drop) delete data[key];
  const includer = (original: string): { template: string } | undefined =>
    original === 'header' || original === 'footer' ? { template: '<!-- stub -->' } : undefined;
  const html = await ejs.renderFile(path.join(VIEWS, 'admin-required-pages.ejs'), { ...data }, { includer });
  return { data, html, doc: new JSDOM(html).window.document };
}

describe('Push to Source only from a source checkout (#2389 slice 4)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  afterEach(async () => {
    // Scoped to the mkdtemp directory made in setup(), never a project path.
    await fs.rm(ctx.dirs.root, { recursive: true, force: true });
  });

  const shippedText = async () => fs.readFile(path.join(ctx.dirs.requiredDir, `${UUID}.md`), 'utf8');

  describe('on an installed site', () => {
    test('the route refuses with 403 and the shipped folder is not touched', async () => {
      ctx = await setup({ checkout: false });
      const before = await shippedText();
      const res = createMockRes();
      await ctx.routes.adminSyncRequiredPages(createMockReq({ pushToSource: [UUID] }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: REFUSAL });
      expect(await shippedText()).toBe(before);
      expect(await fs.readdir(ctx.dirs.requiredDir)).toEqual([`${UUID}.md`]);
    });

    test('a request that also names pages to sync is refused whole', async () => {
      ctx = await setup({ checkout: false });
      const before = await fs.readFile(path.join(ctx.dirs.pagesDir, `${UUID}.md`), 'utf8');
      const res = createMockRes();
      await ctx.routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID], force: true, pushToSource: [UUID] }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(await fs.readFile(path.join(ctx.dirs.pagesDir, `${UUID}.md`), 'utf8')).toBe(before);
    });

    test('an empty pushToSource list does not make an ordinary sync a refusal', async () => {
      ctx = await setup({ checkout: false });
      const res = createMockRes();
      await ctx.routes.adminSyncRequiredPages(createMockReq({ uuids: [UUID], pushToSource: [] }), res);
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    test('the screen says it cannot push, and no Push to Source button is drawn on either table', async () => {
      ctx = await setup({ checkout: false });
      const { data, doc: page } = await renderList(ctx);
      expect(data.canPushToSource).toBe(false);
      expect(page.querySelectorAll('[data-row-action="pushToSourceOne"]')).toHaveLength(0);
      expect(page.querySelector('#notInSourceTable')).not.toBeNull();
      expect(page.body.textContent).not.toMatch(/push to source/i);
      // The Not in GitHub Yet card no longer tells the admin to push, only to change the category or delete.
      const card = page.querySelector('#notInSourceCard')?.textContent?.replace(/\s+/g, ' ') ?? '';
      expect(card).not.toContain('push it to the source folder');
      expect(card).toContain('change its category if it is not meant to ship, or delete it.');
    });
  });

  describe('when the caller does not say whether it can push', () => {
    test('a render without canPushToSource draws no Push to Source, even on a checkout with an edited page', async () => {
      ctx = await setup({ checkout: true });
      const { doc: page } = await renderList(ctx, ['canPushToSource']);
      expect(page.querySelectorAll('[data-row-action="pushToSourceOne"]')).toHaveLength(0);
      expect(page.body.textContent).not.toMatch(/push to source/i);
      expect(page.querySelector('#notInSourceCard')?.textContent).not.toContain('push it to the source folder');
    });
  });

  describe('on a source checkout', () => {
    test('the route still writes the live text into the shipped folder', async () => {
      ctx = await setup({ checkout: true });
      const res = createMockRes();
      await ctx.routes.adminSyncRequiredPages(createMockReq({ pushToSource: [UUID] }), res);
      expect(res.status).not.toHaveBeenCalledWith(403);
      const written = matter(await shippedText());
      expect(written.content.trim()).toBe('Edited here.');
      expect(written.data['user-modified']).toBeUndefined();
    });

    test('both Push to Source buttons show, and each asks first', async () => {
      ctx = await setup({ checkout: true });
      const { data, doc: page } = await renderList(ctx);
      expect(data.canPushToSource).toBe(true);
      const buttons = [...page.querySelectorAll('[data-row-action="pushToSourceOne"]')];
      expect(buttons).toHaveLength(2);
      expect(page.querySelector('#pagesTable [data-row-action="pushToSourceOne"]')).not.toBeNull();
      expect(page.querySelector('#notInSourceTable [data-row-action="pushToSourceOne"]')).not.toBeNull();
      expect(page.querySelector('#notInSourceCard')?.textContent?.replace(/\s+/g, ' ')).toContain('push it to the source folder');
    });

    test('each button asks the one-line question first, and no second prompt follows it', async () => {
      ctx = await setup({ checkout: true });
      const { html, doc: page } = await renderList(ctx);
      const buttons = [...page.querySelectorAll('[data-row-action="pushToSourceOne"]')];
      for (const button of buttons) expect(button.getAttribute('data-confirm')).toBe("Make this site's text the version every release ships?");
      // The click handler asks with the button's own question; the function does not ask again.
      const fn = html.slice(html.indexOf('async function pushToSourceOne'), html.indexOf('function showToast'));
      expect(fn).not.toContain('confirm(');
    });
  });
});
