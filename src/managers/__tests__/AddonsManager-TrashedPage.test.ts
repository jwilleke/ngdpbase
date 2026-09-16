/**
 * @file AddonsManager-TrashedPage.test.ts
 * @description #1403 — an addon page in the trash is never seeded again.
 *
 * The boot seed looked a source page up among live pages only. A page an
 * operator had deleted was not found, so it was seeded again under the same
 * uuid: live beside its own trash entry, sharing one version folder that a
 * purge then deleted. A trashed uuid was deliberately removed, not missing.
 */
vi.unmock('../AddonsManager');

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';
import logger from '../../utils/logger';

const TRASHED = '11111111-2222-3333-4444-555555555555';
const FRESH = '66666666-7777-8888-9999-aaaaaaaaaaaa';

describe('#1403 addon page seed skips a page in the trash', () => {
  let tmpDir: string;
  let pagesDir: string;
  let manager: { seedAddonPages(name: string, addonPath: string): Promise<void>; addons: Map<string, unknown>; engine: unknown };
  let savePage: ReturnType<typeof vi.fn>;
  let getPageByUUID: ReturnType<typeof vi.fn>;
  let info: ReturnType<typeof vi.spyOn>;

  const writePage = async (file: string, data: Record<string, unknown>) => {
    await fs.writeFile(path.join(pagesDir, file), matter.stringify('body text', data), 'utf8');
  };

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `seed-trashed-${Date.now()}-${Math.floor(performance.now())}`);
    pagesDir = path.join(tmpDir, 'pages');
    await fs.ensureDir(pagesDir);

    info = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    savePage = vi.fn().mockResolvedValue(undefined);
    getPageByUUID = vi.fn().mockResolvedValue(null);

    const mod = await import('../AddonsManager');
    const AddonsManager = (mod.default ?? mod) as unknown as { prototype: typeof manager };
    manager = Object.create(AddonsManager.prototype) as typeof manager;
    manager.addons = new Map([['demo', { path: tmpDir, module: {}, enabled: true, loaded: true, error: null, manifest: { type: 'additive' } }]]);
    (manager as { engine: unknown }).engine = {
      getManager: (n: string) => {
        if (n === 'PageManager') {
          return {
            isPageDeleted: (uuid: string) => uuid === TRASHED,
            getPageByUUID,
            pageExists: vi.fn().mockReturnValue(false),
            getPage: vi.fn().mockResolvedValue(null),
            savePage
          };
        }
        if (n === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
        return null;
      }
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Only this test's own directory under os.tmpdir().
    if (await fs.pathExists(tmpDir)) await fs.remove(tmpDir);
  });

  test('a trashed page is not seeded; a new page beside it still is', async () => {
    await writePage('trashed.md', { uuid: TRASHED, slug: 'trashed', title: 'Trashed' });
    await writePage('fresh.md', { uuid: FRESH, slug: 'fresh', title: 'Fresh' });

    await manager.seedAddonPages('demo', tmpDir);

    const savedSlugs = savePage.mock.calls.map((c) => c[0]);
    expect(savedSlugs).toEqual(['fresh']);
    expect(getPageByUUID).not.toHaveBeenCalledWith(TRASHED, expect.anything());
  });

  test('the skip is logged with the uuid, so an operator can find why the page is absent', async () => {
    await writePage('trashed.md', { uuid: TRASHED, slug: 'trashed', title: 'Trashed' });

    await manager.seedAddonPages('demo', tmpDir);

    const line = info.mock.calls.map((c) => String(c[0])).find((m) => m.includes('in the trash'));
    expect(line).toContain(TRASHED);
    expect(line).toContain('trashed.md');
  });
});
