/**
 * @file AddonsManager-AccessStamp.test.ts
 * @description #971 — the seeder stamps frontmatter `access` so addon pages are
 * admin-editable only (addons.md §3), with the default following §9's ownership
 * column rather than locking everything.
 */
vi.unmock('../AddonsManager');

import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';

const UUID = (n: number) => `${String(n).repeat(8)}-2222-3333-4444-555555555555`;

describe('#971 addon page access stamping', () => {
  let tmpDir: string;
  let pagesDir: string;
  let savePage: ReturnType<typeof vi.fn>;
  let manager: { seedAddonPages(n: string, p: string): Promise<void>; addons: Map<string, unknown>; engine: unknown };

  const write = async (file: string, data: Record<string, unknown>) => {
    await fs.writeFile(path.join(pagesDir, file), matter.stringify('body', data), 'utf8');
  };

  /** Metadata the seeder passed to savePage for a given slug. */
  const metaFor = (slug: string) =>
    savePage.mock.calls.find((c) => c[0] === slug)?.[2] as Record<string, unknown> | undefined;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `access-stamp-${Date.now()}-${Math.floor(performance.now())}`);
    pagesDir = path.join(tmpDir, 'pages');
    await fs.ensureDir(pagesDir);
    savePage = vi.fn().mockResolvedValue(undefined);

    const mod = await import('../AddonsManager');
    const AddonsManager = (mod.default ?? mod) as unknown as { prototype: typeof manager };
    manager = Object.create(AddonsManager.prototype) as typeof manager;
    manager.addons = new Map([['demo', { path: tmpDir, module: {}, enabled: true, loaded: true, error: null, manifest: { type: 'domain' } }]]);
    (manager as { engine: unknown }).engine = {
      getManager: (n: string) => {
        if (n === 'PageManager') {
          return {
            getPageByUUID: vi.fn().mockResolvedValue(null),
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
    if (await fs.pathExists(tmpDir)) await fs.remove(tmpDir);
  });

  test('a system page (feature UI, site chrome) is admin-edit only', async () => {
    await write('a.md', { uuid: UUID(1), slug: 'left-menu-content', 'system-category': 'system' });
    await manager.seedAddonPages('demo', tmpDir);
    expect(metaFor('left-menu-content')?.access).toEqual({ edit: ['admin'] });
  });

  test('a documentation page is admin-edit only', async () => {
    await write('a.md', { uuid: UUID(2), slug: 'calendarhelp', 'system-category': 'documentation' });
    await manager.seedAddonPages('demo', tmpDir);
    expect(metaFor('calendarhelp')?.access).toEqual({ edit: ['admin'] });
  });

  test('a general page is NOT locked — domain content is instance-owned (§9)', async () => {
    // The decision this must honour: "Domain Content pages should be normal
    // pages, purely seeded by addon." Locking them would contradict it.
    await write('a.md', { uuid: UUID(3), slug: 'earthquakes', 'system-category': 'general' });
    await manager.seedAddonPages('demo', tmpDir);
    expect(metaFor('earthquakes')?.access).toBeUndefined();
  });

  test('an unclassified page defaults to addon-owned, so it is locked', async () => {
    await write('a.md', { uuid: UUID(4), slug: 'mystery' });
    await manager.seedAddonPages('demo', tmpDir);
    expect(metaFor('mystery')?.access).toEqual({ edit: ['admin'] });
  });

  test("a source-declared access always wins — the addon's documented escape hatch", async () => {
    await write('a.md', {
      uuid: UUID(5), slug: 'community', 'system-category': 'documentation',
      access: { edit: ['contributor'] }
    });
    await manager.seedAddonPages('demo', tmpDir);
    expect(metaFor('community')?.access).toEqual({ edit: ['contributor'] });
  });

  test('stamping access does not disturb the reseed hash (#920)', async () => {
    // pageSourceHash covers the BODY only. If access stamping changed it, every
    // page would read as locally-modified and reseed would stop permanently.
    await write('a.md', { uuid: UUID(6), slug: 'hashcheck', 'system-category': 'system' });
    await manager.seedAddonPages('demo', tmpDir);

    const meta = metaFor('hashcheck');
    expect(meta.access).toEqual({ edit: ['admin'] });
    expect(typeof meta['addon-source-hash']).toBe('string');

    // Assert against the real function rather than a hand-rolled hash: the
    // point is that the stamp equals the hash of the BODY ALONE, unaffected by
    // any metadata the seeder added.
    const { pageSourceHash } = await import('../../utils/addonPageSync');
    expect(meta['addon-source-hash']).toBe(pageSourceHash('body'));
  });

  describe('legacy backfill (#971)', () => {
    /** Stand up a manager whose PageManager already has this page seeded. */
    const withExisting = (meta: Record<string, unknown>, content = 'existing body') => {
      (manager as { engine: unknown }).engine = {
        getManager: (n: string) => {
          if (n === 'PageManager') {
            return {
              getPageByUUID: vi.fn().mockResolvedValue({ metadata: meta, content }),
              pageExists: vi.fn().mockReturnValue(true),
              getPage: vi.fn().mockResolvedValue({ metadata: meta, content }),
              savePage
            };
          }
          if (n === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
          if (n === 'SearchManager') return { updatePageInIndex: vi.fn().mockResolvedValue(undefined) };
          return null;
        }
      };
    };

    test('stamps access on a page seeded before stamping existed', async () => {
      withExisting({ uuid: UUID(1), slug: 'calendarhelp', 'system-category': 'documentation' });
      await write('a.md', { uuid: UUID(1), slug: 'calendarhelp', 'system-category': 'documentation' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(metaFor('calendarhelp')?.access).toEqual({ edit: ['admin'] });
    });

    test('leaves the body untouched, so the reseed hash cannot shift', async () => {
      withExisting({ uuid: UUID(2), slug: 'x', 'system-category': 'system' }, 'ORIGINAL BODY');
      await write('a.md', { uuid: UUID(2), slug: 'x', 'system-category': 'system' });

      await manager.seedAddonPages('demo', tmpDir);

      const call = savePage.mock.calls.find((c) => c[0] === 'x');
      expect(call?.[1]).toBe('ORIGINAL BODY');
    });

    test('does NOT touch a page that already has access', async () => {
      // An operator who widened it must keep their setting.
      withExisting({ uuid: UUID(3), slug: 'open', 'system-category': 'system', access: { edit: ['contributor'] } });
      await write('a.md', { uuid: UUID(3), slug: 'open', 'system-category': 'system' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage).not.toHaveBeenCalled();
    });

    test('does NOT lock a general page — domain content stays instance-owned', async () => {
      withExisting({ uuid: UUID(4), slug: 'earthquakes', 'system-category': 'general' });
      await write('a.md', { uuid: UUID(4), slug: 'earthquakes', 'system-category': 'general' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage).not.toHaveBeenCalled();
    });

    test('preserves the rest of the existing metadata', async () => {
      withExisting({
        uuid: UUID(5), slug: 'keep', 'system-category': 'system',
        created: '2020-01-01', 'addon-source-hash': 'abc', title: 'Keep Me'
      });
      await write('a.md', { uuid: UUID(5), slug: 'keep', 'system-category': 'system' });

      await manager.seedAddonPages('demo', tmpDir);

      const meta = metaFor('keep');
      expect(meta.created).toBe('2020-01-01');
      expect(meta['addon-source-hash']).toBe('abc');
      expect(meta.title).toBe('Keep Me');
      expect(meta.access).toEqual({ edit: ['admin'] });
    });
  });

  test('view is left alone so pages stay publicly readable', async () => {
    await write('a.md', { uuid: UUID(7), slug: 'readable', 'system-category': 'system' });
    await manager.seedAddonPages('demo', tmpDir);
    const access = metaFor('readable')?.access as Record<string, unknown>;
    expect(access.edit).toEqual(['admin']);
    expect(access.view).toBeUndefined();
  });
});
