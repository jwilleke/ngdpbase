/**
 * @file VersioningFileProvider-SoftDelete.test.ts
 * @description #947 — deleting a page must be recoverable in-app.
 *
 * Before #947 a delete removed the page file, the entire version directory AND
 * the index entry, so nothing in the app could find or restore it. These tests
 * pin the replacement contract: the versions survive, the page disappears from
 * every live lookup, and restore brings both back.
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
import DeltaStorage from '../../utils/DeltaStorage';

describe('VersioningFileProvider - soft delete (#947)', () => {
  let testDir;
  let engine;
  let configManager;
  let provider;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = path.join(os.tmpdir(), `versioning-provider-test-${Date.now()}`);
    await fs.ensureDir(testDir);

    const indexPath = path.join(testDir, 'data', 'page-index.json');

    // Create mock engine and ConfigurationManager
    configManager = {
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
        if (key === 'ngdpbase.page.provider.versioning.indexfile') {
          return path.join(testDir, 'data', 'page-index.json');
        }
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') {
          return path.join(testDir, 'pages');
        }
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') {
          return path.join(testDir, 'required-pages');
        }
        return defaultValue;
      }),
      getInstanceDataFolder: vi.fn(() => testDir)
    };

    engine = {
      getManager: vi.fn((managerName) => {
        if (managerName === 'ConfigurationManager') {
          return configManager;
        }
        return null;
      })
    };

    // Create provider instance
    provider = new VersioningFileProvider(engine);
  });

  afterEach(async () => {
    // Only ever removes this test's own temp directory under os.tmpdir().
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  const seedPage = async (title = 'Doomed Page') => {
    await provider.initialize();
    await provider.savePage(title, 'v1 content', { author: 'jim' });
    await provider.savePage(title, 'v2 content', { author: 'jim' });
    await provider.savePage(title, 'v3 content', { author: 'jim' });
    const page = await provider.getPage(title);
    return { uuid: page.uuid, title };
  };

  test('version history SURVIVES a delete (the #947 regression)', async () => {
    const { uuid, title } = await seedPage();
    const versionDir = provider._getVersionDirectory(uuid, 'pages');

    expect(await provider.getVersionHistory(title)).toHaveLength(3);

    await provider.deletePage(title, 'jim');

    // The old implementation did fs.remove(versionDir) right here.
    expect(await fs.pathExists(versionDir)).toBe(true);
    expect((await fs.readdir(versionDir)).sort()).toEqual(['manifest.json', 'v1', 'v2', 'v3']);
  });

  test('the deleted page is invisible to every live lookup', async () => {
    const { uuid, title } = await seedPage();
    await provider.deletePage(title, 'jim');

    expect(await provider.getPage(title)).toBeNull();
    expect(await provider.getPage(uuid)).toBeNull();
    expect(provider.pageExists(title)).toBe(false);
    expect(provider['pageIndex'].pages[uuid]).toBeUndefined();
  });

  test('the page file is MOVED, not deleted, and out of the boot scan path', async () => {
    const { uuid, title } = await seedPage();
    const originalPath = path.join(testDir, 'pages', `${uuid}.md`);
    expect(await fs.pathExists(originalPath)).toBe(true);

    await provider.deletePage(title, 'jim');

    expect(await fs.pathExists(originalPath)).toBe(false);
    expect(await fs.pathExists(path.join(testDir, 'pages', 'deleted', `${uuid}.md`))).toBe(true);
  });

  test('a tombstoned page does NOT come back after a provider reload', async () => {
    // The reason the file has to move: initialize() rebuilds caches from disk.
    const { uuid, title } = await seedPage();
    await provider.deletePage(title, 'jim');

    const reloaded = new VersioningFileProvider(engine);
    await reloaded.initialize();

    expect(await reloaded.getPage(title)).toBeNull();
    expect(reloaded['pageIndex'].pages[uuid]).toBeUndefined();
    expect(reloaded['pageIndex'].deletedPages[uuid]).toBeDefined();
  });

  test('the tombstone records who deleted it and when', async () => {
    const { uuid, title } = await seedPage();
    const before = Date.now();
    await provider.deletePage(title, 'alice');

    const tomb = provider['pageIndex'].deletedPages[uuid];
    expect(tomb.deletedBy).toBe('alice');
    expect(tomb.title).toBe(title);
    expect(new Date(tomb.deletedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(tomb.deletedFrom).toContain(`${uuid}.md`);
  });

  test('deletedBy defaults to unknown when no user is supplied', async () => {
    const { uuid, title } = await seedPage();
    await provider.deletePage(title);
    expect(provider['pageIndex'].deletedPages[uuid].deletedBy).toBe('unknown');
  });

  test('getDeletedPages lists tombstones newest first', async () => {
    await provider.initialize();
    await provider.savePage('First', 'a', { author: 'jim' });
    await provider.savePage('Second', 'b', { author: 'jim' });
    const firstUuid = (await provider.getPage('First')).uuid;
    await provider.deletePage('First', 'jim');
    await provider.deletePage('Second', 'jim');

    // Backdate explicitly. Both deletes land in the same millisecond often
    // enough that asserting on wall-clock order alone is a flake — it passed
    // in isolation and failed in the full suite.
    provider['pageIndex'].deletedPages[firstUuid].deletedAt =
      new Date(Date.now() - 60_000).toISOString();

    expect(provider.getDeletedPages().map((e) => e.title)).toEqual(['Second', 'First']);
  });

  test('same-millisecond deletions sort deterministically by title', async () => {
    await provider.initialize();
    await provider.savePage('Bravo', 'a', { author: 'jim' });
    await provider.savePage('Alpha', 'b', { author: 'jim' });
    await provider.deletePage('Bravo', 'jim');
    await provider.deletePage('Alpha', 'jim');

    const stamp = new Date().toISOString();
    for (const entry of Object.values(provider['pageIndex'].deletedPages)) {
      entry.deletedAt = stamp;
    }

    expect(provider.getDeletedPages().map((e) => e.title)).toEqual(['Alpha', 'Bravo']);
  });

  test('restore brings back the page AND its history', async () => {
    const { uuid, title } = await seedPage();
    await provider.deletePage(title, 'jim');

    const result = await provider.restoreDeletedPage(uuid);
    expect(result).toEqual({ ok: true, title });

    const page = await provider.getPage(title);
    expect(page).not.toBeNull();
    expect(page.content).toContain('v3 content');
    expect(await provider.getVersionHistory(title)).toHaveLength(3);
    expect(provider['pageIndex'].pages[uuid]).toBeDefined();
    expect(provider['pageIndex'].deletedPages[uuid]).toBeUndefined();
  });

  test('a restored page is resolvable by uuid without a reload', async () => {
    const { uuid, title } = await seedPage();
    await provider.deletePage(title, 'jim');
    await provider.restoreDeletedPage(uuid);

    expect(await provider.getPage(uuid)).not.toBeNull();
    expect(provider.pageExists(title)).toBe(true);
  });

  test('restore refuses when the title was reclaimed by a live page', async () => {
    // The edge that makes silent restore dangerous: nothing stops a new page
    // taking the title while the old one sits in the trash.
    const { uuid, title } = await seedPage();
    await provider.deletePage(title, 'jim');
    await provider.savePage(title, 'a different page now', { author: 'bob' });

    const result = await provider.restoreDeletedPage(uuid);
    expect(result).toEqual({ ok: false, reason: 'title-conflict', detail: title });

    // And it changed nothing.
    expect(provider['pageIndex'].deletedPages[uuid]).toBeDefined();
    expect((await provider.getPage(title)).content).toContain('a different page now');
  });

  test('restore reports not-found for an unknown uuid', async () => {
    await provider.initialize();
    expect(await provider.restoreDeletedPage('no-such-uuid')).toEqual({ ok: false, reason: 'not-found' });
  });

  test('purge is the ONLY path that destroys versions', async () => {
    const { uuid, title } = await seedPage();
    const versionDir = provider._getVersionDirectory(uuid, 'pages');
    await provider.deletePage(title, 'jim');

    expect(await provider.purgeDeletedPage(uuid)).toBe(true);

    expect(await fs.pathExists(versionDir)).toBe(false);
    expect(await fs.pathExists(path.join(testDir, 'pages', 'deleted', `${uuid}.md`))).toBe(false);
    expect(provider['pageIndex'].deletedPages[uuid]).toBeUndefined();
    expect(await provider.restoreDeletedPage(uuid)).toEqual({ ok: false, reason: 'not-found' });
  });

  test('retention purge removes tombstones past the window and keeps fresh ones', async () => {
    await provider.initialize();
    await provider.savePage('Old', 'a', { author: 'jim' });
    await provider.savePage('Fresh', 'b', { author: 'jim' });
    const oldUuid = (await provider.getPage('Old')).uuid;
    const freshUuid = (await provider.getPage('Fresh')).uuid;

    await provider.deletePage('Old', 'jim');
    await provider.deletePage('Fresh', 'jim');

    // Backdate one tombstone past the 30-day default.
    provider['pageIndex'].deletedPages[oldUuid].deletedAt =
      new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();

    expect(await provider.purgeExpiredDeletedPages()).toBe(1);
    expect(provider['pageIndex'].deletedPages[oldUuid]).toBeUndefined();
    expect(provider['pageIndex'].deletedPages[freshUuid]).toBeDefined();
  });

  test('retention of 0 keeps tombstones forever', async () => {
    const { uuid, title } = await seedPage();
    await provider.deletePage(title, 'jim');
    provider['deleteRetentionDays'] = 0;
    provider['pageIndex'].deletedPages[uuid].deletedAt = new Date(0).toISOString();

    expect(await provider.purgeExpiredDeletedPages()).toBe(0);
    expect(provider['pageIndex'].deletedPages[uuid]).toBeDefined();
  });
});
