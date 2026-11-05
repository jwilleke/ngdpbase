/**
 * @file AddonsManager-AddonAuthor.test.ts
 * @description #2255 — an add-on's pages are authored by the add-on,
 * `addon:<slug>`: the seed writes it on a new page, and a page seeded before,
 * authored by the system principal, is re-stamped once. The `access` stamp
 * that once made these pages admin-edit only (#971) is gone; their
 * system-category's policy decides who may change them.
 */
vi.unmock('../AddonsManager');

import { withRealShippedPageSeeder } from './__fixtures__/realShippedPageSeeder';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import matter from 'gray-matter';
import { pageSourceHash } from '../../utils/addonPageSync';

/** The stamp a page seeded from `body` carries (#1408), so the stamp backfill has nothing to do. */
const STAMPED = { 'addon-source-hash': pageSourceHash('body') };

const UUID = (n: number) => `${String(n).repeat(8)}-2222-3333-4444-555555555555`;

describe('#2255 add-on pages are authored by the add-on', () => {
  let tmpDir: string;
  let pagesDir: string;
  let savePage: ReturnType<typeof vi.fn>;
  let manager: { seedAddonPages(n: string, p: string): Promise<void>; addons: Map<string, unknown>; engine: unknown };

  const write = async (file: string, data: Record<string, unknown>) => {
    await fs.writeFile(path.join(pagesDir, file), matter.stringify('body', { title: `Title ${String(data.slug)}`, ...data }), 'utf8');
  };

  /** The savePage call for a slug: [name, content, metadata, ctx, options]. */
  const callFor = (slug: string) =>
    savePage.mock.calls.find((c) => c[0] === slug || (c[2] as Record<string, unknown>)?.slug === slug);

  /** Stand up the manager over a PageManager that holds `existing` (or nothing). */
  const withPageManager = (existing: { metadata: Record<string, unknown>; content: string } | null) => {
    (manager as { engine: unknown }).engine = withRealShippedPageSeeder({
      getManager: (n: string) => {
        if (n === 'PageManager') {
          return {
            isPageDeleted: () => false,
            getPageByUUID: vi.fn().mockResolvedValue(existing),
            pageExists: vi.fn().mockReturnValue(existing !== null),
            getPage: vi.fn().mockResolvedValue(existing),
            savePage
          };
        }
        if (n === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d };
        if (n === 'SearchManager') return { updatePageInIndex: vi.fn().mockResolvedValue(undefined) };
        return null;
      }
    }, tmpDir);
  };

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `addon-author-${Date.now()}-${Math.floor(performance.now())}`);
    pagesDir = path.join(tmpDir, 'pages');
    await fs.ensureDir(pagesDir);
    savePage = vi.fn().mockResolvedValue(undefined);
    const mod = await import('../AddonsManager');
    const AddonsManager = (mod.default ?? mod) as unknown as { prototype: typeof manager };
    manager = Object.create(AddonsManager.prototype) as typeof manager;
    manager.addons = new Map([['demo', { path: tmpDir, module: {}, enabled: true, loaded: true, error: null, manifest: { type: 'domain' } }]]);
    withPageManager(null);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (await fs.pathExists(tmpDir)) await fs.remove(tmpDir);
  });

  test('a new page is saved with the add-on as its author, and no access stamp', async () => {
    await write('a.md', { uuid: UUID(1), slug: 'calendarhelp', 'system-category': 'documentation' });
    await manager.seedAddonPages('demo', tmpDir);
    const call = callFor('calendarhelp');
    expect(call?.[4]).toMatchObject({ skipValidation: true, shippedAuthor: 'addon:demo' });
    expect((call?.[2] as Record<string, unknown>).access).toBeUndefined();
  });

  test('no category gets an access stamp any more, the unclassified default included', async () => {
    await write('a.md', { uuid: UUID(2), slug: 'mystery' });
    await write('b.md', { uuid: UUID(3), slug: 'chrome', 'system-category': 'system' });
    await manager.seedAddonPages('demo', tmpDir);
    for (const slug of ['mystery', 'chrome']) {
      expect((callFor(slug)?.[2] as Record<string, unknown>).access).toBeUndefined();
    }
  });

  describe('the re-stamp of pages seeded before #2255', () => {
    test('a page authored by the system principal is re-stamped once, body and lastModified kept', async () => {
      withPageManager({ metadata: { uuid: UUID(4), slug: 'calendar', title: 'Calendar', author: 'system', 'system-category': 'addon', 'addon-source-category': 'addon' }, content: 'ORIGINAL BODY' });
      await write('a.md', { uuid: UUID(4), slug: 'calendar', 'system-category': 'addon' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage).toHaveBeenCalledTimes(1);
      const [, content, meta, , options] = savePage.mock.calls[0];
      expect(content).toBe('ORIGINAL BODY');
      expect(meta.title).toBe('Calendar');
      expect(options).toEqual({ skipValidation: true, shippedAuthor: 'addon:demo', preserveLastModified: true });
    });

    test('a page someone else authored is left alone', async () => {
      withPageManager({ metadata: { uuid: UUID(5), ...STAMPED, slug: 'taken', author: 'urn:uuid:11111111-1111-4111-8111-111111111111', 'system-category': 'addon', 'addon-source-category': 'addon' }, content: 'body' });
      await write('a.md', { uuid: UUID(5), slug: 'taken', 'system-category': 'addon' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage).not.toHaveBeenCalled();
    });

    test('a page already authored by the add-on is not saved again', async () => {
      withPageManager({ metadata: { uuid: UUID(6), ...STAMPED, slug: 'done', author: 'addon:demo', 'system-category': 'addon', 'addon-source-category': 'addon' }, content: 'body' });
      await write('a.md', { uuid: UUID(6), slug: 'done', 'system-category': 'addon' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage).not.toHaveBeenCalled();
    });

    test('a category drift and the re-stamp land in one save, which is a real edit', async () => {
      withPageManager({ metadata: { uuid: UUID(7), ...STAMPED, slug: 'drift', author: 'system', 'system-category': 'addon', 'addon-source-category': 'addon' }, content: 'body' });
      await write('a.md', { uuid: UUID(7), slug: 'drift', 'system-category': 'documentation' });

      await manager.seedAddonPages('demo', tmpDir);

      expect(savePage).toHaveBeenCalledTimes(1);
      const [, , meta, , options] = savePage.mock.calls[0];
      expect(meta['system-category']).toBe('documentation');
      expect(options).toEqual({ skipValidation: true, shippedAuthor: 'addon:demo' });
    });
  });
});
