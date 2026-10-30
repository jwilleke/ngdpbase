/**
 * Required Pages Sync reports a UUID Mismatch only for an exact name clash — issue #2140.
 *
 * The shipped help page "Reviews" (slug `reviews`) was shown as clashing with
 * the user-keyword page "review": the conflict check looked the name up with
 * the link resolver, which accepts plurals. A name is taken only when another
 * page has the same title or the same slug (ignoring case).
 *
 * Real PageManager, FileSystemProvider, ValidationManager and plural matcher,
 * so the lookup is the one a site does.
 */
vi.unmock('../../managers/PageManager');
vi.unmock('../../providers/FileSystemProvider');
vi.unmock('../../utils/PageNameMatcher');

import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import { JSDOM } from 'jsdom';
import WikiRoutes from '../WikiRoutes';
import PageManager from '../../managers/PageManager';
import ValidationManager from '../../managers/ValidationManager';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../views');
const SHIPPED = 'e84f407e-8d96-4346-aa31-4393542c3a13';
const LIVE = '89bee14f-cefe-413b-b25f-38701087a323';
const ADDON_SHIPPED = '3d0c1a7e-2b4f-4c6d-8e9f-0a1b2c3d4e5f';

const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

const createMockReq = () => ({
  params: {},
  query: {},
  body: {},
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

const pageFile = (uuid: string, title: string, slug: string) =>
  `---\ntitle: ${title}\nuuid: ${uuid}\nslug: ${slug}\n---\n${title} body\n`;

/** mkdtemp keeps teardown scoped to a directory this test created — never a live `data/` tree. */
async function makeDirs() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-required-names-'));
  const dirs = {
    root,
    requiredDir: path.join(root, 'required-pages'),
    pagesDir: path.join(root, 'pages'),
    instanceDir: path.join(root, 'instance'),
    addonPagesDir: path.join(root, 'addon-pages')
  };
  for (const dir of [dirs.requiredDir, dirs.pagesDir, dirs.instanceDir, dirs.addonPagesDir]) await fs.mkdir(dir);
  return dirs;
}

async function render(dirs: Awaited<ReturnType<typeof makeDirs>>, withAddon = false) {
  const configManager = {
    getProperty: vi.fn((key: string, def: unknown) => {
      if (key === 'ngdpbase.page.provider') return 'filesystemprovider';
      if (key === 'ngdpbase.page.provider.filesystem.storagedir') return dirs.pagesDir;
      if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return dirs.requiredDir;
      if (key === 'ngdpbase.translator-reader.match-english-plurals') return true;
      return def;
    }),
    getResolvedDataPath: vi.fn(() => dirs.pagesDir),
    getInstanceDataFolder: vi.fn(() => dirs.instanceDir)
  };
  const holder: { pageManager?: PageManager; validationManager?: ValidationManager } = {};
  const addonsManager = {
    getEnabledAddonPagesDirectories: () => [{ name: 'demo', pagesDir: dirs.addonPagesDir }],
    findOrphanedAddonPages: async () => []
  };
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'UserManager') return { hasPermission: vi.fn().mockResolvedValue(true) };
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'ValidationManager') return holder.validationManager;
      if (name === 'PageManager') return holder.pageManager;
      if (name === 'AddonsManager') return withAddon ? addonsManager : null;
      return null;
    })
  };
  holder.validationManager = new ValidationManager(engine);
  holder.pageManager = new PageManager(engine);
  await holder.pageManager.initialize();

  const routes = new WikiRoutes(engine) as unknown as {
    adminRequiredPages(req: unknown, res: unknown): Promise<void>;
    createWikiContext: unknown;
    hasAdminViewAccess: unknown;
    getCommonTemplateData: unknown;
    findRequiredCategoryPagesNotInSource: unknown;
  };
  routes.createWikiContext = () => ({ userContext: admin, hasPermission: async () => true });
  routes.hasAdminViewAccess = async () => true;
  routes.getCommonTemplateData = async () => ({});
  routes.findRequiredCategoryPagesNotInSource = async () => [];

  const res = createMockRes();
  await routes.adminRequiredPages(createMockReq(), res);
  expect(res.render).toHaveBeenCalledWith('admin-required-pages', expect.anything());
  const data = res.render.mock.calls[0][1] as Record<string, unknown> & {
    comparison: Array<{ uuid: string; status: string; liveUuid?: string }>;
    addonComparison: Array<{ uuid: string; status: string; liveUuid?: string }>;
  };
  const includer = (original: string): { template: string } | undefined =>
    original === 'header' || original === 'footer' ? { template: '<!-- stub -->' } : undefined;
  const html = await ejs.renderFile(path.join(VIEWS, 'admin-required-pages.ejs'), { ...data, locals: {} }, { includer });
  return { data, doc: new JSDOM(html).window.document, pageManager: holder.pageManager };
}

describe('#2140 Required Pages Sync: a UUID Mismatch is an exact name clash', () => {
  let dirs: Awaited<ReturnType<typeof makeDirs>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    dirs = await makeDirs();
    await fs.writeFile(path.join(dirs.pagesDir, `${LIVE}.md`), pageFile(LIVE, 'review', 'review'), 'utf8');
  });

  afterEach(async () => {
    // Scoped to the mkdtemp directory created above — never a project path.
    await fs.rm(dirs.root, { recursive: true, force: true });
  });

  test('"Reviews" beside the live "review" page is new, not a mismatch', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${SHIPPED}.md`), pageFile(SHIPPED, 'Reviews', 'reviews'), 'utf8');
    const { data, doc, pageManager } = await render(dirs);

    // The link resolver still takes the plural: [Reviews] reaches "review".
    expect((await pageManager.getPage('Reviews', admin as never))?.uuid).toBe(LIVE);
    expect(data.comparison.find((p) => p.uuid === SHIPPED)).toMatchObject({ status: 'new', liveUuid: undefined });
    expect(doc.querySelector('[data-testid="uuid-mismatch-help"]')).toBeNull();
  });

  test('the same slug under another uuid is a mismatch, and the screen explains it', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${SHIPPED}.md`), pageFile(SHIPPED, 'Review Guide', 'Review'), 'utf8');
    const { data, doc } = await render(dirs);

    expect(data.comparison.find((p) => p.uuid === SHIPPED)).toMatchObject({ status: 'uuid-mismatch', liveUuid: LIVE });
    const help = doc.querySelector('#pagesTable')?.closest('.card-body')?.querySelector('[data-testid="uuid-mismatch-help"]');
    expect(help?.textContent).toContain('A different page with the same name already exists on this site.');
    expect([...(help?.querySelectorAll('[data-help]') ?? [])].map((li) => li.getAttribute('data-help')))
      .toEqual(['diff', 'adopt', 'replace', 'decline', 'all']);
    expect(help?.querySelector('[data-help="adopt"]')?.textContent).toContain('keeps the page already here');
    expect(help?.querySelector('[data-help="replace"]')?.textContent).toContain('moves the page already here to the trash');
    expect(help?.querySelector('[data-help="decline"]')?.textContent).toContain('stops offering the shipped page on this site');
  });

  test('the same title under another uuid is a mismatch', async () => {
    await fs.writeFile(path.join(dirs.requiredDir, `${SHIPPED}.md`), pageFile(SHIPPED, 'Review', 'review-help'), 'utf8');
    const { data } = await render(dirs);

    expect(data.comparison.find((p) => p.uuid === SHIPPED)).toMatchObject({ status: 'uuid-mismatch', liveUuid: LIVE });
  });

  test('add-on pages use the same exact rule, and their help names only Don\'t Seed Here', async () => {
    await fs.writeFile(path.join(dirs.addonPagesDir, 'reviews.md'), pageFile(ADDON_SHIPPED, 'Reviews', 'reviews'), 'utf8');
    await fs.writeFile(path.join(dirs.addonPagesDir, 'review-clash.md'), pageFile(SHIPPED, 'Other', 'review'), 'utf8');
    const { data, doc } = await render(dirs, true);

    expect(data.addonComparison.find((p) => p.uuid === ADDON_SHIPPED)).toMatchObject({ status: 'new' });
    expect(data.addonComparison.find((p) => p.uuid === SHIPPED)).toMatchObject({ status: 'uuid-mismatch', liveUuid: LIVE });
    const help = doc.querySelector('#addonPagesTable')?.closest('.card-body')?.querySelector('[data-testid="uuid-mismatch-help"]');
    expect([...(help?.querySelectorAll('[data-help]') ?? [])].map((li) => li.getAttribute('data-help'))).toEqual(['decline']);
  });
});
