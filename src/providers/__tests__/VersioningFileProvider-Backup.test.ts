/**
 * @file VersioningFileProvider-Backup.test.ts
 * @description #1380 — the application backup carries page version history.
 *
 * `FileSystemProvider.backup()` walks pages with the boot-scan walk, which skips
 * every `versions/` directory, so the daily backup held each page's current file
 * and no history. A damaged history could not be restored from it.
 */

// Opt out of the global VersioningFileProvider and FileSystemProvider mocks
vi.unmock('../VersioningFileProvider');
vi.unmock('../../providers/VersioningFileProvider');
vi.unmock('../FileSystemProvider');
vi.unmock('../../providers/FileSystemProvider');

import VersioningFileProvider from '../VersioningFileProvider';
import { TEST_ACTOR } from '../../test-support/actors';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

function makeProvider(testDir: string): VersioningFileProvider {
  const indexPath = path.join(testDir, 'data', 'page-index.json');
  const pagesDir = path.join(testDir, 'pages');
  const requiredDir = path.join(testDir, 'required-pages');
  const configManager = {
    getProperty: vi.fn((key: string, defaultValue: unknown) => {
      const config: Record<string, unknown> = {
        'ngdpbase.page.enabled': true,
        'ngdpbase.page.provider.filesystem.storagedir': pagesDir,
        'ngdpbase.page.provider.filesystem.requiredpagesdir': requiredDir,
        'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
        'ngdpbase.page.provider.versioning.indexfile': indexPath,
        'ngdpbase.page.provider.versioning.maxversions': 50,
        'ngdpbase.page.provider.versioning.checkpointinterval': 10
      };
      return config[key] !== undefined ? config[key] : defaultValue;
    }),
    getResolvedDataPath: vi.fn((key: string, defaultValue: unknown) => {
      if (key === 'ngdpbase.page.provider.versioning.indexfile') return indexPath;
      if (key === 'ngdpbase.page.provider.filesystem.storagedir') return pagesDir;
      if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return requiredDir;
      return defaultValue;
    }),
    getInstanceDataFolder: vi.fn(() => testDir)
  };
  const engine = { getManager: vi.fn((name: string) => (name === 'ConfigurationManager' ? configManager : null)) };
  return new VersioningFileProvider(engine);
}

describe('VersioningFileProvider - backup carries version history (#1380)', () => {
  let testDir: string;
  let provider: VersioningFileProvider;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `versioning-backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(testDir);
    provider = makeProvider(testDir);
    await provider.initialize();
  });

  afterEach(async () => {
    // Only ever removes this test's own temp directory under os.tmpdir().
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  test('backup includes every file of a page history', async () => {
    await provider.savePage('Metrics', 'first body', { author: 'jim' });
    await provider.savePage('Metrics', 'second body', { author: 'jim' });
    const uuid = (await provider.getPage('Metrics'))!.metadata.uuid as string;

    const backup = await provider.backup();

    const paths = backup.versions!.map((f) => f.relativePath).sort();
    expect(paths).toEqual([
      path.join(uuid, 'manifest.json'),
      path.join(uuid, 'v1', 'content.md'),
      path.join(uuid, 'v2', 'content.diff')
    ]);
    const onDisk = await fs.readFile(path.join(testDir, 'pages', 'versions', uuid, 'manifest.json'), 'utf8');
    expect(backup.versions!.find((f) => f.relativePath.endsWith('manifest.json'))!.content).toBe(onDisk);
  });

  test('restore brings a lost history back and the page lists its versions', async () => {
    await provider.savePage('Metrics', 'first body', { author: 'jim' });
    await provider.savePage('Metrics', 'second body', { author: 'jim' });
    const uuid = (await provider.getPage('Metrics'))!.metadata.uuid as string;
    const backup = JSON.parse(JSON.stringify(await provider.backup()));

    await fs.remove(path.join(testDir, 'pages', 'versions', uuid));
    await provider.restore(backup);

    const versions = await provider.getVersionHistory('Metrics', TEST_ACTOR);
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(await provider.getPageVersion('Metrics', 1, TEST_ACTOR)).toMatchObject({ content: 'first body' });
  });

  test('restore refuses a path that leaves the versions folder', async () => {
    const backup = JSON.parse(JSON.stringify(await provider.backup()));
    backup.versions = [{ relativePath: path.join('..', '..', 'escaped.txt'), content: 'x', size: 1 }];

    await provider.restore(backup);

    expect(await fs.pathExists(path.join(testDir, 'escaped.txt'))).toBe(false);
  });

  test('a backup made before #1380 (no versions field) still restores', async () => {
    await provider.savePage('Metrics', 'first body', { author: 'jim' });
    const backup = JSON.parse(JSON.stringify(await provider.backup()));
    delete backup.versions;
    delete backup.requiredPagesVersions;

    await expect(provider.restore(backup)).resolves.toBeUndefined();
  });
});
