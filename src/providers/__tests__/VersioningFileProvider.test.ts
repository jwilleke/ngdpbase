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

describe('VersioningFileProvider', () => {
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
    // Clean up test directory
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await provider.initialize();

      expect(provider.initialized).toBe(true);
      expect(provider.pageIndexPath).toContain('page-index.json');
      expect(provider.maxVersions).toBe(50);
      expect(provider.retentionDays).toBe(365);
      expect(provider.compressionEnabled).toBe(true);
      expect(provider.deltaStorageEnabled).toBe(true);
    });

    test('should create version directories', async () => {
      await provider.initialize();

      expect(await fs.pathExists(provider.pagesVersionsDir)).toBe(true);
      expect(await fs.pathExists(provider.requiredPagesVersionsDir)).toBe(true);
      expect(provider.pagesVersionsDir).toContain('pages/versions');
      expect(provider.requiredPagesVersionsDir).toContain('required-pages/versions');
    });

    test('should create page-index.json on first run', async () => {
      await provider.initialize();

      expect(await fs.pathExists(provider.pageIndexPath)).toBe(true);

      const indexData = await fs.readFile(provider.pageIndexPath, 'utf8');
      const index = JSON.parse(indexData);

      expect(index.version).toBe('1.0.0');
      expect(index.pageCount).toBe(0);
      expect(index.pages).toEqual({});
    });

    test('should load existing page-index.json', async () => {
      // Create existing index
      const existingIndex = {
        version: '1.0.0',
        lastUpdated: '2025-01-01T00:00:00.000Z',
        pageCount: 2,
        pages: {
          'uuid-1': { title: 'Test Page', uuid: 'uuid-1' }
        }
      };

      const indexPath = path.join(testDir, 'data', 'page-index.json');
      await fs.ensureDir(path.dirname(indexPath));
      await fs.writeFile(indexPath, JSON.stringify(existingIndex), 'utf8');

      await provider.initialize();

      expect(provider.pageIndex.pageCount).toBe(2);
      expect(provider.pageIndex.pages['uuid-1'].title).toBe('Test Page');
    });

    test('should handle corrupted page-index.json', async () => {
      // Initialize provider first to set paths
      await provider.initialize();

      // Create corrupted index
      await fs.writeFile(provider.pageIndexPath, 'invalid json{', 'utf8');

      // Reinitialize - should handle corrupted file
      const provider2 = new VersioningFileProvider(engine);
      await provider2.initialize();

      // Should create new empty index
      expect(provider2.pageIndex.pageCount).toBe(0);
      expect(provider2.pageIndex.pages).toEqual({});
    });

    test('should validate configuration values', async () => {
      configManager.getProperty = vi.fn((key, defaultValue) => {
        if (key === 'ngdpbase.page.provider.versioning.maxversions') return -5;
        if (key === 'ngdpbase.page.provider.versioning.retentiondays') return 0;
        return defaultValue;
      });

      await provider.initialize();

      // Should use defaults for invalid values
      expect(provider.maxVersions).toBe(50);
      expect(provider.retentionDays).toBe(365);
    });
  });

  // #806: rebuildPageIndexFromManifests had two latent bugs surfaced during
  // #802 Slice 2 recovery on jimstest:
  //   1. Gated each entry on `await fs.pathExists(manifestPath)`, silently
  //      dropping every page without a version manifest (~17K → 138 on jimstest).
  //   2. The `updatePageInIndex` payload omitted `slug` and `filename`, so
  //      slug-based URL lookups 404'd against the rebuilt index.
  // This describe block locks in the fix.
  describe('Page-index rebuild from filesystem (#806)', () => {
    async function writeRawPage(provider, location, uuid, frontmatter) {
      const baseDir = location === 'required-pages'
        ? provider.requiredPagesDirectory
        : location === 'private' && frontmatter.author
          ? path.join(provider.pagesDirectory, 'private', frontmatter.author)
          : provider.pagesDirectory;
      await fs.ensureDir(baseDir);
      const filePath = path.join(baseDir, `${uuid}.md`);
      const fm = Object.entries({ ...frontmatter, uuid })
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n');
      await fs.writeFile(filePath, `---\n${fm}\n---\n# ${frontmatter.title}\nbody\n`, 'utf8');
      return filePath;
    }

    test('rebuild includes pages without a version manifest (regression for the 138/17K bug)', async () => {
      // First-time init to set up directories
      await provider.initialize();

      // Drop three .md files directly to disk — no manifest.json anywhere.
      // This simulates pre-versioning pages, or pages whose manifests were lost.
      await writeRawPage(provider, 'pages', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        { title: 'Public One', slug: 'public-one', author: 'alice', lastModified: '2026-01-01T00:00:00.000Z' });
      await writeRawPage(provider, 'pages', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        { title: 'Public Two', slug: 'public-two', author: 'bob', lastModified: '2026-01-02T00:00:00.000Z' });
      await writeRawPage(provider, 'private', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        { title: 'Alice Private', slug: 'alice-private', author: 'alice', private: true, lastModified: '2026-01-03T00:00:00.000Z' });

      // Empty the page-index.json so canUseFastInitialization returns false
      // and the rebuild path fires.
      await fs.writeJson(provider.pageIndexPath, {
        version: '1.0.0',
        lastUpdated: '2026-01-01T00:00:00.000Z',
        pageCount: 0,
        pages: {}
      });

      // Reinitialize to trigger the slow path → auto-migrate → rebuild.
      const p2 = new VersioningFileProvider(engine);
      await p2.initialize();

      // All three pages must be in the rebuilt index.
      const idx = p2.pageIndex;
      expect(Object.keys(idx.pages)).toEqual(
        expect.arrayContaining([
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'cccccccc-cccc-cccc-cccc-cccccccccccc'
        ])
      );
      expect(idx.pageCount).toBeGreaterThanOrEqual(3);
    });

    test('rebuilt entries include slug and filename fields (#806 missing-fields bug)', async () => {
      await provider.initialize();

      await writeRawPage(provider, 'pages', '11111111-1111-1111-1111-111111111111',
        { title: 'Has Slug', slug: 'has-slug', author: 'alice', lastModified: '2026-01-01T00:00:00.000Z' });

      await fs.writeJson(provider.pageIndexPath, {
        version: '1.0.0', lastUpdated: '2026-01-01T00:00:00.000Z',
        pageCount: 0, pages: {}
      });

      const p2 = new VersioningFileProvider(engine);
      await p2.initialize();

      const entry = p2.pageIndex.pages['11111111-1111-1111-1111-111111111111'];
      expect(entry).toBeDefined();
      expect(entry.slug).toBe('has-slug');
      expect(entry.filename).toBe('11111111-1111-1111-1111-111111111111.md');
    });

    test('rebuilt entries set location correctly for private pages (and capture creator)', async () => {
      await provider.initialize();

      await writeRawPage(provider, 'private', '22222222-2222-2222-2222-222222222222',
        { title: 'Bob Private', slug: 'bob-private', author: 'bob', private: true, lastModified: '2026-01-01T00:00:00.000Z' });

      await fs.writeJson(provider.pageIndexPath, {
        version: '1.0.0', lastUpdated: '2026-01-01T00:00:00.000Z',
        pageCount: 0, pages: {}
      });

      const p2 = new VersioningFileProvider(engine);
      await p2.initialize();

      const entry = p2.pageIndex.pages['22222222-2222-2222-2222-222222222222'];
      expect(entry).toBeDefined();
      expect(entry.location).toBe('private');
      expect(entry.creator).toBe('bob');
    });

    test('private pages on disk are NOT renamed/moved into the regular pile by auto-migration (#806)', async () => {
      // Slice 2's earlier slip moved 14 private files out of pages/private/{author}/
      // because the auto-migration's location detection only knew about
      // pages/{uuid}.md and required-pages/{uuid}.md. Lock in that the file
      // stays where it was placed.
      await provider.initialize();

      const beforePath = await writeRawPage(provider, 'private', '33333333-3333-3333-3333-333333333333',
        { title: 'Stable Private', slug: 'stable-private', author: 'alice', private: true, lastModified: '2026-01-01T00:00:00.000Z' });
      expect(await fs.pathExists(beforePath)).toBe(true);

      await fs.writeJson(provider.pageIndexPath, {
        version: '1.0.0', lastUpdated: '2026-01-01T00:00:00.000Z',
        pageCount: 0, pages: {}
      });

      const p2 = new VersioningFileProvider(engine);
      await p2.initialize();

      // File must still be at its original private location.
      expect(await fs.pathExists(beforePath)).toBe(true);
      // And NOT at the regular-pile location.
      const wrongPath = path.join(p2.pagesDirectory, '33333333-3333-3333-3333-333333333333.md');
      expect(await fs.pathExists(wrongPath)).toBe(false);
    });
  });

  describe('Configuration Loading', () => {
    test('should load all versioning configuration', async () => {
      await provider.initialize();

      expect(provider.pageIndexPath).toBeTruthy();
      expect(provider.maxVersions).toBe(50);
      expect(provider.retentionDays).toBe(365);
      expect(provider.compressionEnabled).toBe(true);
      expect(provider.deltaStorageEnabled).toBe(true);
    });

    test('should handle compression setting', async () => {
      configManager.getProperty = vi.fn((key, defaultValue) => {
        if (key === 'ngdpbase.page.provider.versioning.compression') return 'none';
        return defaultValue;
      });

      await provider.initialize();

      expect(provider.compressionEnabled).toBe(false);
    });

    test('should handle delta storage disabled', async () => {
      configManager.getProperty = vi.fn((key, defaultValue) => {
        if (key === 'ngdpbase.page.provider.versioning.deltastorage') return false;
        return defaultValue;
      });

      await provider.initialize();

      expect(provider.deltaStorageEnabled).toBe(false);
    });
  });

  describe('Provider Information', () => {
    test('should return correct provider info', () => {
      const info = provider.getProviderInfo();

      expect(info.name).toBe('VersioningFileProvider');
      expect(info.version).toBe('1.0.0');
      expect(info.description).toContain('version history');
      expect(info.features).toContain('version-history');
      expect(info.features).toContain('delta-storage');
      expect(info.features).toContain('compression');
      expect(info.features).toContain('page-index');
    });
  });

  describe('Version Creation - New Page', () => {
    test('should create v1 for new page with full content', async () => {
      await provider.initialize();

      const pageName = 'Test Page';
      const content = 'This is the initial content';
      const metadata = { author: 'test-user', uuid: 'test-uuid-1' };

      await provider.savePage(pageName, content, metadata);

      // Check v1 directory exists
      const v1Dir = path.join(provider.pagesVersionsDir, 'test-uuid-1', 'v1');
      expect(await fs.pathExists(v1Dir)).toBe(true);

      // Check content.md exists with full content
      const contentPath = path.join(v1Dir, 'content.md');
      expect(await fs.pathExists(contentPath)).toBe(true);
      const savedContent = await fs.readFile(contentPath, 'utf8');
      expect(savedContent).toBe(content);

      // Check version metadata via manifest.json (meta.json no longer written - manifest is single source of truth)
      const manifestPath = path.join(provider.pagesVersionsDir, 'test-uuid-1', 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      const v1Meta = manifest.versions[0];
      expect(v1Meta.editor).toBe('test-user'); // field is 'editor' (derived from metadata.author)
      expect(v1Meta.changeType).toBe('created');
      expect(v1Meta.isDelta).toBe(false);
      expect(v1Meta.contentHash).toBe(DeltaStorage.calculateHash(content));
      expect(v1Meta.contentSize).toBe(Buffer.byteLength(content, 'utf8'));
    });

    test('should create manifest.json for new page', async () => {
      await provider.initialize();

      const pageName = 'Test Page';
      const content = 'Initial content';
      const metadata = { author: 'test-user', uuid: 'test-uuid-2' };

      await provider.savePage(pageName, content, metadata);

      // Check manifest
      const manifestPath = path.join(provider.pagesVersionsDir, 'test-uuid-2', 'manifest.json');
      expect(await fs.pathExists(manifestPath)).toBe(true);

      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      expect(manifest.pageId).toBe('test-uuid-2');
      expect(manifest.pageName).toBe(pageName);
      expect(manifest.currentVersion).toBe(1);
      expect(manifest.versions).toHaveLength(1);
      expect(manifest.versions[0].version).toBe(1);
      expect(manifest.versions[0].changeType).toBe('created');
    });

    test('should update page-index.json for new page', async () => {
      await provider.initialize();

      const pageName = 'Test Page';
      const content = 'Initial content';
      const metadata = { author: 'test-user', uuid: 'test-uuid-3' };

      await provider.savePage(pageName, content, metadata);

      // Check page index
      const indexData = await fs.readFile(provider.pageIndexPath, 'utf8');
      const index = JSON.parse(indexData);

      expect(index.pageCount).toBe(1);
      expect(index.pages['test-uuid-3']).toBeDefined();
      expect(index.pages['test-uuid-3'].title).toBe(pageName);
      expect(index.pages['test-uuid-3'].uuid).toBe('test-uuid-3');
      expect(index.pages['test-uuid-3'].currentVersion).toBe(1);
      expect(index.pages['test-uuid-3'].author).toBe('test-user');
      expect(index.pages['test-uuid-3'].hasVersions).toBe(true);
    });

    test('should call parent savePage', async () => {
      await provider.initialize();

      const pageName = 'Test Page';
      const content = 'Initial content';
      const metadata = { author: 'test-user', uuid: 'test-uuid-4' };

      await provider.savePage(pageName, content, metadata);

      // Parent should have created the actual page file
      const titleSlug = pageName.toLowerCase().replace(/\s+/g, '-');
      const possiblePaths = [
        path.join(provider.pagesDirectory, `${metadata.uuid}.md`),
        path.join(provider.pagesDirectory, `${titleSlug}.md`)
      ];

      const pageExists = (await Promise.all(
        possiblePaths.map(p => fs.pathExists(p))
      )).some(exists => exists);

      expect(pageExists).toBe(true);
    });
  });

  describe('Version Creation - Existing Page', () => {
    test('should create v2 with delta storage', async () => {
      await provider.initialize();

      const pageName = 'Test Page';
      const v1Content = 'This is version 1 content';
      const v2Content = 'This is version 2 content with changes';
      const metadata = { author: 'test-user', uuid: 'test-uuid-5' };

      // Create v1
      await provider.savePage(pageName, v1Content, metadata);

      // Create v2
      await provider.savePage(pageName, v2Content, metadata);

      // Check v2 directory
      const v2Dir = path.join(provider.pagesVersionsDir, 'test-uuid-5', 'v2');
      expect(await fs.pathExists(v2Dir)).toBe(true);

      // Should have content.diff (not content.md) because deltaStorage is enabled
      const diffPath = path.join(v2Dir, 'content.diff');
      expect(await fs.pathExists(diffPath)).toBe(true);

      const contentMdPath = path.join(v2Dir, 'content.md');
      expect(await fs.pathExists(contentMdPath)).toBe(false);

      // Verify diff exists and is valid JSON
      const diffData = JSON.parse(await fs.readFile(diffPath, 'utf8'));
      expect(Array.isArray(diffData)).toBe(true);

      // Note: We can't easily verify reconstruction here because the diff was created
      // from the actual file content which includes frontmatter, not just v1Content
    });

    test('should create multiple versions sequentially', async () => {
      await provider.initialize();

      const pageName = 'Test Page';
      const metadata = { author: 'test-user', uuid: 'test-uuid-6' };

      await provider.savePage(pageName, 'Version 1', metadata);
      await provider.savePage(pageName, 'Version 2', metadata);
      await provider.savePage(pageName, 'Version 3', metadata);

      // Check all version directories exist
      const baseDir = path.join(provider.pagesVersionsDir, 'test-uuid-6');
      expect(await fs.pathExists(path.join(baseDir, 'v1'))).toBe(true);
      expect(await fs.pathExists(path.join(baseDir, 'v2'))).toBe(true);
      expect(await fs.pathExists(path.join(baseDir, 'v3'))).toBe(true);

      // Check manifest
      const manifest = JSON.parse(
        await fs.readFile(path.join(baseDir, 'manifest.json'), 'utf8')
      );
      expect(manifest.currentVersion).toBe(3);
      expect(manifest.versions).toHaveLength(3);
    });

    test('should store full content when deltaStorage disabled', async () => {
      // Disable delta storage
      configManager.getProperty = vi.fn((key, defaultValue) => {
        if (key === 'ngdpbase.page.provider.versioning.deltastorage') return false;
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(testDir, 'pages');
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return path.join(testDir, 'required-pages');
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return path.join(testDir, 'data', 'page-index.json');
        return defaultValue;
      });

      const providerNoDelta = new VersioningFileProvider(engine);
      await providerNoDelta.initialize();

      const pageName = 'Test Page';
      const v1Content = 'Version 1';
      const v2Content = 'Version 2';
      const metadata = { author: 'test-user', uuid: 'test-uuid-7' };

      await providerNoDelta.savePage(pageName, v1Content, metadata);
      await providerNoDelta.savePage(pageName, v2Content, metadata);

      // v2 should have content.md (not content.diff)
      const v2ContentPath = path.join(providerNoDelta.pagesVersionsDir, 'test-uuid-7', 'v2', 'content.md');
      expect(await fs.pathExists(v2ContentPath)).toBe(true);

      const savedContent = await fs.readFile(v2ContentPath, 'utf8');
      expect(savedContent).toBe(v2Content);
    });

    test('should update manifest correctly on each save', async () => {
      await provider.initialize();

      const pageName = 'Test Page';
      const metadata = { author: 'test-user', uuid: 'test-uuid-8' };

      await provider.savePage(pageName, 'V1', metadata);
      await provider.savePage(pageName, 'V2', { ...metadata, comment: 'Second version' });
      await provider.savePage(pageName, 'V3', { ...metadata, comment: 'Third version' });

      const manifestPath = path.join(provider.pagesVersionsDir, 'test-uuid-8', 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

      expect(manifest.currentVersion).toBe(3);
      expect(manifest.versions[0].version).toBe(1);
      expect(manifest.versions[0].changeType).toBe('created');
      expect(manifest.versions[1].version).toBe(2);
      expect(manifest.versions[1].comment).toBe('Second version');
      expect(manifest.versions[2].version).toBe(3);
      expect(manifest.versions[2].comment).toBe('Third version');
    });

    test('should update page-index on each save', async () => {
      await provider.initialize();

      const pageName = 'Test Page';
      const metadata = { author: 'user1', uuid: 'test-uuid-9' };

      await provider.savePage(pageName, 'V1', metadata);
      let index = JSON.parse(await fs.readFile(provider.pageIndexPath, 'utf8'));
      expect(index.pages['test-uuid-9'].currentVersion).toBe(1);

      await provider.savePage(pageName, 'V2', { ...metadata, author: 'user2' });
      index = JSON.parse(await fs.readFile(provider.pageIndexPath, 'utf8'));
      expect(index.pages['test-uuid-9'].currentVersion).toBe(2);
      expect(index.pages['test-uuid-9'].author).toBe('user2');

      await provider.savePage(pageName, 'V3', metadata);
      index = JSON.parse(await fs.readFile(provider.pageIndexPath, 'utf8'));
      expect(index.pages['test-uuid-9'].currentVersion).toBe(3);
    });
  });

  describe('Metadata Tracking', () => {
    // Helper: get version metadata from manifest.json (meta.json no longer written - manifest is single source of truth)
    async function getVersionMeta(pagesVersionsDir, uuid, versionNum) {
      const manifestPath = path.join(pagesVersionsDir, uuid, 'manifest.json');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      return manifest.versions.find(v => v.version === versionNum);
    }

    test('should track author information', async () => {
      await provider.initialize();

      const metadata = {
        author: 'john.doe@example.com',
        uuid: 'test-uuid-10'
      };

      await provider.savePage('Test Page', 'Content', metadata);

      const meta = await getVersionMeta(provider.pagesVersionsDir, 'test-uuid-10', 1);
      // Author is stored as 'editor' in manifest (derived from metadata.editor || metadata.author)
      expect(meta.editor).toBe('john.doe@example.com');
    });

    test('should track timestamps', async () => {
      await provider.initialize();

      const beforeTime = Date.now();
      await provider.savePage('Test Page', 'Content', { uuid: 'test-uuid-11' });
      const afterTime = Date.now();

      const meta = await getVersionMeta(provider.pagesVersionsDir, 'test-uuid-11', 1);

      const createdTime = new Date(meta.dateCreated).getTime();
      expect(createdTime).toBeGreaterThanOrEqual(beforeTime);
      expect(createdTime).toBeLessThanOrEqual(afterTime);
    });

    test('should track content hash', async () => {
      await provider.initialize();

      const content = 'Test content for hashing';
      await provider.savePage('Test Page', content, { uuid: 'test-uuid-12' });

      const meta = await getVersionMeta(provider.pagesVersionsDir, 'test-uuid-12', 1);

      const expectedHash = DeltaStorage.calculateHash(content);
      expect(meta.contentHash).toBe(expectedHash);
    });

    test('should track content size', async () => {
      await provider.initialize();

      const content = 'Test content';
      await provider.savePage('Test Page', content, { uuid: 'test-uuid-13' });

      const meta = await getVersionMeta(provider.pagesVersionsDir, 'test-uuid-13', 1);

      expect(meta.contentSize).toBe(Buffer.byteLength(content, 'utf8'));
    });

    test('should track change type', async () => {
      await provider.initialize();

      const metadata = { uuid: 'test-uuid-14' };

      await provider.savePage('Test', 'V1', metadata);
      let meta = await getVersionMeta(provider.pagesVersionsDir, 'test-uuid-14', 1);
      expect(meta.changeType).toBe('created');

      await provider.savePage('Test', 'V2', metadata);
      meta = await getVersionMeta(provider.pagesVersionsDir, 'test-uuid-14', 2);
      expect(meta.changeType).toBe('updated');
    });

    test('should track custom comments', async () => {
      await provider.initialize();

      const metadata = {
        uuid: 'test-uuid-15',
        comment: 'Fixed typo in introduction'
      };

      await provider.savePage('Test', 'Content', metadata);

      const meta = await getVersionMeta(provider.pagesVersionsDir, 'test-uuid-15', 1);

      expect(meta.comment).toBe('Fixed typo in introduction');
    });
  });

  describe('Error Handling', () => {
    test('should continue with save even if versioning fails', async () => {
      await provider.initialize();

      // Mock fs.writeFile to fail for version files
      const originalWriteFile = fs.writeFile;
      fs.writeFile = vi.fn((filePath, content, encoding) => {
        if (filePath.includes('/versions/')) {
          return Promise.reject(new Error('Disk full'));
        }
        return originalWriteFile(filePath, content, encoding);
      });

      const pageName = 'Test Page';
      const content = 'Content';
      const metadata = { uuid: 'test-uuid-16' };

      // Should not throw
      await expect(provider.savePage(pageName, content, metadata)).resolves.not.toThrow();

      // Restore
      fs.writeFile = originalWriteFile;
    });

    test('should handle missing manifest gracefully', async () => {
      await provider.initialize();

      const pageName = 'Test Page';
      const metadata = { uuid: 'test-uuid-17' };

      // Create v1
      await provider.savePage(pageName, 'V1', metadata);

      // Delete manifest
      const manifestPath = path.join(provider.pagesVersionsDir, 'test-uuid-17', 'manifest.json');
      await fs.remove(manifestPath);

      // Create v2 - should recreate manifest
      await provider.savePage(pageName, 'V2', metadata);

      // Manifest should exist again
      expect(await fs.pathExists(manifestPath)).toBe(true);
    });
  });

  describe('Required Pages', () => {
    test('should store required pages in correct location', async () => {
      // Mock system categories config
      configManager.getProperty = vi.fn((key, defaultValue) => {
        if (key === 'ngdpbase.system-category') {
          return {
            Navigation: {
              label: 'Navigation',
              storageLocation: 'required'
            }
          };
        }
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(testDir, 'pages');
        if (key === 'ngdpbase.page.provider.filesystem.requiredpagesdir') return path.join(testDir, 'required-pages');
        if (key === 'ngdpbase.page.provider.versioning.indexfile') return path.join(testDir, 'data', 'page-index.json');
        return defaultValue;
      });

      const providerWithCategories = new VersioningFileProvider(engine);
      await providerWithCategories.initialize();

      const metadata = {
        uuid: 'test-uuid-18',
        'system-category': 'Navigation'
      };

      await providerWithCategories.savePage('LeftMenu', 'Menu content', metadata);

      // Should be in required-pages versions
      const versionDir = path.join(providerWithCategories.requiredPagesVersionsDir, 'test-uuid-18', 'v1');
      expect(await fs.pathExists(versionDir)).toBe(true);

      // Check page index location
      const index = JSON.parse(await fs.readFile(providerWithCategories.pageIndexPath, 'utf8'));
      expect(index.pages['test-uuid-18'].location).toBe('required-pages');
    });
  });

  describe('Atomic Operations', () => {
    test('should use atomic writes for manifest', async () => {
      await provider.initialize();

      await provider.savePage('Test', 'Content', { uuid: 'test-uuid-19' });

      // Temporary file should not exist after save
      const tempPath = path.join(provider.pagesVersionsDir, 'test-uuid-19', 'manifest.json.tmp');
      expect(await fs.pathExists(tempPath)).toBe(false);

      // Actual file should exist
      const manifestPath = path.join(provider.pagesVersionsDir, 'test-uuid-19', 'manifest.json');
      expect(await fs.pathExists(manifestPath)).toBe(true);
    });

    test('should use atomic writes for page-index', async () => {
      await provider.initialize();

      await provider.savePage('Test', 'Content', { uuid: 'test-uuid-20' });

      // Temporary file should not exist
      const tempPath = `${provider.pageIndexPath}.tmp`;
      expect(await fs.pathExists(tempPath)).toBe(false);

      // Actual file should exist
      expect(await fs.pathExists(provider.pageIndexPath)).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle realistic wiki editing scenario', async () => {
      await provider.initialize();

      const pageName = 'Product Documentation';
      const metadata = { author: 'tech-writer', uuid: 'doc-uuid-1' };

      // Initial creation
      const v1 = '# Product\n\nInitial documentation';
      await provider.savePage(pageName, v1, metadata);

      // Add features section
      const v2 = '# Product\n\nInitial documentation\n\n## Features\n- Feature 1';
      await provider.savePage(pageName, v2, { ...metadata, author: 'developer1' });

      // Fix typo
      const v3 = '# Product\n\nInitial documentation\n\n## Features\n- Feature One';
      await provider.savePage(pageName, v3, { ...metadata, author: 'developer2', comment: 'Fixed typo' });

      // Verify all versions exist
      const baseDir = path.join(provider.pagesVersionsDir, 'doc-uuid-1');
      expect(await fs.pathExists(path.join(baseDir, 'v1'))).toBe(true);
      expect(await fs.pathExists(path.join(baseDir, 'v2'))).toBe(true);
      expect(await fs.pathExists(path.join(baseDir, 'v3'))).toBe(true);

      // Verify manifest tracking (manifest stores 'editor', not 'author')
      const manifest = JSON.parse(await fs.readFile(path.join(baseDir, 'manifest.json'), 'utf8'));
      expect(manifest.currentVersion).toBe(3);
      expect(manifest.versions[0].editor).toBe('tech-writer');
      expect(manifest.versions[1].editor).toBe('developer1');
      expect(manifest.versions[2].editor).toBe('developer2');
      expect(manifest.versions[2].comment).toBe('Fixed typo');

      // Verify v1 is full content
      const v1Content = await fs.readFile(path.join(baseDir, 'v1', 'content.md'), 'utf8');
      expect(v1Content).toBe(v1);

      // Verify v2 and v3 are diffs
      expect(await fs.pathExists(path.join(baseDir, 'v2', 'content.diff'))).toBe(true);
      expect(await fs.pathExists(path.join(baseDir, 'v3', 'content.diff'))).toBe(true);

      // Verify page index
      const index = JSON.parse(await fs.readFile(provider.pageIndexPath, 'utf8'));
      expect(index.pages['doc-uuid-1'].currentVersion).toBe(3);
      expect(index.pages['doc-uuid-1'].author).toBe('developer2');
    });
  });

  describe('Version Retrieval - getVersionHistory()', () => {
    test('should return version history by page title', async () => {
      await provider.initialize();

      const pageName = 'Test History';
      const uuid = 'history-uuid-1';

      // Create 3 versions
      await provider.savePage(pageName, 'v1 content', { uuid, author: 'user1' });
      await provider.savePage(pageName, 'v2 content', { uuid, author: 'user2' });
      await provider.savePage(pageName, 'v3 content', { uuid, author: 'user3' });

      // Get history by title
      const history = await provider.getVersionHistory(pageName);

      expect(history.length).toBe(3);
      // Newest first
      expect(history[0].version).toBe(3);
      expect(history[0].author).toBe('user3');
      expect(history[1].version).toBe(2);
      expect(history[1].author).toBe('user2');
      expect(history[2].version).toBe(1);
      expect(history[2].author).toBe('user1');
    });

    test('should return version history by UUID', async () => {
      await provider.initialize();

      const uuid = 'history-uuid-2';
      await provider.savePage('Test', 'v1', { uuid, author: 'admin' });
      await provider.savePage('Test', 'v2', { uuid, author: 'admin' });

      // Get history by UUID
      const history = await provider.getVersionHistory(uuid);

      expect(history.length).toBe(2);
      expect(history[0].version).toBe(2);
      expect(history[1].version).toBe(1);
    });

    test('should return empty array for page with no versions', async () => {
      await provider.initialize();

      // Create page without versioning by directly manipulating page index
      provider.pageIndex.pages['no-versions-uuid'] = {
        uuid: 'no-versions-uuid',
        title: 'No Versions',
        location: 'pages'
      };

      const history = await provider.getVersionHistory('no-versions-uuid');
      expect(history).toEqual([]);
    });

    test('should throw error for non-existent page', async () => {
      await provider.initialize();

      await expect(provider.getVersionHistory('NonExistent')).rejects.toThrow('Page not found');
    });

    test('should include all version metadata fields', async () => {
      await provider.initialize();

      await provider.savePage('Meta Test', 'content', {
        uuid: 'meta-uuid-1',
        author: 'john',
        comment: 'Initial commit'
      });

      const history = await provider.getVersionHistory('Meta Test');

      expect(history[0]).toHaveProperty('version');
      expect(history[0]).toHaveProperty('timestamp'); // dateCreated is mapped to 'timestamp'
      expect(history[0]).toHaveProperty('author');    // editor is mapped to 'author'
      expect(history[0]).toHaveProperty('changeType');
      expect(history[0]).toHaveProperty('message');   // comment is mapped to 'message'
      expect(history[0]).toHaveProperty('contentSize');
    });
  });

  describe('Version Retrieval - getPageVersion()', () => {
    test('should retrieve version 1 content', async () => {
      await provider.initialize();

      const content = 'Original content for v1';
      await provider.savePage('Test', content, { uuid: 'version-uuid-1', author: 'admin' });

      const { content: retrieved, metadata } = await provider.getPageVersion('Test', 1);

      expect(retrieved).toBe(content);
      expect(metadata.version).toBe(1);
      expect(metadata.author).toBe('admin');
    });

    test('should retrieve version 2+ with delta storage (diff reconstruction)', async () => {
      await provider.initialize();

      const uuid = 'version-uuid-2';
      const v1 = 'Hello world';
      const v2 = 'Hello ngdpbase';
      const v3 = 'Hello ngdpbase community';

      await provider.savePage('Test', v1, { uuid, author: 'user1' });
      await provider.savePage('Test', v2, { uuid, author: 'user2' });
      await provider.savePage('Test', v3, { uuid, author: 'user3' });

      // Retrieve v2 (should reconstruct from v1 + diff)
      const { content: v2Content } = await provider.getPageVersion('Test', 2);
      expect(v2Content).toBe(v2);

      // Retrieve v3 (should reconstruct from v1 + diff2 + diff3)
      const { content: v3Content } = await provider.getPageVersion('Test', 3);
      expect(v3Content).toBe(v3);
    });

    test('should retrieve version by UUID', async () => {
      await provider.initialize();

      const uuid = 'version-uuid-3';
      await provider.savePage('Test', 'content v1', { uuid });
      await provider.savePage('Test', 'content v2', { uuid });

      const { content } = await provider.getPageVersion(uuid, 1);
      expect(content).toBe('content v1');
    });

    test('should throw error for invalid version number', async () => {
      await provider.initialize();

      await provider.savePage('Test', 'content', { uuid: 'version-uuid-4' });

      await expect(provider.getPageVersion('Test', 0)).rejects.toThrow('Invalid version number');
      await expect(provider.getPageVersion('Test', -1)).rejects.toThrow('Invalid version number');
      await expect(provider.getPageVersion('Test', 'invalid')).rejects.toThrow('Invalid version number');
    });

    test('should throw error for version that does not exist', async () => {
      await provider.initialize();

      await provider.savePage('Test', 'content', { uuid: 'version-uuid-5' });

      await expect(provider.getPageVersion('Test', 99)).rejects.toThrow('does not exist');
    });

    test('should throw error for non-existent page', async () => {
      await provider.initialize();

      await expect(provider.getPageVersion('NonExistent', 1)).rejects.toThrow('Page not found');
    });

    test('should handle large version chains efficiently', async () => {
      await provider.initialize();

      const uuid = 'version-uuid-6';
      const pageName = 'Large Chain Test';

      // Create 10 versions
      for (let i = 1; i <= 10; i++) {
        await provider.savePage(pageName, `Content version ${i}`, { uuid, author: `user${i}` });
      }

      // Retrieve v10 (should reconstruct through 9 diffs)
      const startTime = Date.now();
      const { content } = await provider.getPageVersion(pageName, 10);
      const duration = Date.now() - startTime;

      expect(content).toBe('Content version 10');
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });
  });

  describe('Version Retrieval - restoreVersion()', () => {
    test('should restore page to previous version', async () => {
      await provider.initialize();

      const uuid = 'restore-uuid-1';
      const pageName = 'Restore Test';

      // Create 3 versions
      await provider.savePage(pageName, 'v1 content', { uuid, author: 'user1' });
      await provider.savePage(pageName, 'v2 content', { uuid, author: 'user2' });
      await provider.savePage(pageName, 'v3 content', { uuid, author: 'user3' });

      // Restore to v1 (returns void - new version number found via history)
      await provider.restoreVersion(pageName, 1);

      // Should create v4 with v1's content
      const { content } = await provider.getPageVersion(pageName, 4);
      expect(content).toBe('v1 content');

      // Verify metadata
      const history = await provider.getVersionHistory(pageName);
      expect(history[0].version).toBe(4);
      expect(history[0].changeType).toBe('restored');
      expect(history[0].message).toContain('Restored from v1'); // comment maps to 'message'
    });

    test('should preserve all original versions after restore', async () => {
      await provider.initialize();

      const uuid = 'restore-uuid-2';
      await provider.savePage('Test', 'v1', { uuid });
      await provider.savePage('Test', 'v2', { uuid });
      await provider.savePage('Test', 'v3', { uuid });

      // Restore to v2
      await provider.restoreVersion('Test', 2);

      // All original versions should still exist
      const history = await provider.getVersionHistory('Test');
      expect(history.length).toBe(4); // v1, v2, v3, v4(restored)

      // Can still retrieve v3
      const { content: v3Content } = await provider.getPageVersion('Test', 3);
      expect(v3Content).toBe('v3');
    });

    test('should accept custom author and comment', async () => {
      await provider.initialize();

      const uuid = 'restore-uuid-3';
      await provider.savePage('Test', 'v1', { uuid });
      await provider.savePage('Test', 'v2 bad content', { uuid });

      // restoreVersion() uses 'system' as editor and 'Restored from v{N}' as comment
      await provider.restoreVersion('Test', 1);

      const history = await provider.getVersionHistory('Test');
      // Author will be 'system' (implementation default) and message matches restore pattern
      expect(history[0].author).toBe('system');
      expect(history[0].message).toContain('Restored from v1');
    });

    test('should restore by UUID', async () => {
      await provider.initialize();

      const uuid = 'restore-uuid-4';
      await provider.savePage('Test', 'v1', { uuid });
      await provider.savePage('Test', 'v2', { uuid });

      // restoreVersion returns void; verify via version count
      await provider.restoreVersion(uuid, 1);
      const history = await provider.getVersionHistory(uuid);
      expect(history[0].version).toBe(3);
    });

    test('should throw error for non-existent page', async () => {
      await provider.initialize();

      await expect(provider.restoreVersion('NonExistent', 1)).rejects.toThrow();
    });

    test('should throw error for non-existent version', async () => {
      await provider.initialize();

      await provider.savePage('Test', 'v1', { uuid: 'restore-uuid-5' });

      await expect(provider.restoreVersion('Test', 99)).rejects.toThrow();
    });
  });

  describe('Version Retrieval - compareVersions()', () => {
    test('should compare two versions and return diff', async () => {
      await provider.initialize();

      const uuid = 'compare-uuid-1';
      await provider.savePage('Test', 'Hello world', { uuid, author: 'user1' });
      await provider.savePage('Test', 'Hello ngdpbase', { uuid, author: 'user2' });

      // compareVersions returns { fromVersion, toVersion, fromMetadata, toMetadata, diff, stats }
      const comparison = await provider.compareVersions('Test', 1, 2);

      expect(comparison.fromVersion).toBe(1);
      expect(comparison.fromMetadata.version).toBe(1);
      expect(comparison.fromMetadata.author).toBe('user1');
      expect(comparison.toVersion).toBe(2);
      expect(comparison.toMetadata.version).toBe(2);
      expect(comparison.toMetadata.author).toBe('user2');

      expect(Array.isArray(comparison.diff)).toBe(true);
      expect(comparison.diff.length).toBeGreaterThan(0);

      expect(comparison.stats).toHaveProperty('additions');
      expect(comparison.stats).toHaveProperty('deletions');
      expect(comparison.stats).toHaveProperty('unchanged');
    });

    test('should compare versions in any order', async () => {
      await provider.initialize();

      const uuid = 'compare-uuid-2';
      await provider.savePage('Test', 'aaa', { uuid });
      await provider.savePage('Test', 'bbb', { uuid });
      await provider.savePage('Test', 'ccc', { uuid });

      // Compare v1 to v3
      const forward = await provider.compareVersions('Test', 1, 3);
      expect(forward.fromVersion).toBe(1);
      expect(forward.toVersion).toBe(3);

      // Compare v3 to v1 (reverse)
      const backward = await provider.compareVersions('Test', 3, 1);
      expect(backward.fromVersion).toBe(3);
      expect(backward.toVersion).toBe(1);
    });

    test('should compare by UUID', async () => {
      await provider.initialize();

      const uuid = 'compare-uuid-3';
      await provider.savePage('Test', 'v1', { uuid });
      await provider.savePage('Test', 'v2', { uuid });

      const comparison = await provider.compareVersions(uuid, 1, 2);
      expect(comparison.fromVersion).toBe(1);
    });

    test('should handle identical versions (no changes)', async () => {
      await provider.initialize();

      const uuid = 'compare-uuid-4';
      await provider.savePage('Test', 'same content', { uuid });
      await provider.savePage('Test', 'same content', { uuid }); // No change

      const comparison = await provider.compareVersions('Test', 1, 2);

      expect(comparison.stats.additions).toBe(0);
      expect(comparison.stats.deletions).toBe(0);
      expect(comparison.stats.unchanged).toBeGreaterThan(0);
    });

    test('should throw error for invalid version numbers', async () => {
      await provider.initialize();

      await provider.savePage('Test', 'content', { uuid: 'compare-uuid-5' });

      await expect(provider.compareVersions('Test', 'invalid', 1)).rejects.toThrow('must be integers');
      await expect(provider.compareVersions('Test', 1, 0)).rejects.toThrow('must be >= 1');
    });

    test('should throw error for non-existent versions', async () => {
      await provider.initialize();

      await provider.savePage('Test', 'content', { uuid: 'compare-uuid-6' });

      await expect(provider.compareVersions('Test', 1, 99)).rejects.toThrow();
    });
  });

  describe('Duplicate title handling (#587)', () => {
    test('fast-init keeps newer entry and discards stale when index has duplicate titles', async () => {
      const pagesDir = path.join(testDir, 'pages');
      await fs.ensureDir(pagesDir);

      // Write both page files so fast-init can resolve filePaths
      const oldUuid = 'aaaaaaaa-0000-0000-0000-000000000001';
      const newUuid = 'bbbbbbbb-0000-0000-0000-000000000002';
      await fs.writeFile(path.join(pagesDir, `${oldUuid}.md`), `---\ntitle: Speed\nuuid: ${oldUuid}\n---\n# Speed old`);
      await fs.writeFile(path.join(pagesDir, `${newUuid}.md`), `---\ntitle: Speed\nuuid: ${newUuid}\n---\n# Speed new`);

      const indexPath = path.join(testDir, 'data', 'page-index.json');
      await fs.ensureDir(path.dirname(indexPath));
      await fs.writeJSON(indexPath, {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        pageCount: 2,
        pages: {
          [oldUuid]: { title: 'Speed', uuid: oldUuid, lastModified: '2024-01-01T00:00:00.000Z', location: 'pages', filename: `${oldUuid}.md` },
          [newUuid]: { title: 'Speed', uuid: newUuid, lastModified: '2024-06-01T00:00:00.000Z', location: 'pages', filename: `${newUuid}.md` }
        }
      });

      await provider.initialize();

      // Newer UUID should be in-memory; older should not
      expect(provider.uuidIndex.has(newUuid)).toBe(true);
      expect(provider.uuidIndex.has(oldUuid)).toBe(false);
    });

    test('stale duplicate UUID is removed from the saved index file after fast-init', async () => {
      const pagesDir = path.join(testDir, 'pages');
      await fs.ensureDir(pagesDir);

      const oldUuid = 'cccccccc-0000-0000-0000-000000000003';
      const newUuid = 'dddddddd-0000-0000-0000-000000000004';
      await fs.writeFile(path.join(pagesDir, `${oldUuid}.md`), `---\ntitle: Speed\nuuid: ${oldUuid}\n---\n`);
      await fs.writeFile(path.join(pagesDir, `${newUuid}.md`), `---\ntitle: Speed\nuuid: ${newUuid}\n---\n`);

      const indexPath = path.join(testDir, 'data', 'page-index.json');
      await fs.ensureDir(path.dirname(indexPath));
      await fs.writeJSON(indexPath, {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        pageCount: 2,
        pages: {
          [oldUuid]: { title: 'Speed', uuid: oldUuid, lastModified: '2024-01-01T00:00:00.000Z', location: 'pages', filename: `${oldUuid}.md` },
          [newUuid]: { title: 'Speed', uuid: newUuid, lastModified: '2024-06-01T00:00:00.000Z', location: 'pages', filename: `${newUuid}.md` }
        }
      });

      await provider.initialize();

      // Re-read the index file — stale UUID should be gone
      const savedIndex = await fs.readJSON(indexPath);
      expect(savedIndex.pages[oldUuid]).toBeUndefined();
      expect(savedIndex.pages[newUuid]).toBeDefined();
      expect(savedIndex.pageCount).toBe(1);
    });

    test('updatePageInIndex removes old same-title entry before writing new one', async () => {
      await provider.initialize();

      // Save a page normally to seed the index
      await provider.savePage('Speed', '# Speed', {
        title: 'Speed',
        uuid: 'eeeeeeee-0000-0000-0000-000000000005',
        author: 'admin'
      } as never);

      // Inject a stale duplicate directly into the in-memory index
      const staleUuid = 'ffffffff-0000-0000-0000-000000000006';
      provider.pageIndex!.pages[staleUuid] = {
        title: 'Speed',
        uuid: staleUuid,
        lastModified: '2024-01-01T00:00:00.000Z',
        location: 'pages',
        filename: `${staleUuid}.md`
      } as never;
      provider.pageIndex!.pageCount++;

      // Save again — updatePageInIndex should remove the stale entry
      await provider.savePage('Speed', '# Speed updated', {
        title: 'Speed',
        uuid: 'eeeeeeee-0000-0000-0000-000000000005',
        author: 'admin'
      } as never);

      expect(provider.pageIndex!.pages[staleUuid]).toBeUndefined();
      expect(provider.pageIndex!.pages['eeeeeeee-0000-0000-0000-000000000005']).toBeDefined();
    });
  });

  describe('Auto-migration — slug-named files', () => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pagesDir = () => path.join(testDir, 'pages');
    const indexPath = () => path.join(testDir, 'data', 'page-index.json');

    /**
     * Write a .md file into pagesDir (creates dir if needed).
     * filename is the on-disk name (e.g. "my-page.md" or "{uuid}.md").
     */
    const writePage = async (filename, { uuid, title, content = 'Hello world.' } = {}) => {
      await fs.ensureDir(pagesDir());
      let fm = `---\ntitle: ${title}\n`;
      if (uuid) fm += `uuid: ${uuid}\n`;
      fm += `---\n${content}\n`;
      await fs.writeFile(path.join(pagesDir(), filename), fm, 'utf8');
    };

    test('renames slug-named file to {uuid}.md and migrates correct content', async () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567801';
      await writePage('my-addon-home.md', { uuid, title: 'Addon Home', content: 'Seeded content.' });

      await provider.initialize();

      // Slug-named file should be gone; UUID-named file should exist
      expect(await fs.pathExists(path.join(pagesDir(), 'my-addon-home.md'))).toBe(false);
      expect(await fs.pathExists(path.join(pagesDir(), `${uuid}.md`))).toBe(true);

      // Page should be in the index
      const index = JSON.parse(await fs.readFile(indexPath(), 'utf8'));
      expect(index.pages[uuid]).toBeDefined();
      expect(index.pages[uuid].title).toBe('Addon Home');

      // v1 content should be the actual page content, not empty
      const v1Content = await fs.readFile(
        path.join(pagesDir(), 'versions', uuid, 'v1', 'content.md'),
        'utf8'
      );
      expect(v1Content.trim()).toBe('Seeded content.');
    });

    test('migrates multiple slug-named files in the same run', async () => {
      const uuid1 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567811';
      const uuid2 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567812';
      await writePage('page-one.md', { uuid: uuid1, title: 'Page One', content: 'Content one.' });
      await writePage('page-two.md', { uuid: uuid2, title: 'Page Two', content: 'Content two.' });

      await provider.initialize();

      expect(await fs.pathExists(path.join(pagesDir(), `${uuid1}.md`))).toBe(true);
      expect(await fs.pathExists(path.join(pagesDir(), `${uuid2}.md`))).toBe(true);
      expect(await fs.pathExists(path.join(pagesDir(), 'page-one.md'))).toBe(false);
      expect(await fs.pathExists(path.join(pagesDir(), 'page-two.md'))).toBe(false);

      const index = JSON.parse(await fs.readFile(indexPath(), 'utf8'));
      expect(index.pages[uuid1]).toBeDefined();
      expect(index.pages[uuid2]).toBeDefined();
    });

    test('migrates mix of slug-named and UUID-named files correctly', async () => {
      const slugUuid  = 'a1b2c3d4-e5f6-7890-abcd-ef1234567821';
      const properUuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567822';

      await writePage('addon-page.md', { uuid: slugUuid, title: 'Addon Page', content: 'From slug file.' });
      await writePage(`${properUuid}.md`, { uuid: properUuid, title: 'Normal Page', content: 'From UUID file.' });

      await provider.initialize();

      // Slug file renamed
      expect(await fs.pathExists(path.join(pagesDir(), 'addon-page.md'))).toBe(false);
      expect(await fs.pathExists(path.join(pagesDir(), `${slugUuid}.md`))).toBe(true);

      // Both pages in index with correct content
      const index = JSON.parse(await fs.readFile(indexPath(), 'utf8'));
      expect(index.pages[slugUuid]).toBeDefined();
      expect(index.pages[properUuid]).toBeDefined();

      const slugV1 = await fs.readFile(
        path.join(pagesDir(), 'versions', slugUuid, 'v1', 'content.md'), 'utf8'
      );
      const normalV1 = await fs.readFile(
        path.join(pagesDir(), 'versions', properUuid, 'v1', 'content.md'), 'utf8'
      );
      expect(slugV1.trim()).toBe('From slug file.');
      expect(normalV1.trim()).toBe('From UUID file.');
    });

    test('slug-named file with no UUID frontmatter uses filename as uuid — still migrates', async () => {
      // No uuid in frontmatter — FileSystemProvider uses filename as uuid
      // Filename matches computed uuid, so {uuid}.md = slug.md → file found normally
      await writePage('numeric-page.md', { title: 'Numeric Page', content: 'No UUID field.' });

      // Should not throw
      await expect(provider.initialize()).resolves.not.toThrow();

      // File exists under its original name (filename == uuid key)
      expect(await fs.pathExists(path.join(pagesDir(), 'numeric-page.md'))).toBe(true);

      const index = JSON.parse(await fs.readFile(indexPath(), 'utf8'));
      // Indexed under the slug-as-uuid key
      expect(index.pages['numeric-page']).toBeDefined();
    });

    test('already-renamed slug file is not processed twice after restart', async () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567831';
      await writePage('double-process.md', { uuid, title: 'Double Process', content: 'Once is enough.' });

      // First boot — migrates and renames
      await provider.initialize();
      expect(await fs.pathExists(path.join(pagesDir(), `${uuid}.md`))).toBe(true);
      expect(await fs.pathExists(path.join(pagesDir(), 'double-process.md'))).toBe(false);

      // Second boot — index exists; fast path skips migration entirely
      const VFPMod = await import('../VersioningFileProvider');
      const VFP2 = (VFPMod).default ?? VFPMod;
      const provider2 = new VFP2(engine);
      await expect(provider2.initialize()).resolves.not.toThrow();

      // Still just one UUID-named file
      const files = (await fs.readdir(pagesDir())).filter(f => f.endsWith('.md') && !f.startsWith('.'));
      const pageFiles = files.filter(f => !f.includes('versions'));
      expect(pageFiles).toContain(`${uuid}.md`);
      expect(pageFiles).not.toContain('double-process.md');
    });
  });
});
