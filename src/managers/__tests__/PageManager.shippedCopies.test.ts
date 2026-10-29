/**
 * #1503: with `source` gone, which system-categories ship, and whether a page
 * is a shipped copy, are read from what is shipped, never from a config field:
 *
 * - the system-categories required-pages/ ships are the `system-category:`
 *   values in its files' frontmatter, read once;
 * - a page is a shipped copy when its uuid is in the site's seeded-pages
 *   record, decided per page.
 */

vi.unmock('../PageManager');

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import matter from 'gray-matter';
import PageManager from '../PageManager';

describe('PageManager shipped system-categories and shipped copies (#1503)', () => {
  let root: string;
  let requiredDir: string;
  let manager: PageManager;

  const writeShipped = async (name: string, data: Record<string, unknown>) =>
    fs.writeFile(path.join(requiredDir, `${name}.md`), matter.stringify('Body.\n', data));

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-shipped-1503-'));
    requiredDir = path.join(root, 'required-pages');
    await fs.ensureDir(requiredDir);
    const config: Record<string, unknown> = {
      'ngdpbase.page.provider.filesystem.requiredpagesdir': requiredDir,
      'ngdpbase.system-category': {
        system: { label: 'system', storageLocation: { defaultstore: 'pages/' } },
        documentation: { label: 'documentation', storageLocation: { defaultstore: 'pages/' } },
        developer: { label: 'developer' }
      }
    };
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => (config[key] !== undefined ? config[key] : def)),
      getInstanceDataFolder: vi.fn(() => root)
    };
    manager = new PageManager({ getManager: vi.fn((name: string) => (name === 'ConfigurationManager' ? configManager : null)) });
  });

  afterEach(async () => {
    await fs.remove(root); // this test's own temp dir only
  });

  test('the shipped system-categories are the frontmatter values, lower-cased; a never-stored one is left out', async () => {
    await writeShipped('a', { title: 'A', 'system-category': 'documentation' });
    await writeShipped('b', { title: 'B', 'system-category': 'Documentation' });
    await writeShipped('c', { title: 'C', 'system-category': 'system' });
    await writeShipped('d', { title: 'D', 'system-category': 'developer' });
    await writeShipped('e', { title: 'E' });

    expect([...await manager.shippedSystemCategories()].sort()).toEqual(['documentation', 'system']);
  });

  test("an enabled add-on's pages add their system-categories; one without a system-category is addon", async () => {
    await writeShipped('a', { title: 'A', 'system-category': 'system' });
    const addonDir = path.join(root, 'demo-pages');
    await fs.ensureDir(addonDir);
    await fs.writeFile(path.join(addonDir, 'x.md'), matter.stringify('Body.\n', { title: 'X' }));
    await fs.writeFile(path.join(addonDir, 'y.md'), matter.stringify('Body.\n', { title: 'Y', 'system-category': 'Guide' }));
    const getManager = (manager as unknown as { engine: { getManager: ReturnType<typeof vi.fn> } }).engine.getManager;
    const configManager = getManager('ConfigurationManager') as unknown;
    getManager.mockImplementation((name: string) => (name === 'ConfigurationManager'
      ? configManager
      : name === 'AddonsManager' ? { getEnabledAddonPagesDirectories: () => [{ name: 'demo', pagesDir: addonDir }] } : null));

    expect([...await manager.shippedSystemCategories()].sort()).toEqual(['addon', 'guide', 'system']);
  });

  test('they are read once', async () => {
    await writeShipped('a', { title: 'A', 'system-category': 'system' });
    expect([...await manager.shippedSystemCategories()]).toEqual(['system']);
    await writeShipped('b', { title: 'B', 'system-category': 'documentation' });
    expect([...await manager.shippedSystemCategories()]).toEqual(['system']);
  });

  test('the repository\'s own required-pages/ ships system and documentation', async () => {
    const config = { 'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(process.cwd(), 'required-pages') };
    const repo = new PageManager({
      getManager: vi.fn((name: string) => (name === 'ConfigurationManager'
        ? { getProperty: (key: string, def: unknown) => (key in config ? config[key as keyof typeof config] : def) }
        : null))
    });
    expect([...await repo.shippedSystemCategories()].sort()).toEqual(['documentation', 'system']);
  });

  test('a page is a shipped copy when its uuid is in the seeded-pages record, from any source', async () => {
    await fs.writeJson(path.join(root, 'seeded-shipped-pages.json'), {
      version: 2,
      sources: {
        'required-pages': { seeded: { 'aaaaaaaa-0000-0000-0000-000000000001': '2026-01-01T00:00:00.000Z' }, declined: {} },
        'addon:demo': { seeded: { 'aaaaaaaa-0000-0000-0000-000000000002': '2026-01-01T00:00:00.000Z' }, declined: {} }
      }
    });
    expect(await manager.isShippedPageCopy('AAAAAAAA-0000-0000-0000-000000000001')).toBe(true);
    expect(await manager.isShippedPageCopy('aaaaaaaa-0000-0000-0000-000000000002')).toBe(true);
    expect(await manager.isShippedPageCopy('aaaaaaaa-0000-0000-0000-000000000003')).toBe(false);
    expect(await manager.isShippedPageCopy('')).toBe(false);
  });

  test('a site with no record has no shipped copies', async () => {
    expect(await manager.isShippedPageCopy('aaaaaaaa-0000-0000-0000-000000000001')).toBe(false);
  });
});
