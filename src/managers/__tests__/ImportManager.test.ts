/**
 * Tests for ImportManager
 */

import path from 'path';
import fs from 'fs-extra';
import ImportManager from '../ImportManager';

// Mock AttachmentManager
const mockUploadAttachment = vi.fn().mockResolvedValue({ identifier: 'abc123' });

// Mock WikiEngine
const mockEngine = {
  getManager: vi.fn((name) => {
    if (name === 'AttachmentManager') {
      return { uploadAttachment: mockUploadAttachment };
    }
    return { getProperty: vi.fn().mockReturnValue('./data/pages') };
  })
};

// Mock converter for testing
class MockConverter {
  formatId: string;
  formatName: string;
  fileExtensions: string[];
  constructor() {
    this.formatId = 'mock';
    this.formatName = 'Mock Format';
    this.fileExtensions = ['.mock'];
  }

  convert(content) {
    return {
      content: `CONVERTED: ${content}`,
      metadata: { title: 'Mock Title' },
      warnings: []
    };
  }

  canHandle(content, filename) {
    return filename.endsWith('.mock') || content.includes('MOCK_MARKER');
  }
}

describe('ImportManager', () => {
  let importManager;
  let testDir;

  beforeEach(async () => {
    importManager = new ImportManager(mockEngine);
    await importManager.initialize();
    mockUploadAttachment.mockClear();

    // Create temp test directory
    testDir = path.join('/tmp', `import-test-${Date.now()}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await importManager.shutdown();

    // Cleanup test directory
    if (await fs.pathExists(testDir)) {
      await fs.remove(testDir);
    }
  });

  describe('initialization', () => {
    it('should register JSPWikiConverter by default', () => {
      const formats = importManager.getAvailableFormats();
      expect(formats).toContain('jspwiki');
    });

    it('should be initialized after initialize()', () => {
      expect(importManager.isInitialized()).toBe(true);
    });
  });

  describe('converter registry', () => {
    it('should register custom converters', () => {
      importManager.registerConverter(new MockConverter());
      expect(importManager.getAvailableFormats()).toContain('mock');
    });

    it('should get converter by format ID', () => {
      importManager.registerConverter(new MockConverter());
      const converter = importManager.getConverter('mock');
      expect(converter).toBeDefined();
      expect(converter.formatId).toBe('mock');
    });

    it('should return undefined for unknown format', () => {
      const converter = importManager.getConverter('unknown');
      expect(converter).toBeUndefined();
    });

    it('should get converter info for all registered converters', () => {
      importManager.registerConverter(new MockConverter());
      const info = importManager.getConverterInfo();

      expect(info.length).toBeGreaterThanOrEqual(2); // jspwiki + mock
      expect(info.some(i => i.formatId === 'jspwiki')).toBe(true);
      expect(info.some(i => i.formatId === 'mock')).toBe(true);
    });
  });

  describe('format detection', () => {
    beforeEach(() => {
      importManager.registerConverter(new MockConverter());
    });

    it('should detect format from filename extension', () => {
      const format = importManager.detectFormat('any content', 'file.mock');
      expect(format).toBe('mock');
    });

    it('should detect format from content', () => {
      const format = importManager.detectFormat('MOCK_MARKER here', 'file.unknown');
      expect(format).toBe('mock');
    });

    it('should detect JSPWiki format', () => {
      const format = importManager.detectFormat('!!! Heading', 'page.txt');
      expect(format).toBe('jspwiki');
    });

    it('should return null for unknown format', () => {
      const format = importManager.detectFormat('plain text', 'file.xyz');
      expect(format).toBeNull();
    });

    // #879 — NCM markdown shares ||table|| and %%style forms with JSPWiki;
    // auto-detect must never hand .md files to the JSPWiki converter.
    it('detects NCM .md with JSPWiki-like constructs as markdown, not jspwiki', () => {
      const ncm = '---\ntitle: Day 3\nncmVersion: 2\n---\n\n# Day 3\n\n||From||To||\n|A|B|\n\n%%table-striped\n';
      expect(importManager.detectFormat(ncm, 'day-3.md')).toBe('markdown');
    });

    it('extension outranks content sniffing: .md with pure JSPWiki syntax is markdown', () => {
      expect(importManager.detectFormat('!!! Heading\n__bold__', 'page.md')).toBe('markdown');
    });

    it('frontmatter guard: extensionless NCM content is not jspwiki', () => {
      const ncm = '---\ntitle: X\n---\n\n||H1||H2||\n';
      expect(importManager.detectFormat(ncm, 'exported-page')).toBe('markdown');
    });

    it('still detects real JSPWiki .txt by extension', () => {
      expect(importManager.detectFormat('!!! Heading', 'page.txt')).toBe('jspwiki');
    });
  });

  describe('importSinglePage', () => {
    beforeEach(() => {
      importManager.registerConverter(new MockConverter());
    });

    it('should convert a single file', async () => {
      // Create test file
      const sourceFile = path.join(testDir, 'test.mock');
      await fs.writeFile(sourceFile, 'Original content');

      const targetDir = path.join(testDir, 'output');

      const result = await importManager.importSinglePage(sourceFile, {
        sourceDir: testDir,
        targetDir,
        format: 'mock',
        dryRun: true
      });

      expect(result).not.toBeNull();
      expect(result.format).toBe('mock');
      expect(result.written).toBe(false); // dry run
    });

    it('should skip files with no matching converter', async () => {
      const sourceFile = path.join(testDir, 'unknown.xyz');
      await fs.writeFile(sourceFile, 'Unknown content');

      const result = await importManager.importSinglePage(sourceFile, {
        sourceDir: testDir,
        format: 'auto'
      });

      expect(result).toBeNull();
    });

    it('should auto-detect format when format is "auto"', async () => {
      const sourceFile = path.join(testDir, 'test.mock');
      await fs.writeFile(sourceFile, 'Content');

      const result = await importManager.importSinglePage(sourceFile, {
        sourceDir: testDir,
        format: 'auto',
        dryRun: true
      });

      expect(result.format).toBe('mock');
    });
  });

  describe('importPages', () => {
    beforeEach(async () => {
      importManager.registerConverter(new MockConverter());

      // Create test files
      await fs.writeFile(path.join(testDir, 'page1.mock'), 'Content 1');
      await fs.writeFile(path.join(testDir, 'page2.mock'), 'Content 2');
      await fs.writeFile(path.join(testDir, 'ignored.xyz'), 'Ignored');
    });

    it('should import multiple files', async () => {
      const targetDir = path.join(testDir, 'output');

      const result = await importManager.importPages({
        sourceDir: testDir,
        targetDir,
        format: 'mock',
        dryRun: true
      });

      expect(result.success).toBe(true);
      expect(result.converted).toBe(2);
      expect(result.files.length).toBe(2);
    });

    it('should respect limit option', async () => {
      const result = await importManager.importPages({
        sourceDir: testDir,
        format: 'mock',
        limit: 1,
        dryRun: true
      });

      expect(result.converted).toBe(1);
    });

    it('should respect offset option', async () => {
      const result = await importManager.importPages({
        sourceDir: testDir,
        format: 'mock',
        offset: 1,
        dryRun: true
      });

      expect(result.converted).toBe(1);
    });

    it('should return error for non-existent directory', async () => {
      const result = await importManager.importPages({
        sourceDir: '/non/existent/path',
        dryRun: true
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should process subdirectories recursively', async () => {
      // Create subdirectory with files
      const subDir = path.join(testDir, 'subdir');
      await fs.ensureDir(subDir);
      await fs.writeFile(path.join(subDir, 'nested.mock'), 'Nested content');

      const result = await importManager.importPages({
        sourceDir: testDir,
        format: 'mock',
        dryRun: true
      });

      expect(result.converted).toBe(3); // 2 in root + 1 in subdir
    });
  });

  describe('previewImport', () => {
    it('should always be a dry run', async () => {
      await fs.writeFile(path.join(testDir, 'test.mock'), 'Content');
      importManager.registerConverter(new MockConverter());

      const result = await importManager.previewImport({
        sourceDir: testDir,
        format: 'mock',
        dryRun: false // Should be overridden
      });

      expect(result.files.every(f => f.written === false)).toBe(true);
    });
  });

  describe('backup and restore', () => {
    it('should backup registered formats', async () => {
      importManager.registerConverter(new MockConverter());
      const backup = await importManager.backup();

      expect(backup.managerName).toBe('ImportManager');
      expect(backup.data.registeredFormats).toContain('jspwiki');
      expect(backup.data.registeredFormats).toContain('mock');
    });
  });

  describe('JSPWiki attachment import', () => {
    it('should import attachments from -att/ directory', async () => {
      // Create JSPWiki page with attachment structure
      const sourceFile = path.join(testDir, 'Test+Page.txt');
      await fs.writeFile(sourceFile, '!!! Test Page\nSome content');

      // Create -att/ directory structure
      const attDir = path.join(testDir, 'Test+Page-att');
      const fileDir = path.join(attDir, 'photo.jpg-dir');
      await fs.ensureDir(fileDir);
      await fs.writeFile(path.join(fileDir, '1.jpg'), Buffer.from('fake-jpg-data'));
      await fs.writeFile(
        path.join(fileDir, 'attachment.properties'),
        'author=JimUser\ndate=2024-01-01'
      );

      const targetDir = path.join(testDir, 'output');

      // #1179: the importer's own context travels to the upload door — never
      // rebuilt from the imported file's `author` (#1181).
      const IMPORTER = { username: 'importer', roles: ['admin'], isAuthenticated: true };
      const result = await importManager.importSinglePage(sourceFile, {
        sourceDir: testDir,
        targetDir,
        format: 'jspwiki',
        dryRun: false,
        actorContext: IMPORTER
      });

      expect(result).not.toBeNull();
      expect(result.attachments).toBeDefined();
      expect(result.attachments.imported).toBe(1);
      expect(result.attachments.errors.length).toBe(0);
      expect(mockUploadAttachment).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({
          originalName: 'photo.jpg',
          mimeType: 'image/jpeg'
        }),
        IMPORTER,
        expect.objectContaining({
          pageName: 'Test Page',
          description: 'photo.jpg'
        })
      );
    });

    it('should pick the latest version file', async () => {
      const sourceFile = path.join(testDir, 'VersionTest.txt');
      await fs.writeFile(sourceFile, '!!! Version Test');

      const attDir = path.join(testDir, 'VersionTest-att');
      const fileDir = path.join(attDir, 'doc.pdf-dir');
      await fs.ensureDir(fileDir);
      await fs.writeFile(path.join(fileDir, '1.pdf'), Buffer.from('version1'));
      await fs.writeFile(path.join(fileDir, '3.pdf'), Buffer.from('version3-latest'));
      await fs.writeFile(path.join(fileDir, '2.pdf'), Buffer.from('version2'));

      const targetDir = path.join(testDir, 'output');

      await importManager.importSinglePage(sourceFile, {
        sourceDir: testDir,
        targetDir,
        format: 'jspwiki',
        dryRun: false
      });

      // The uploaded buffer should be the version 3 content
      const uploadedBuffer = mockUploadAttachment.mock.calls[
        mockUploadAttachment.mock.calls.length - 1
      ][0];
      expect(uploadedBuffer.toString()).toBe('version3-latest');
    });

    it('should count attachments in dry-run without uploading', async () => {
      const sourceFile = path.join(testDir, 'DryRun.txt');
      await fs.writeFile(sourceFile, '!!! Dry Run');

      const attDir = path.join(testDir, 'DryRun-att');
      const fileDir = path.join(attDir, 'image.png-dir');
      await fs.ensureDir(fileDir);
      await fs.writeFile(path.join(fileDir, '1.png'), Buffer.from('fake-png'));

      mockUploadAttachment.mockClear();

      const result = await importManager.importSinglePage(sourceFile, {
        sourceDir: testDir,
        format: 'jspwiki',
        dryRun: true
      });

      expect(result.attachments).toBeDefined();
      expect(result.attachments.imported).toBe(1);
      expect(mockUploadAttachment).not.toHaveBeenCalled();
    });

    it('should handle pages without attachments gracefully', async () => {
      const sourceFile = path.join(testDir, 'NoAttach.txt');
      await fs.writeFile(sourceFile, '!!! No Attachments');

      const result = await importManager.importSinglePage(sourceFile, {
        sourceDir: testDir,
        format: 'jspwiki',
        dryRun: true
      });

      expect(result.attachments).toBeDefined();
      expect(result.attachments.imported).toBe(0);
      expect(result.attachments.errors.length).toBe(0);
    });
  });

  describe('JSPWiki page name decoding', () => {
    it('should decode + as space in page names', async () => {
      const sourceFile = path.join(testDir, 'Action+potential.txt');
      await fs.writeFile(sourceFile, 'Content about action potentials');

      const result = await importManager.importSinglePage(sourceFile, {
        sourceDir: testDir,
        format: 'jspwiki',
        dryRun: true
      });

      expect(result.metadata['title']).toBe('Action potential');
    });

    it('should decode percent-encoded characters in page names', async () => {
      const sourceFile = path.join(testDir, '%CE%92-Hydroxybutyric+acid.txt');
      await fs.writeFile(sourceFile, 'Content about beta-hydroxybutyric acid');

      const result = await importManager.importSinglePage(sourceFile, {
        sourceDir: testDir,
        format: 'jspwiki',
        dryRun: true
      });

      expect(result.metadata['title']).toBe('\u0392-Hydroxybutyric acid');
    });
  });

  describe('JSPWiki conversion integration', () => {
    it('should convert JSPWiki files correctly', async () => {
      const jspwikiContent = `!!! My Page Title

This is __bold__ and ''italic'' text.

* Item 1
* Item 2

See [OtherPage] for more.`;

      const sourceFile = path.join(testDir, 'wiki.txt');
      await fs.writeFile(sourceFile, jspwikiContent);

      const result = await importManager.importSinglePage(sourceFile, {
        sourceDir: testDir,
        format: 'jspwiki',
        dryRun: true
      });

      expect(result).not.toBeNull();
      expect(result.format).toBe('jspwiki');
      expect(result.warnings).toBeDefined();
    });
  });

  describe('frontmatter defaults', () => {
    it('should include slug, system-category, user-keywords, lastModified in frontmatter', async () => {
      const content = '!!! Year\nSome content';
      const sourceFile = path.join(testDir, 'Year.txt');
      await fs.writeFile(sourceFile, content);

      // Write to a real file to inspect frontmatter
      const targetDir = path.join(testDir, 'output');
      await fs.ensureDir(targetDir);

      const result = await importManager.importSinglePage(sourceFile, {
        sourceDir: testDir,
        targetDir,
        format: 'jspwiki',
        dryRun: false
      });

      expect(result).not.toBeNull();
      expect(result.written).toBe(true);

      // Read the written file and verify frontmatter
      const written = await fs.readFile(result.targetPath, 'utf-8');
      expect(written).toContain('slug:');
      expect(written).toContain('system-category:');
      expect(written).toContain('user-keywords:');
      expect(written).toContain('lastModified:');
      expect(written).toContain('importedFrom: jspwiki');
    });

    it('should use ValidationManager defaults when available', async () => {
      // Create a manager with a mock ValidationManager
      const mockValidationEngine = {
        getManager: vi.fn((name) => {
          if (name === 'ValidationManager') {
            return {
              generateValidMetadata: vi.fn((title, opts) => ({
                title,
                uuid: opts.uuid || 'test-uuid',
                slug: title.toLowerCase().replace(/\s+/g, '-'),
                'system-category': 'general',
                'user-keywords': [],
                lastModified: '2026-02-04T00:00:00.000Z'
              }))
            };
          }
          if (name === 'AttachmentManager') {
            return { uploadAttachment: vi.fn().mockResolvedValue({ identifier: 'abc' }) };
          }
          return { getProperty: vi.fn().mockReturnValue('./data/pages') };
        })
      };

      const mgr = new ImportManager(mockValidationEngine);
      await mgr.initialize();

      const content = '!!! Test Page\nBody text';
      const sourceFile = path.join(testDir, 'TestPage.txt');
      await fs.writeFile(sourceFile, content);

      const targetDir = path.join(testDir, 'output2');
      await fs.ensureDir(targetDir);

      const result = await mgr.importSinglePage(sourceFile, {
        sourceDir: testDir,
        targetDir,
        format: 'jspwiki',
        dryRun: false
      });

      expect(result).not.toBeNull();
      const written = await fs.readFile(result.targetPath, 'utf-8');
      expect(written).toContain('system-category: general');
      expect(written).toContain('slug: testpage');

      await mgr.shutdown();
    });
  });

  describe('keyword normalization (#545)', () => {
    const mockKwEngine = {
      getManager: vi.fn((name) => {
        if (name === 'AttachmentManager') return { uploadAttachment: vi.fn().mockResolvedValue({ identifier: 'abc' }) };
        return { getProperty: vi.fn().mockReturnValue('./data/pages'), setProperty: vi.fn().mockResolvedValue(undefined) };
      })
    };

    // Helper: register a one-shot converter that returns the given metadata
    function makeKwConverter(metadata: Record<string, unknown>) {
      return {
        formatId: 'kw-test',
        formatName: 'KW Test',
        fileExtensions: ['.kwtest'],
        canHandle: () => true,
        convert: () => ({ content: 'Body', metadata: { title: 'KW Page', ...metadata }, warnings: [] })
      };
    }

    it('should normalize space-separated scalar user-keywords to YAML list', async () => {
      const mgr = new ImportManager(mockKwEngine);
      await mgr.initialize();
      mgr.registerConverter(makeKwConverter({ 'user-keywords': 'metrics monitoring observability' }));

      const sourceFile = path.join(testDir, 'kw1.kwtest');
      await fs.writeFile(sourceFile, 'content');
      const targetDir = path.join(testDir, 'out-kw1');
      await fs.ensureDir(targetDir);

      const result = await mgr.importSinglePage(sourceFile, { sourceDir: testDir, targetDir, format: 'kw-test', dryRun: false });
      expect(result.written).toBe(true);
      const written = await fs.readFile(result.targetPath, 'utf-8');
      expect(written).toMatch(/user-keywords:\s*\n\s+-\s+metrics/);
      expect(written).not.toMatch(/user-keywords: metrics monitoring/);
      await mgr.shutdown();
    });

    it('should normalize comma-separated scalar user-keywords to YAML list', async () => {
      const mgr = new ImportManager(mockKwEngine);
      await mgr.initialize();
      mgr.registerConverter(makeKwConverter({ 'user-keywords': 'foo,bar,baz' }));

      const sourceFile = path.join(testDir, 'kw2.kwtest');
      await fs.writeFile(sourceFile, 'content');
      const targetDir = path.join(testDir, 'out-kw2');
      await fs.ensureDir(targetDir);

      const result = await mgr.importSinglePage(sourceFile, { sourceDir: testDir, targetDir, format: 'kw-test', dryRun: false });
      expect(result.written).toBe(true);
      const written = await fs.readFile(result.targetPath, 'utf-8');
      expect(written).toMatch(/user-keywords:\s*\n\s+-\s+foo/);
      expect(written).toMatch(/- bar/);
      expect(written).toMatch(/- baz/);
      await mgr.shutdown();
    });

    it('should preserve user-keywords already provided as an array', async () => {
      const mgr = new ImportManager(mockKwEngine);
      await mgr.initialize();
      mgr.registerConverter(makeKwConverter({ 'user-keywords': ['alpha', 'beta'] }));

      const sourceFile = path.join(testDir, 'kw3.kwtest');
      await fs.writeFile(sourceFile, 'content');
      const targetDir = path.join(testDir, 'out-kw3');
      await fs.ensureDir(targetDir);

      const result = await mgr.importSinglePage(sourceFile, { sourceDir: testDir, targetDir, format: 'kw-test', dryRun: false });
      expect(result.written).toBe(true);
      const written = await fs.readFile(result.targetPath, 'utf-8');
      expect(written).toMatch(/- alpha/);
      expect(written).toMatch(/- beta/);
      await mgr.shutdown();
    });

    it('should normalize scalar system-keywords to YAML list', async () => {
      const mgr = new ImportManager(mockKwEngine);
      await mgr.initialize();
      mgr.registerConverter(makeKwConverter({ 'system-keywords': 'internal system' }));

      const sourceFile = path.join(testDir, 'kw4.kwtest');
      await fs.writeFile(sourceFile, 'content');
      const targetDir = path.join(testDir, 'out-kw4');
      await fs.ensureDir(targetDir);

      const result = await mgr.importSinglePage(sourceFile, { sourceDir: testDir, targetDir, format: 'kw-test', dryRun: false });
      expect(result.written).toBe(true);
      const written = await fs.readFile(result.targetPath, 'utf-8');
      expect(written).not.toMatch(/system-keywords: internal system/);
      expect(written).toMatch(/- internal/);
      await mgr.shutdown();
    });
  });

  describe('conflict policy (#874)', () => {
    const existingMetadata = {
      title: 'Existing Page',
      uuid: 'existing-uuid-1234',
      author: 'original-author',
      created: '2025-01-01T00:00:00.000Z',
      slug: 'existing-page',
      'system-category': 'general'
    };

    let mockSavePage;
    let mockUpdatePageInIndex;
    let mockUpdatePageInLinkGraph;
    let conflictEngine;

    class ConflictConverter {
      formatId = 'conflict-test';
      formatName = 'Conflict Test';
      fileExtensions = ['.ctest'];
      convert(content) {
        return {
          content: `CONVERTED: ${content}`,
          metadata: { title: 'Existing Page', importedFrom: 'conflict-test' },
          warnings: []
        };
      }
      canHandle(content, filename) {
        return filename.endsWith('.ctest');
      }
    }

    beforeEach(() => {
      mockSavePage = vi.fn().mockResolvedValue(undefined);
      mockUpdatePageInIndex = vi.fn().mockResolvedValue(undefined);
      mockUpdatePageInLinkGraph = vi.fn();
      conflictEngine = {
        getManager: vi.fn((name) => {
          if (name === 'PageManager') {
            return {
              getPageMetadata: vi.fn().mockResolvedValue(existingMetadata),
              getPage: vi.fn().mockResolvedValue({
                name: 'Existing Page',
                content: 'old content',
                metadata: existingMetadata
              }),
              savePage: mockSavePage
            };
          }
          if (name === 'RenderingManager') {
            return {
              addPageToCache: vi.fn(),
              updatePageInLinkGraph: mockUpdatePageInLinkGraph
            };
          }
          if (name === 'SearchManager') {
            return { updatePageInIndex: mockUpdatePageInIndex };
          }
          if (name === 'CacheManager') {
            return { isInitialized: () => false };
          }
          if (name === 'AttachmentManager') {
            return { uploadAttachment: mockUploadAttachment };
          }
          return { getProperty: vi.fn().mockReturnValue('./data/pages') };
        })
      };
    });

    async function importOne(options = {}) {
      const mgr = new ImportManager(conflictEngine);
      await mgr.initialize();
      mgr.registerConverter(new ConflictConverter());
      const sourceFile = path.join(testDir, 'existing.ctest');
      await fs.writeFile(sourceFile, 'new imported content');
      const targetDir = path.join(testDir, 'out-conflict');
      await fs.ensureDir(targetDir);
      const result = await mgr.importSinglePage(sourceFile, {
        sourceDir: testDir,
        targetDir,
        format: 'conflict-test',
        ...options
      });
      await mgr.shutdown();
      return result;
    }

    it('skips duplicates by default (policy omitted)', async () => {
      const result = await importOne({ dryRun: false });
      expect(result.written).toBe(false);
      expect(result.skippedReason).toBe('duplicate');
      expect(result.existingPageUuid).toBe('existing-uuid-1234');
      expect(mockSavePage).not.toHaveBeenCalled();
    });

    it('skips duplicates when policy is explicitly skip', async () => {
      const result = await importOne({ dryRun: false, conflictPolicy: 'skip' });
      expect(result.skippedReason).toBe('duplicate');
      expect(mockSavePage).not.toHaveBeenCalled();
    });

    it('overwrites in place via PageManager save, preserving identity fields', async () => {
      const result = await importOne({
        dryRun: false,
        conflictPolicy: 'overwrite',
        actor: 'importer-user'
      });

      expect(result.written).toBe(true);
      expect(result.overwritten).toBe(true);
      expect(result.skippedReason).toBeUndefined();
      expect(result.existingPageUuid).toBe('existing-uuid-1234');

      expect(mockSavePage).toHaveBeenCalledTimes(1);
      const [savedTitle, savedContent, savedMetadata] = mockSavePage.mock.calls[0];
      expect(savedTitle).toBe('Existing Page');
      expect(savedContent).toContain('CONVERTED: new imported content');
      expect(savedMetadata.uuid).toBe('existing-uuid-1234');
      expect(savedMetadata.author).toBe('original-author');
      expect(savedMetadata.created).toBe('2025-01-01T00:00:00.000Z');
      expect(savedMetadata.slug).toBe('existing-page');
      expect(savedMetadata.editor).toBe('importer-user');
      expect(savedMetadata.importedFrom).toBe('conflict-test');
    });

    it('updates search index and link graph in-band after overwrite', async () => {
      await importOne({ dryRun: false, conflictPolicy: 'overwrite', actor: 'importer-user' });
      expect(mockUpdatePageInIndex).toHaveBeenCalledTimes(1);
      expect(mockUpdatePageInIndex.mock.calls[0][0]).toBe('Existing Page');
      expect(mockUpdatePageInLinkGraph).toHaveBeenCalledTimes(1);
    });

    it('reports would-overwrite on dry run without saving', async () => {
      const result = await importOne({ dryRun: true, conflictPolicy: 'overwrite' });
      expect(result.written).toBe(false);
      expect(result.overwritten).toBe(true);
      expect(result.skippedReason).toBeUndefined();
      expect(mockSavePage).not.toHaveBeenCalled();
      expect(result.warnings.some(w => w.includes('will be overwritten'))).toBe(true);
    });

    // Regression: pages that predate the save pipeline (raw imports) have no
    // `author` in frontmatter. Carrying author: undefined into savePage made
    // gray-matter/js-yaml throw "unacceptable kind of an object to dump" and
    // the whole file failed. Undefined fields must be stripped and author
    // falls back to the import actor.
    it('overwrites author-less pre-pipeline pages without undefined metadata', async () => {
      const authorlessMetadata = {
        title: 'Existing Page',
        uuid: 'existing-uuid-1234',
        slug: 'existing-page',
        'system-category': 'general'
        // no author, no created — raw-import shape
      };
      conflictEngine.getManager = vi.fn((name) => {
        if (name === 'PageManager') {
          return {
            getPageMetadata: vi.fn().mockResolvedValue(authorlessMetadata),
            getPage: vi.fn().mockResolvedValue({
              name: 'Existing Page',
              content: 'old content',
              metadata: authorlessMetadata
            }),
            savePage: mockSavePage
          };
        }
        if (name === 'RenderingManager') {
          return { addPageToCache: vi.fn(), updatePageInLinkGraph: mockUpdatePageInLinkGraph };
        }
        if (name === 'SearchManager') {
          return { updatePageInIndex: mockUpdatePageInIndex };
        }
        if (name === 'CacheManager') {
          return { isInitialized: () => false };
        }
        if (name === 'AttachmentManager') {
          return { uploadAttachment: mockUploadAttachment };
        }
        return { getProperty: vi.fn().mockReturnValue('./data/pages') };
      });

      const result = await importOne({
        dryRun: false,
        conflictPolicy: 'overwrite',
        actor: 'importer-user'
      });

      expect(result.written).toBe(true);
      expect(mockSavePage).toHaveBeenCalledTimes(1);
      const savedMetadata = mockSavePage.mock.calls[0][2];
      expect(savedMetadata.author).toBe('importer-user');
      expect(savedMetadata.uuid).toBe('existing-uuid-1234');
      expect(Object.values(savedMetadata).every(v => v !== undefined)).toBe(true);
    });
  });

  describe('save pipeline for new pages (#880)', () => {
    let scratchPagesDir;
    let mockSavePage;
    let mockUpdatePageInIndex;
    let mockUpdatePageInLinkGraph;
    let pipelineEngine;

    class PipelineConverter {
      formatId = 'pipeline-test';
      formatName = 'Pipeline Test';
      fileExtensions = ['.ptest'];
      convert(content) {
        return {
          content: `CONVERTED: ${content}`,
          metadata: { title: 'Brand New Page', importedFrom: 'pipeline-test' },
          warnings: []
        };
      }
      canHandle(content, filename) {
        return filename.endsWith('.ptest');
      }
    }

    beforeEach(() => {
      scratchPagesDir = path.join(testDir, 'live-pages');
      mockSavePage = vi.fn().mockResolvedValue(undefined);
      mockUpdatePageInIndex = vi.fn().mockResolvedValue(undefined);
      mockUpdatePageInLinkGraph = vi.fn();
      pipelineEngine = {
        getManager: vi.fn((name) => {
          if (name === 'PageManager') {
            return {
              getPageMetadata: vi.fn().mockResolvedValue(null),
              getPage: vi.fn().mockResolvedValue({
                name: 'Brand New Page',
                content: 'saved content',
                metadata: { title: 'Brand New Page', uuid: 'new-uuid' }
              }),
              savePage: mockSavePage
            };
          }
          if (name === 'RenderingManager') {
            return { addPageToCache: vi.fn(), updatePageInLinkGraph: mockUpdatePageInLinkGraph };
          }
          if (name === 'SearchManager') {
            return { updatePageInIndex: mockUpdatePageInIndex };
          }
          if (name === 'CacheManager') {
            return { isInitialized: () => false };
          }
          if (name === 'AttachmentManager') {
            return { uploadAttachment: mockUploadAttachment };
          }
          return {
            getProperty: vi.fn((key, def) =>
              key === 'ngdpbase.page.provider.filesystem.storagedir' ? scratchPagesDir : def)
          };
        })
      };
    });

    async function importNew(options = {}) {
      const mgr = new ImportManager(pipelineEngine);
      await mgr.initialize();
      mgr.registerConverter(new PipelineConverter());
      const sourceFile = path.join(testDir, 'new-page.ptest');
      await fs.writeFile(sourceFile, 'fresh content');
      const result = await mgr.importSinglePage(sourceFile, {
        sourceDir: testDir,
        format: 'pipeline-test',
        ...options
      });
      await mgr.shutdown();
      return result;
    }

    it('creates new pages via PageManager.savePage when targeting the live pages dir', async () => {
      const result = await importNew({ dryRun: false, actor: 'importer-user' });

      expect(result.written).toBe(true);
      expect(mockSavePage).toHaveBeenCalledTimes(1);
      const [savedTitle, savedContent, savedMetadata] = mockSavePage.mock.calls[0];
      expect(savedTitle).toBe('Brand New Page');
      expect(savedContent).toContain('CONVERTED: fresh content');
      expect(savedMetadata.title).toBe('Brand New Page');
      expect(savedMetadata.uuid).toBeTruthy();
      expect(savedMetadata.author).toBe('importer-user');
      expect(savedMetadata.editor).toBe('importer-user');
      expect(savedMetadata.importedFrom).toBe('pipeline-test');
    });

    it('updates search index and link graph in-band for new pages', async () => {
      await importNew({ dryRun: false, actor: 'importer-user' });
      expect(mockUpdatePageInIndex).toHaveBeenCalledTimes(1);
      expect(mockUpdatePageInIndex.mock.calls[0][0]).toBe('Brand New Page');
      expect(mockUpdatePageInLinkGraph).toHaveBeenCalledTimes(1);
    });

    it('does not raw-write a file when the pipeline path is used', async () => {
      await importNew({ dryRun: false, actor: 'importer-user' });
      expect(await fs.pathExists(scratchPagesDir)).toBe(false);
    });

    it('explicit non-live targetDir keeps the raw file write (export mode)', async () => {
      const exportDir = path.join(testDir, 'export-out');
      await fs.ensureDir(exportDir);
      const result = await importNew({ dryRun: false, targetDir: exportDir, actor: 'importer-user' });

      expect(mockSavePage).not.toHaveBeenCalled();
      expect(result.written).toBe(true);
      expect(await fs.pathExists(result.targetPath)).toBe(true);
      const raw = await fs.readFile(result.targetPath, 'utf-8');
      expect(raw).toContain('CONVERTED: fresh content');
    });

    it('dry run touches nothing', async () => {
      await importNew({ dryRun: true });
      expect(mockSavePage).not.toHaveBeenCalled();
      expect(mockUpdatePageInIndex).not.toHaveBeenCalled();
    });
  });

  // #1131: the first binary source format — .docx through the full pipeline.
  describe('docx import (#1131)', () => {
    const FIXTURE = path.join(__dirname, '..', '..', 'converters', '__tests__', 'fixtures', 'sample.docx');

    it('auto-detects .docx by extension and converts through the html→NCM path', async () => {
      await fs.copy(FIXTURE, path.join(testDir, 'sample.docx'));
      const result = await importManager.importPages({
        sourceDir: testDir,
        targetDir: path.join(testDir, 'output'),
        format: 'auto',
        dryRun: true
      });
      expect(result.success).toBe(true);
      const file = result.files.find((f) => f.sourcePath.endsWith('sample.docx'));
      expect(file).toBeDefined();
      expect(file.format).toBe('docx');
      // The heading and bold survived docx → mammoth HTML → NCM markdown.
      expect(file.metadata['ncmVersion']).toBeDefined();
      expect(file.metadata['importedFrom']).toBe('docx');
    });

    it('the converted body is NCM markdown, not HTML', async () => {
      await fs.copy(FIXTURE, path.join(testDir, 'body.docx'));
      const single = await importManager.importPages({
        sourceDir: testDir,
        targetDir: path.join(testDir, 'out2'),
        format: 'auto',
        dryRun: false
      });
      const file = single.files.find((f) => f.sourcePath.endsWith('body.docx'));
      expect(file.written).toBe(true);
      const written = await fs.readFile(file.targetPath, 'utf-8');
      expect(written).toContain('# Docx Import Title');
      expect(written).toContain('**bold words**');
      expect(written).not.toContain('<h1>');
    });
  });

});
