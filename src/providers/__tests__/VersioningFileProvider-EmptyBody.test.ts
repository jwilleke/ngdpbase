/**
 * @file VersioningFileProvider-EmptyBody.test.ts
 * @description #1328 — a page can be created with an empty body.
 *
 * The journal addon created new entries with a body of a single space, because
 * WikiContext coerced '' to null and the save crashed. The author then typed
 * after that space, so a first-line heading was stored as ` # heading`. With
 * WikiContext keeping '', the provider has to accept an empty body and let the
 * next save replace it — which is what this pins.
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

describe('VersioningFileProvider - empty page body (#1328)', () => {
  let testDir;
  let provider;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `versioning-empty-body-test-${Date.now()}`);
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

  test('creates a page whose body is empty', async () => {
    await provider.savePage('2026-09-10-1-journal-jim', '', { author: 'jim', 'system-category': 'journal' });

    const page = await provider.getPage('2026-09-10-1-journal-jim');
    expect(page).not.toBeNull();
    expect(page.content).toBe('');
    expect(page.metadata['system-category']).toBe('journal');
  });

  test('a later save replaces the empty body with exactly what was typed', async () => {
    await provider.savePage('2026-09-10-1-journal-jim', '', { author: 'jim' });
    await provider.savePage('2026-09-10-1-journal-jim', '# Furnace Motor\nIt made the sound again.', { author: 'jim' });

    const page = await provider.getPage('2026-09-10-1-journal-jim');
    expect(page.content.startsWith('# Furnace Motor')).toBe(true);
  });
});
