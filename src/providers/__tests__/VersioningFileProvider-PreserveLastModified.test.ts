/**
 * @file VersioningFileProvider-PreserveLastModified.test.ts
 * @description #1325 — a migration can save a page without changing its date.
 *
 * FileSystemProvider already honoured `preserveLastModified` for the page
 * file's frontmatter, but VersioningFileProvider neither passed the option on
 * nor used it for the page index, so a bulk content fix would restamp every
 * page it touched: Recent Changes flooded, date-sorted lists reshuffled.
 */

// Opt out of the global VersioningFileProvider and FileSystemProvider mocks
vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

describe('VersioningFileProvider - preserveLastModified (#1325)', () => {
  let testDir;
  let provider;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `versioning-preserve-lm-test-${Date.now()}`);
    await fs.ensureDir(testDir);
    const indexPath = path.join(testDir, 'data', 'page-index.json');

    const configManager = {
      getProperty: vi.fn((key, defaultValue) => {
        const config = {
          'ngdpbase.page.enabled': true,
          'ngdpbase.page.provider.filesystem.storagedir': path.join(testDir, 'pages'),
          'ngdpbase.page.provider.filesystem.requiredpagesdir': path.join(testDir, 'required-pages'),
          'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
          'ngdpbase.page.provider.filesystem.autosave': true,
          'ngdpbase.page.provider.filesystem.pluralmatching': false,
          'ngdpbase.page.provider.versioning.indexfile': indexPath,
          'ngdpbase.page.provider.versioning.maxversions': 50,
          'ngdpbase.page.provider.versioning.retentiondays': 365,
          'ngdpbase.page.provider.versioning.compression': 'gzip',
          'ngdpbase.page.provider.versioning.deltastorage': true,
          'ngdpbase.page.provider.versioning.checkpointinterval': 10,
          'ngdpbase.page.provider.versioning.cachesize': 50
        };
        return config[key] !== undefined ? config[key] : defaultValue;
      }),
      getResolvedDataPath: vi.fn((key, defaultValue) => {
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexPath;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(testDir, 'pages');
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return path.join(testDir, 'required-pages');
        return defaultValue;
      }),
      getInstanceDataFolder: vi.fn(() => testDir)
    };

    const engine = {
      getManager: vi.fn((name) => (name === 'ConfigurationManager' ? configManager : null))
    };

    provider = new VersioningFileProvider(engine);
    await provider.initialize();
  });

  afterEach(async () => {
    // Only ever removes this test's own temp directory under os.tmpdir().
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  const OLD = '2019-03-04T05:06:07.000Z';

  test('keeps the page date in the file and the index, and still records a version', async () => {
    await provider.savePage('Anthrax', '* a\n** b', { author: 'jim', lastModified: OLD });
    await provider.savePage('Anthrax', '* a\n  - b', { author: 'jim', editor: 'system', lastModified: OLD }, { preserveLastModified: true });

    const page = await provider.getPage('Anthrax');
    expect(page.content).toBe('* a\n  - b');
    expect(page.metadata.lastModified).toBe(OLD);
    expect(provider['pageIndex'].pages[page.uuid].lastModified).toBe(OLD);
    expect(await provider.getCurrentVersion(page.uuid, 'pages')).toBe(2);
  });

  test('without the option a save still stamps now', async () => {
    await provider.savePage('Spin', 'x', { author: 'jim', lastModified: OLD });
    await provider.savePage('Spin', 'y', { author: 'jim', lastModified: OLD });

    const page = await provider.getPage('Spin');
    expect(page.metadata.lastModified).not.toBe(OLD);
    expect(provider['pageIndex'].pages[page.uuid].lastModified).not.toBe(OLD);
  });
});
