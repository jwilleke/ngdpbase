/**
 * #2389 slice 3: each Required Pages Sync row says which release the site's copy
 * came from and which release is installed. Core pages read the ngdpbase version;
 * add-on pages read the add-on's own version. Display only: the content hash still
 * decides the state.
 */
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
import { pageSourceHash, REQUIRED_SOURCE_HASH_KEY } from '../../utils/addonPageSync';

const CORE_UUID = 'b780e809-d45b-4c4b-84ec-ad30a74a3605';
const ADDON_UUID = '7d3f1c9a-2b4e-4f6a-8c1d-5e9a0b7c3d21';
const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../views');
const admin = { username: 'admin', isAuthenticated: true, roles: ['admin'] };

const req = () => ({
  params: {}, query: {}, body: {}, session: { csrfToken: 'tok' }, path: '/admin/required-pages', originalUrl: '/admin/required-pages',
  protocol: 'http', get: vi.fn().mockReturnValue('localhost:3000'), userContext: admin
});
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis() });

const doc = (uuid: string, slug: string, body: string, extra = '') => `---\ntitle: ${slug}\nuuid: ${uuid}\nslug: ${slug}\n${extra}---\n${body}\n`;

type Row = { uuid: string; copyRelease?: string; copyEarlier?: boolean };
type ListData = { comparison: Row[]; addonComparison: Row[]; thisRelease?: string; addonReleases?: Array<{ name: string; release: string }> } & Record<string, unknown>;

describe('#2389 slice 3 Required Pages Sync rows carry the release label', () => {
  let root: string;
  let requiredDir: string;
  let pagesDir: string;
  let addonDir: string;
  let instanceDir: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-release-label-'));
    requiredDir = path.join(root, 'required-pages');
    pagesDir = path.join(root, 'pages');
    addonDir = path.join(root, 'addon-pages');
    instanceDir = path.join(root, 'instance');
    for (const d of [requiredDir, pagesDir, addonDir, instanceDir]) await fs.mkdir(d);
  });

  afterEach(async () => {
    // Scoped to the mkdtemp directory created above, never a project path.
    await fs.rm(root, { recursive: true, force: true });
  });

  async function list(): Promise<{ data: ListData; html: string }> {
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.page.provider') return 'filesystemprovider';
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return requiredDir;
        if (key === 'ngdpbase.version') return '5.45.0';
        return def;
      }),
      getResolvedDataPath: vi.fn(() => pagesDir),
      getInstanceDataFolder: vi.fn(() => instanceDir)
    };
    const holder: { pm?: PageManager } = {};
    const engine = {
      getManager: vi.fn(withWriteDoorAllowing((name: string) => {
        if (name === 'UserManager') return { hasPermission: vi.fn().mockResolvedValue(true) };
        if (name === 'ConfigurationManager') return configManager;
        if (name === 'ValidationManager') return { checkConflicts: vi.fn().mockResolvedValue({ hasConflict: false }), sanitizeMetadata: (m: unknown) => m, getCategoryStored: () => 'public' };
        if (name === 'PageManager') return holder.pm;
        if (name === 'SearchManager') return { rebuildIndex: vi.fn().mockResolvedValue(undefined) };
        if (name === 'AddonsManager') {
          return {
            getEnabledAddonPagesDirectories: () => [{ name: 'demo', pagesDir: addonDir }],
            getAddonVersion: (slug: string) => (slug === 'demo' ? '2.3.0' : undefined),
            findOrphanedAddonPages: async () => []
          };
        }
        return null;
      }))
    };
    holder.pm = new PageManager(engine);
    await holder.pm.initialize();
    await holder.pm.refreshPageList();
    const routes = new WikiRoutes(engine) as unknown as {
      adminRequiredPages(r: unknown, s: unknown): Promise<void>;
      createWikiContext: unknown; hasAdminViewAccess: unknown; getCommonTemplateData: unknown; findRequiredCategoryPagesNotInSource: unknown;
    };
    routes.createWikiContext = () => ({ userContext: admin, hasPermission: async () => true });
    routes.hasAdminViewAccess = async () => true;
    routes.getCommonTemplateData = async () => ({});
    routes.findRequiredCategoryPagesNotInSource = async () => [];
    const out = res();
    await routes.adminRequiredPages(req(), out);
    const data = out.render.mock.calls[0][1] as ListData;
    const includer = (original: string): { template: string } | undefined => (original === 'header' || original === 'footer' ? { template: '<!-- stub -->' } : undefined);
    const html = await ejs.renderFile(path.join(VIEWS, 'admin-required-pages.ejs'), { ...data, locals: {} }, { includer });
    return { data, html };
  }

  const cellText = (html: string, uuid: string) => {
    const row = new JSDOM(html).window.document.querySelector(`[data-uuid="${uuid}"]`);
    return (row?.textContent ?? '').replace(/\s+/g, ' ');
  };

  const count = (html: string, needle: string) => html.split(needle).length - 1;

  test('a core page: the row shows the copy\'s release, the section header shows the installed one', async () => {
    await fs.writeFile(path.join(requiredDir, `${CORE_UUID}.md`), doc(CORE_UUID, 'corepage', 'new body'), 'utf8');
    await fs.writeFile(path.join(pagesDir, `${CORE_UUID}.md`), doc(CORE_UUID, 'corepage', 'old body', `${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('old body')}\nrequired-source-release: 5.43.0\n`), 'utf8');
    const { data, html } = await list();
    expect(data.comparison.find((r) => r.uuid === CORE_UUID)).toMatchObject({ copyRelease: '5.43.0' });
    expect(data.thisRelease).toBe('5.45.0');
    expect(cellText(html, CORE_UUID)).toContain('Your copy: v5.43.0');
    expect(cellText(html, CORE_UUID)).not.toContain('This release');
  });

  test('"This release" is said once for the core section', async () => {
    await fs.writeFile(path.join(requiredDir, `${CORE_UUID}.md`), doc(CORE_UUID, 'corepage', 'new body'), 'utf8');
    await fs.writeFile(path.join(pagesDir, `${CORE_UUID}.md`), doc(CORE_UUID, 'corepage', 'old body', `${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('old body')}\nrequired-source-release: 5.43.0\n`), 'utf8');
    const { html } = await list();
    expect(count(html, 'This release: v5.45.0')).toBe(1);
  });

  test('a core page with no label reads "an earlier release"', async () => {
    await fs.writeFile(path.join(requiredDir, `${CORE_UUID}.md`), doc(CORE_UUID, 'corepage', 'new body'), 'utf8');
    await fs.writeFile(path.join(pagesDir, `${CORE_UUID}.md`), doc(CORE_UUID, 'corepage', 'old body', `${REQUIRED_SOURCE_HASH_KEY}: ${pageSourceHash('old body')}\n`), 'utf8');
    const { data, html } = await list();
    const row = data.comparison.find((r) => r.uuid === CORE_UUID);
    expect(row?.copyRelease).toBeUndefined();
    expect(row?.copyEarlier).toBe(true);
    expect(cellText(html, CORE_UUID)).toContain('Your copy: an earlier release');
  });

  test('an add-on page: its own key and its own version in the header, never the ngdpbase version', async () => {
    await fs.writeFile(path.join(addonDir, 'demo-page.md'), doc(ADDON_UUID, 'addonpage', 'new body'), 'utf8');
    await fs.writeFile(path.join(pagesDir, `${ADDON_UUID}.md`), doc(ADDON_UUID, 'addonpage', 'old body', `addon-source-hash: ${pageSourceHash('old body')}\naddon-source-release: 2.2.0\nrequired-source-release: 9.9.9\n`), 'utf8');
    const { data, html } = await list();
    expect(data.addonComparison.find((r) => r.uuid === ADDON_UUID)).toMatchObject({ copyRelease: '2.2.0' });
    expect(data.addonReleases).toEqual([{ name: 'demo', release: '2.3.0' }]);
    expect(cellText(html, ADDON_UUID)).toContain('Your copy: v2.2.0');
    expect(cellText(html, ADDON_UUID)).not.toContain('This release');
    expect(count(html, 'This release: demo v2.3.0')).toBe(1);
  });

  test('a page not on the site yet has no copy to label', async () => {
    await fs.writeFile(path.join(requiredDir, `${CORE_UUID}.md`), doc(CORE_UUID, 'corepage', 'new body'), 'utf8');
    const { html } = await list();
    expect(cellText(html, CORE_UUID)).not.toContain('Your copy');
  });
});
