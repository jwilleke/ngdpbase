/**
 * @file PageManager.seedRequiredPages.test.ts
 * @description Required pages are seeded once per site, through the shared
 * shipped-page seeder (#1405, epic #1404).
 *
 * - A required page new in a release appears at the next start-up, on every site.
 * - A required page removed on the site stays removed (#954), whatever the
 *   provider: the site's seeded-pages record remembers it after the trash forgets.
 * - Pages in a github-only category are never seeded.
 *
 * Real PageManager and FileSystemProvider over temp directories; teardown removes
 * only the mkdtemp directory.
 */
// The real provider: the seeder's lookups and saves are what is under test.
vi.unmock('../../providers/FileSystemProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../PageManager');

import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import fse from 'fs-extra';
import matter from 'gray-matter';
import { pageSourceHash, REQUIRED_SOURCE_HASH_KEY } from '../../utils/addonPageSync';
import { SEEDED_SHIPPED_PAGES_FILE } from '../../utils/seededShippedPages';

vi.mock('../../utils/logger', () => ({
  default: {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import logger from '../../utils/logger';
import PageManager from '../PageManager';

const SYSTEM_CATEGORIES = {
  general:       { label: 'general',       storageLocation: 'pages' },
  system:        { label: 'system',        storageLocation: 'required' },
  documentation: { label: 'documentation', storageLocation: 'required' },
  developer:     { label: 'developer',     storageLocation: 'github' }
};

const uuid = (n: number) => `aaaaaaaa-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe('PageManager.seedRequiredPages() — seeded once per site (#1405)', () => {
  let tmpDir: string;
  let requiredDir: string;
  let pagesDir: string;
  let instanceDir: string;
  let notify: ReturnType<typeof vi.fn>;

  const writeSource = async (n: number, title: string, category?: string, extra: Record<string, unknown> = {}) => {
    const data: Record<string, unknown> = { title, uuid: uuid(n), slug: title.toLowerCase().replace(/\s+/g, '-'), ...extra };
    if (category) data['system-category'] = category;
    await fse.writeFile(path.join(requiredDir, `${uuid(n)}.md`), matter.stringify(`Body of ${title}.\n`, data));
  };

  const makeEngine = () => {
    notify = vi.fn().mockResolvedValue(undefined);
    const cm = {
      getProperty: vi.fn((key: string, def: unknown) => {
        const map: Record<string, unknown> = {
          'ngdpbase.page.enabled': true,
          'ngdpbase.page.provider': 'filesystemprovider',
          'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
          'ngdpbase.page.provider.filesystem.requiredpagesdir': requiredDir,
          'ngdpbase.system-category': SYSTEM_CATEGORIES
        };
        return map[key] !== undefined ? map[key] : def;
      }),
      getResolvedDataPath: vi.fn((key: string, def: unknown) =>
        key === 'ngdpbase.page.provider.filesystem.storagedir' ? pagesDir : def
      ),
      getInstanceDataFolder: vi.fn(() => instanceDir)
    };
    return {
      getManager: vi.fn((name: string) => {
        if (name === 'ConfigurationManager') return cm;
        if (name === 'NotificationManager') return { createNotification: notify };
        return null;
      })
    };
  };

  /** A booted PageManager, seeded the way the engine does at the end of start-up. */
  const boot = async () => {
    const pm = new PageManager(makeEngine());
    await pm.initialize();
    await pm.seedRequiredPages();
    return pm;
  };

  const liveFiles = async () => (await fs.readdir(pagesDir)).filter((f) => f.endsWith('.md')).sort();

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-seed-test-'));
    requiredDir = path.join(tmpDir, 'required-pages');
    pagesDir = path.join(tmpDir, 'slow', 'pages');
    instanceDir = path.join(tmpDir, 'fast');
    await fse.ensureDir(requiredDir);
    await fse.ensureDir(pagesDir);
    await fse.ensureDir(instanceDir);
    vi.mocked(logger.warn).mockClear();
  });

  afterEach(async () => {
    // Scoped to this test's mkdtemp directory — never a project path.
    await fse.remove(tmpDir);
  });

  test('a fresh site gets every required page, stamped with its body hash', async () => {
    await writeSource(1, 'Alpha', 'documentation');
    await writeSource(2, 'Beta', 'system');

    await boot();

    expect(await liveFiles()).toEqual([`${uuid(1)}.md`, `${uuid(2)}.md`]);
    const seeded = matter(await fs.readFile(path.join(pagesDir, `${uuid(1)}.md`), 'utf8'));
    expect(seeded.data[REQUIRED_SOURCE_HASH_KEY]).toBe(pageSourceHash(seeded.content));
    expect(seeded.data['user-modified']).toBeUndefined();
  });

  test('initialize() alone seeds nothing — seeding waits for the end of engine start-up', async () => {
    await writeSource(1, 'Alpha', 'documentation');

    await new PageManager(makeEngine()).initialize();

    expect(await liveFiles()).toEqual([]);
  });

  test('the site records what it seeded, in the instance data folder', async () => {
    await writeSource(1, 'Alpha', 'documentation');

    await boot();

    const record = await fse.readJson(path.join(instanceDir, SEEDED_SHIPPED_PAGES_FILE));
    expect(Object.keys(record.sources['required-pages'])).toEqual([uuid(1)]);
  });

  test('a page new in a release appears at the next start-up', async () => {
    await writeSource(1, 'Alpha', 'documentation');
    await boot();

    await writeSource(2, 'New In Release', 'documentation');
    await boot();

    expect(await liveFiles()).toContain(`${uuid(2)}.md`);
  });

  test('#954: a page removed on the site stays removed — no trash needed', async () => {
    // filesystemprovider deletes outright; only the record remembers the page.
    await writeSource(1, 'Alpha', 'documentation');
    await writeSource(2, 'Beta', 'documentation');
    const pm = await boot();
    expect(await pm.deletePage(uuid(2), { origin: 'test', user: 'admin' })).toBe(true);

    await boot();

    expect(await liveFiles()).toEqual([`${uuid(1)}.md`]);
  });

  test('a page in the trash is not seeded, and is recorded', async () => {
    await writeSource(1, 'Alpha', 'documentation');
    const pm = new PageManager(makeEngine());
    await pm.initialize();
    const provider = (pm as unknown as { provider: { isPageDeleted?: (u: string) => boolean } }).provider;
    provider.isPageDeleted = (u: string) => u === uuid(1);

    const report = await pm.seedShippedPages(
      { id: 'required-pages', label: 'required-pages', dir: requiredDir, stampKey: REQUIRED_SOURCE_HASH_KEY },
      { origin: 'test', user: 'system' }
    );

    expect(report.seeded).toEqual([]);
    expect(report.removed).toEqual(['Alpha']);
    const record = await fse.readJson(path.join(instanceDir, SEEDED_SHIPPED_PAGES_FILE));
    expect(record.sources['required-pages'][uuid(1)]).toBeDefined();
  });

  test('an established site without a record starts it from its live pages and does not rewrite them', async () => {
    await writeSource(1, 'Alpha', 'documentation');
    const livePath = path.join(pagesDir, `${uuid(1)}.md`);
    await fse.writeFile(livePath, matter.stringify('Locally edited body.\n', { title: 'Alpha', uuid: uuid(1), slug: 'alpha' }));

    await boot();

    // Only the #1411 access backfill touches it: the body is the site's own.
    const live = matter(await fs.readFile(livePath, 'utf8'));
    expect(live.content).toContain('Locally edited body.');
    expect(live.data[REQUIRED_SOURCE_HASH_KEY]).toBeUndefined();
    const record = await fse.readJson(path.join(instanceDir, SEEDED_SHIPPED_PAGES_FILE));
    expect(record.sources['required-pages'][uuid(1)]).toBeDefined();
  });

  test('the install marker no longer decides anything: an installed site still gets a new page', async () => {
    await fse.writeFile(path.join(instanceDir, '.install-complete'), '');
    await writeSource(1, 'Alpha', 'documentation');
    await fse.writeFile(path.join(pagesDir, 'existing.md'), '# existing');

    await boot();

    expect(await liveFiles()).toContain(`${uuid(1)}.md`);
  });

  test('github-only pages are never seeded', async () => {
    await writeSource(1, 'Dev Page', 'developer');
    await writeSource(2, 'Docs', 'documentation');

    await boot();

    expect(await liveFiles()).toEqual([`${uuid(2)}.md`]);
  });

  describe('#1408 stamp backfill', () => {
    const livePath = (n: number) => path.join(pagesDir, `${uuid(n)}.md`);
    /** A live copy written before stamps existed: same frontmatter as the source, no stamp. */
    const writeUnstampedLive = async (n: number, title: string, body: string) => {
      await fse.writeFile(livePath(n), matter.stringify(body, {
        title, uuid: uuid(n), slug: title.toLowerCase(), 'system-category': 'documentation', lastModified: '2026-01-01T00:00:00.000Z'
      }));
    };

    test('a live page with no stamp whose text matches the source is stamped, keeping lastModified', async () => {
      await writeSource(1, 'Alpha', 'documentation');
      await writeUnstampedLive(1, 'Alpha', 'Body of Alpha.\n');

      await boot();

      const live = matter(await fs.readFile(livePath(1), 'utf8'));
      expect(live.data[REQUIRED_SOURCE_HASH_KEY]).toBe(pageSourceHash(live.content));
      expect(new Date(live.data.lastModified as string).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    test('a live page with no stamp whose text differs is left unstamped and reported', async () => {
      await writeSource(1, 'Alpha', 'documentation');
      await writeUnstampedLive(1, 'Alpha', 'Edited on this site.\n');

      const pm = new PageManager(makeEngine());
      await pm.initialize();
      const report = await pm.seedShippedPages(pm.requiredPagesSource(), { origin: 'test', user: 'system' });

      expect(report.unstamped).toEqual(['Alpha']);
      expect(report.stamped).toEqual([]);
      const live = matter(await fs.readFile(livePath(1), 'utf8'));
      expect(live.content).toContain('Edited on this site.');
      expect(live.data[REQUIRED_SOURCE_HASH_KEY]).toBeUndefined();
    });

    test('the backfill is one-time: the next start-up stamps nothing', async () => {
      await writeSource(1, 'Alpha', 'documentation');
      await writeUnstampedLive(1, 'Alpha', 'Body of Alpha.\n');
      await boot();

      const pm = new PageManager(makeEngine());
      await pm.initialize();
      const report = await pm.seedShippedPages(pm.requiredPagesSource(), { origin: 'test', user: 'system' });

      expect(report.stamped).toEqual([]);
      expect(report.present).toBe(1);
    });
  });

  describe('#1411 required pages are administrator-edit only', () => {
    const ADMIN_ONLY = { edit: ['admin'] };
    const livePath = (n: number) => path.join(pagesDir, `${uuid(n)}.md`);

    test('a new required page is seeded admin-edit only', async () => {
      await writeSource(1, 'Alpha', 'documentation');
      await writeSource(2, 'Beta', 'system');

      await boot();

      expect(matter(await fs.readFile(livePath(1), 'utf8')).data.access).toEqual(ADMIN_ONLY);
      expect(matter(await fs.readFile(livePath(2), 'utf8')).data.access).toEqual(ADMIN_ONLY);
    });

    test('a source that declares its own access keeps it', async () => {
      await writeSource(1, 'Alpha', 'documentation', { access: { edit: ['editor'] } });

      await boot();

      expect(matter(await fs.readFile(livePath(1), 'utf8')).data.access).toEqual({ edit: ['editor'] });
    });

    test('a live required page with no access gets it once, keeping lastModified', async () => {
      await writeSource(1, 'Alpha', 'documentation');
      await fse.writeFile(livePath(1), matter.stringify('Body of Alpha.\n', {
        title: 'Alpha', uuid: uuid(1), slug: 'alpha', 'system-category': 'documentation', lastModified: '2026-01-01T00:00:00.000Z'
      }));

      await boot();

      const live = matter(await fs.readFile(livePath(1), 'utf8'));
      expect(live.data.access).toEqual(ADMIN_ONLY);
      expect(new Date(live.data.lastModified as string).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    test('an access an operator set on the live page is left alone, by the boot seed and by Sync', async () => {
      await writeSource(1, 'Alpha', 'documentation');
      await fse.writeFile(livePath(1), matter.stringify('Body of Alpha.\n', {
        title: 'Alpha', uuid: uuid(1), slug: 'alpha', 'system-category': 'documentation', access: { edit: ['editor', 'admin'] }
      }));
      const pm = await boot();
      expect(matter(await fs.readFile(livePath(1), 'utf8')).data.access).toEqual({ edit: ['editor', 'admin'] });

      await pm.syncShippedPages(pm.requiredPagesSource(), [uuid(1)], { force: true }, { origin: 'test', user: 'admin' });

      expect(matter(await fs.readFile(livePath(1), 'utf8')).data.access).toEqual({ edit: ['editor', 'admin'] });
    });
  });

  test('#1406 onPresent is called for a page the site holds, and not for a removed one', async () => {
    await writeSource(1, 'Alpha', 'documentation');
    await writeSource(2, 'Beta', 'documentation');
    const pm = await boot();
    await pm.deletePage(uuid(2), { origin: 'test', user: 'admin' });
    const onPresent = vi.fn().mockResolvedValue(undefined);

    await pm.seedShippedPages({ ...pm.requiredPagesSource(), onPresent }, { origin: 'test', user: 'system' });

    expect(onPresent).toHaveBeenCalledTimes(1);
    expect(onPresent.mock.calls[0][1].data.title).toBe('Alpha');
  });

  test('#1406 each failure carries a code the addon seed reports by', async () => {
    await fse.writeFile(path.join(requiredDir, 'a.md'), matter.stringify('x\n', { title: 'No Uuid', slug: 'no-uuid' }));
    await fse.writeFile(path.join(requiredDir, 'b.md'), matter.stringify('x\n', { uuid: uuid(3), slug: 'no-title' }));
    await fse.writeFile(path.join(requiredDir, 'c.md'), matter.stringify('x\n', { uuid: uuid(4), title: 'No Slug' }));
    const pm = new PageManager(makeEngine());
    await pm.initialize();

    const report = await pm.seedShippedPages(pm.requiredPagesSource(), { origin: 'test', user: 'system' });

    expect(report.failed.map((f) => [f.file, f.code])).toEqual([
      ['a.md', 'missing-or-invalid-uuid'],
      ['b.md', 'missing-title'],
      ['c.md', 'missing-slug']
    ]);
  });

  describe('syncShippedPages — the explicit sync behind Required Pages Sync (#1406)', () => {
    const ADMIN = { origin: 'test', user: 'admin' } as never;
    const liveOf = async (n: number) => matter(await fs.readFile(path.join(pagesDir, `${uuid(n)}.md`), 'utf8'));

    test('updates an outdated live page and stamps it', async () => {
      await writeSource(1, 'Alpha', 'documentation');
      const pm = await boot();
      await fse.writeFile(path.join(requiredDir, `${uuid(1)}.md`), matter.stringify('Revised body.\n', { title: 'Alpha', uuid: uuid(1), slug: 'alpha', 'system-category': 'documentation' }));

      const report = await pm.syncShippedPages(pm.requiredPagesSource(), [uuid(1)], {}, ADMIN);

      expect(report.synced).toEqual([uuid(1)]);
      const live = await liveOf(1);
      expect(live.content).toContain('Revised body.');
      expect(live.data[REQUIRED_SOURCE_HASH_KEY]).toBe(pageSourceHash(live.content));
    });

    test('a page edited on the site is protected unless forced', async () => {
      await writeSource(1, 'Alpha', 'documentation');
      const pm = await boot();
      await pm.savePage('Alpha', 'Edited here.', { uuid: uuid(1), slug: 'alpha', 'system-category': 'documentation', [REQUIRED_SOURCE_HASH_KEY]: (await liveOf(1)).data[REQUIRED_SOURCE_HASH_KEY] }, ADMIN);
      await fse.writeFile(path.join(requiredDir, `${uuid(1)}.md`), matter.stringify('Revised body.\n', { title: 'Alpha', uuid: uuid(1), slug: 'alpha', 'system-category': 'documentation' }));

      const plain = await pm.syncShippedPages(pm.requiredPagesSource(), [uuid(1)], {}, ADMIN);
      expect(plain.protected).toEqual([uuid(1)]);
      expect((await liveOf(1)).content).toContain('Edited here.');

      const forced = await pm.syncShippedPages(pm.requiredPagesSource(), [uuid(1)], { force: true }, ADMIN);
      expect(forced.synced).toEqual([uuid(1)]);
      expect((await liveOf(1)).content).toContain('Revised body.');
    });

    test('the user-modified flag protects a page too', async () => {
      await writeSource(1, 'Alpha', 'documentation');
      const pm = await boot();
      await pm.savePage('Alpha', (await liveOf(1)).content, { ...(await liveOf(1)).data, 'user-modified': true }, ADMIN);

      const report = await pm.syncShippedPages(pm.requiredPagesSource(), [uuid(1)], {}, ADMIN);

      expect(report.protected).toEqual([uuid(1)]);
    });

    test('brings back a page removed on the site — the recovery path (decision A)', async () => {
      await writeSource(1, 'Alpha', 'documentation');
      const pm = await boot();
      await pm.deletePage(uuid(1), ADMIN);
      await boot();
      expect(await liveFiles()).toEqual([]);

      const report = await pm.syncShippedPages(pm.requiredPagesSource(), [uuid(1)], {}, ADMIN);

      expect(report.synced).toEqual([uuid(1)]);
      expect(await liveFiles()).toEqual([`${uuid(1)}.md`]);
    });

    test('a page in the trash is restored from the trash, not duplicated beside it (versioning provider)', async () => {
      // Real VersioningFileProvider: the trash only exists there.
      const versioningEngine = () => {
        const engine = makeEngine();
        const cm = engine.getManager('ConfigurationManager') as { getProperty: ReturnType<typeof vi.fn>; getResolvedDataPath: ReturnType<typeof vi.fn> };
        const base = cm.getProperty.getMockImplementation();
        cm.getProperty.mockImplementation((key: string, def: unknown) => {
          if (key === 'ngdpbase.page.provider') return 'versioningfileprovider';
          if (key === 'ngdpbase.page.provider.versioning.indexfile') return path.join(instanceDir, 'page-index.json');
          return base(key, def);
        });
        cm.getResolvedDataPath.mockImplementation((key: string, def: unknown) => {
          if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
          if (key === 'ngdpbase.page.provider.versioning.indexfile') return path.join(instanceDir, 'page-index.json');
          return def;
        });
        return engine;
      };
      await writeSource(1, 'Alpha', 'documentation');
      const pm = new PageManager(versioningEngine());
      await pm.initialize();
      await pm.seedRequiredPages();
      await pm.savePage('Alpha', 'Second version.', { ...(await liveOf(1)).data }, ADMIN);
      expect(await pm.deletePage(uuid(1), ADMIN)).toBe(true);
      const provider = (pm as unknown as { provider: { isPageDeleted(u: string): boolean; getVersionHistory(n: string): Promise<unknown[]> } }).provider;
      expect(provider.isPageDeleted(uuid(1))).toBe(true);

      const report = await pm.syncShippedPages(pm.requiredPagesSource(), [uuid(1)], { force: true }, ADMIN);

      expect(report.synced).toEqual([uuid(1)]);
      expect(provider.isPageDeleted(uuid(1))).toBe(false);
      expect(await fse.pathExists(path.join(pagesDir, 'deleted', `${uuid(1)}.md`))).toBe(false);
      // v1 seed, v2 local edit, v3 the source saved over the restored page
      expect(await provider.getVersionHistory('Alpha')).toHaveLength(3);
    });

    test('a uuid the source does not ship is reported missing', async () => {
      const pm = await boot();

      const report = await pm.syncShippedPages(pm.requiredPagesSource(), [uuid(9)], {}, ADMIN);

      expect(report.missing).toEqual([uuid(9)]);
    });

    test('an addon source writes its addon name and default category', async () => {
      const addonDir = path.join(tmpDir, 'addon-pages');
      await fse.ensureDir(addonDir);
      await fse.writeFile(path.join(addonDir, 'help.md'), matter.stringify('Addon help.\n', { title: 'Addon Help', uuid: uuid(5), slug: 'addon-help' }));
      const pm = await boot();

      const report = await pm.syncShippedPages(pm.addonPagesSource('demo', addonDir), [uuid(5)], {}, ADMIN);

      expect(report.synced).toEqual([uuid(5)]);
      const live = await liveOf(5);
      expect(live.data).toMatchObject({ addon: 'demo', 'system-category': 'addon' });
      expect(live.data['addon-source-hash']).toBe(pageSourceHash(live.content));
    });
  });

  test('a page with no uuid, or a duplicate uuid, is reported and the rest still seed', async () => {
    await writeSource(1, 'Alpha', 'documentation');
    await fse.writeFile(
      path.join(requiredDir, 'zz-copy-of-alpha.md'),
      matter.stringify('Copy.\n', { title: 'Alpha Copy', uuid: uuid(1), slug: 'alpha-copy' })
    );
    await fse.writeFile(path.join(requiredDir, 'no-uuid.md'), matter.stringify('x\n', { title: 'No Uuid', slug: 'no-uuid' }));

    await boot();

    expect(await liveFiles()).toEqual([`${uuid(1)}.md`]);
    const warned = vi.mocked(logger.warn).mock.calls.map((c) => String(c[0])).join('\n');
    expect(warned).toContain('zz-copy-of-alpha.md');
    expect(warned).toContain('no-uuid.md');
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Required pages not seeded' }));
  });
});
