/**
 * Live pages live in the instance's pages directory — issue #1371 (epic #1373)
 *
 * A category with `storageLocation: required` (system, documentation) says the
 * page's SOURCE is the GitHub required-pages set. The provider read it as "store
 * this page in the required-pages folder": saves recorded `location:
 * required-pages`, and the version history and deleted records went into that
 * folder — the git working tree on jimstest — while the page file itself stayed
 * in the pages directory. After a restart, fast init built the path from the
 * recorded location and the page 404'd.
 */

vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';
import { TEST_ACTOR, actor } from '../../test-support/actors';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('required-category pages are stored like any other page (#1371)', () => {
  let testDir: string;
  let pagesDir: string;
  let requiredDir: string;
  let indexPath: string;
  let engine: { getManager: (name: string) => unknown };

  const config = (): Record<string, unknown> => ({
    'ngdpbase.page.enabled': true,
    'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
    'ngdpbase.page.provider.filesystem.requiredpagesdir': requiredDir,
    'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
    'ngdpbase.page.provider.versioning.indexfile': indexPath,
    'ngdpbase.page.provider.versioning.deltastorage': true,
    'ngdpbase.page.provider.versioning.compression': 'none',
    'ngdpbase.system-category': {
      general: { label: 'general', storageLocation: 'regular' },
      documentation: { label: 'documentation', storageLocation: 'required' },
      system: { label: 'system', storageLocation: 'required' }
    }
  });

  const newProvider = async (): Promise<VersioningFileProvider> => {
    const p = new VersioningFileProvider(engine);
    await p.initialize();
    return p;
  };

  const readIndex = async () => JSON.parse(await fs.readFile(indexPath, 'utf8'));

  const writePage = async (dir: string, uuid: string, title: string, body: string, category = 'documentation') => {
    await fs.ensureDir(dir);
    await fs.writeFile(
      path.join(dir, `${uuid}.md`),
      `---\ntitle: '${title}'\nuuid: ${uuid}\nsystem-category: ${category}\nauthor: jim\n---\n${body}\n`
    );
  };

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `vfp-required-location-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    pagesDir = path.join(testDir, 'pages');
    requiredDir = path.join(testDir, 'required-pages');
    indexPath = path.join(testDir, 'data', 'page-index.json');
    await fs.ensureDir(testDir);
    const configManager = {
      getProperty: vi.fn((key: string, def: unknown) => (config()[key] !== undefined ? config()[key] : def)),
      getResolvedDataPath: vi.fn((key: string, def: unknown) => {
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexPath;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return requiredDir;
        return def;
      }),
      getInstanceDataFolder: vi.fn(() => testDir)
    };
    engine = { getManager: vi.fn((name: string) => (name === 'ConfigurationManager' ? configManager : null)) };
  });

  afterEach(async () => {
    await fs.remove(testDir); // this test's own temp dir only
  });

  test('a documentation page saves with location pages and its history in the pages directory', async () => {
    const provider = await newProvider();
    await provider.savePage('Metrics', 'v1 text', { uuid: UUID_A, 'system-category': 'documentation' }, TEST_ACTOR);

    expect((await readIndex()).pages[UUID_A].location).toBe('pages');
    expect(await fs.pathExists(path.join(pagesDir, 'versions', UUID_A, 'manifest.json'))).toBe(true);
    expect(await fs.pathExists(path.join(requiredDir, 'versions', UUID_A))).toBe(false);
    expect(await fs.pathExists(path.join(pagesDir, `${UUID_A}.md`))).toBe(true);
  });

  test('saving a page recorded as required-pages moves its history into the pages directory, continuing it', async () => {
    const provider = await newProvider();
    await provider.savePage('Metrics', 'v1 text', { uuid: UUID_A, 'system-category': 'documentation' }, TEST_ACTOR);
    // Reproduce a pre-fix page: history in the required-pages folder, entry says so.
    await fs.move(path.join(pagesDir, 'versions', UUID_A), path.join(requiredDir, 'versions', UUID_A));
    const index = await readIndex();
    index.pages[UUID_A].location = 'required-pages';
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));

    const restarted = await newProvider();
    await restarted.savePage('Metrics', 'v2 text', { uuid: UUID_A, 'system-category': 'documentation' }, TEST_ACTOR);

    expect((await readIndex()).pages[UUID_A].location).toBe('pages');
    expect(await fs.pathExists(path.join(requiredDir, 'versions', UUID_A))).toBe(false);
    const manifest = JSON.parse(await fs.readFile(path.join(pagesDir, 'versions', UUID_A, 'manifest.json'), 'utf8'));
    expect(manifest.versions.map((v: { version: number }) => v.version)).toEqual([1, 2]);
  });

  test('a history already in the pages directory is never overwritten by one from the required-pages folder', async () => {
    const provider = await newProvider();
    await provider.savePage('Metrics', 'v1 text', { uuid: UUID_A, 'system-category': 'documentation' }, TEST_ACTOR);
    await fs.copy(path.join(pagesDir, 'versions', UUID_A), path.join(requiredDir, 'versions', UUID_A));
    await fs.writeFile(path.join(requiredDir, 'versions', UUID_A, 'marker.txt'), 'the other history');
    const index = await readIndex();
    index.pages[UUID_A].location = 'required-pages';
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));

    const restarted = await newProvider();
    await restarted.savePage('Metrics', 'v2 text', { uuid: UUID_A, 'system-category': 'documentation' }, TEST_ACTOR);

    expect(await fs.pathExists(path.join(requiredDir, 'versions', UUID_A, 'marker.txt'))).toBe(true);
    expect(await fs.pathExists(path.join(pagesDir, 'versions', UUID_A, 'marker.txt'))).toBe(false);
  });

  test('deleting a system page puts its record in the pages trash, not the required-pages folder', async () => {
    const provider = await newProvider();
    await provider.savePage('Site Configuration', 'text', { uuid: UUID_A, 'system-category': 'system' }, TEST_ACTOR);

    expect(await provider.deletePage('Site Configuration', actor('admin'))).toBe(true);

    expect(await fs.pathExists(path.join(requiredDir, 'deleted'))).toBe(false);
    const trashed = (await fs.readdir(pagesDir, { recursive: true }) as string[]).filter((f) => f.endsWith(`${UUID_A}.md`));
    expect(trashed.some((f) => f.includes('deleted'))).toBe(true);
  });

  test('after a restart, a stale required-pages entry whose file is in the pages directory still opens', async () => {
    const provider = await newProvider();
    await provider.savePage('Agent Token Check', 'Created by a delegated token.', { uuid: UUID_A, 'system-category': 'documentation' }, TEST_ACTOR);
    const index = await readIndex();
    index.pages[UUID_A].location = 'required-pages';
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));

    const restarted = await newProvider();
    const page = await restarted.getPage('Agent Token Check');

    expect(page?.content).toContain('Created by a delegated token.');
  });

  test('for a required-pages entry, the live copy wins over the source copy when both exist', async () => {
    const provider = await newProvider();
    await provider.savePage('Recent Changes', 'the live copy', { uuid: UUID_A, 'system-category': 'system' }, TEST_ACTOR);
    await writePage(requiredDir, UUID_A, 'Recent Changes', 'the source copy', 'system');
    const index = await readIndex();
    index.pages[UUID_A].location = 'required-pages';
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));

    const restarted = await newProvider();
    expect((await restarted.getPage('Recent Changes'))?.content).toContain('the live copy');
  });

  test('a live copy in the pages directory wins over an unindexed copy in the required-pages folder', async () => {
    const provider = await newProvider();
    await provider.savePage('Other Page', 'x', { uuid: UUID_A, 'system-category': 'general' }, TEST_ACTOR);
    await writePage(requiredDir, UUID_B, 'Test Page: Tables', 'the source copy', 'system');
    await writePage(pagesDir, UUID_B, 'Test Page: Tables', 'the live copy', 'system');

    const restarted = await newProvider();
    const page = await restarted.getPage('Test Page: Tables');

    expect(page?.content).toContain('the live copy');
  });

  // #1374: Rebuild Pages rewrites page-index.json from the disk scan.
  describe('rebuildPageIndexFromDisk (#1374)', () => {
    const UUID_C = '33333333-3333-4333-8333-333333333333';
    const PROBE = 'aa11bb22-cc33-dd44-ee55-ff6677889900';

    test('corrects stale locations, drops entries with no file, adds unindexed pages, and survives a restart', async () => {
      const provider = await newProvider();
      await provider.savePage('Agent Token Check', 'token text', { uuid: UUID_A, 'system-category': 'documentation' }, TEST_ACTOR);
      await provider.savePage('Diary', 'secret', { uuid: UUID_B, private: true, author: 'molly' }, TEST_ACTOR);
      // A stale location, an index-only probe, and a page on disk the index never heard of.
      const index = await readIndex();
      index.pages[UUID_A].location = 'required-pages';
      index.pages[PROBE] = { title: 'Reseed Probe', uuid: PROBE, filename: `${PROBE}.md`, location: 'pages', currentVersion: 1, lastModified: '2026-07-22T00:00:00.000Z', editor: 'x', hasVersions: true };
      index.pageCount = Object.keys(index.pages).length;
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
      await writePage(pagesDir, UUID_C, 'Synced Page', 'written around the provider', 'system');

      const restarted = await newProvider();
      await restarted.refreshPageList();
      const result = await restarted.rebuildPageIndexFromDisk();

      const rebuilt = await readIndex();
      expect(rebuilt.pages[UUID_A].location).toBe('pages');
      expect(rebuilt.pages[UUID_B]).toMatchObject({ location: 'private', creator: 'molly' });
      expect(rebuilt.pages[UUID_C]).toMatchObject({ title: 'Synced Page', location: 'pages', filename: `${UUID_C}.md` });
      expect(rebuilt.pages[PROBE]).toBeUndefined();
      expect(result.removed).toEqual(['Reseed Probe']);
      expect(rebuilt.pageCount).toBe(3);

      const again = await newProvider();
      expect((await again.getPage('Agent Token Check'))?.content).toContain('token text');
      expect(await again.getPage('Reseed Probe')).toBeNull();
    });

    test('a page whose history is still only in the required-pages folder keeps that location, so its history stays reachable', async () => {
      const provider = await newProvider();
      await provider.savePage('Metrics', 'v1 text', { uuid: UUID_A, 'system-category': 'documentation' }, TEST_ACTOR);
      await provider.savePage('Metrics', 'v2 text', { uuid: UUID_A, 'system-category': 'documentation' }, TEST_ACTOR);
      await fs.move(path.join(pagesDir, 'versions', UUID_A), path.join(requiredDir, 'versions', UUID_A));

      const restarted = await newProvider();
      await restarted.refreshPageList();
      const result = await restarted.rebuildPageIndexFromDisk();

      const entry = (await readIndex()).pages[UUID_A];
      expect(entry.location).toBe('required-pages');
      expect(entry.currentVersion).toBe(2);
      expect(result.historyInRequiredPages).toBe(1);
    });

    test('an entry whose file is on disk but was not scanned (duplicate title) is kept', async () => {
      const provider = await newProvider();
      await provider.savePage('Speed', 'first', { uuid: UUID_A }, TEST_ACTOR);
      const index = await readIndex();
      await writePage(pagesDir, UUID_B, 'Speed', 'the duplicate', 'general');
      // Newer than UUID_A, so the boot-time duplicate check (#587) keeps this entry
      // and drops A's; the disk scan then loads A's file (first wins) and skips B's.
      index.pages[UUID_B] = { title: 'Speed', uuid: UUID_B, filename: `${UUID_B}.md`, location: 'pages', currentVersion: 0, lastModified: '2099-01-01T00:00:00.000Z', editor: 'x', hasVersions: false };
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2));

      const restarted = await newProvider();
      await restarted.refreshPageList();
      const result = await restarted.rebuildPageIndexFromDisk();

      expect(result.removed).toEqual([]);
      expect(Object.keys((await readIndex()).pages)).toEqual(expect.arrayContaining([UUID_A, UUID_B]));
    });
  });
});
