import ExportManager from '../../managers/ExportManager';
import LocaleUtils from '../../utils/LocaleUtils';
import path from 'path';
import { type Mocked } from 'vitest';

// Mock fs/promises module to avoid real file I/O
// Use shared vi.fn() instances so ExportManager's default import matches test assertions
vi.mock('fs/promises', () => {
  const mkdir = vi.fn();
  const writeFile = vi.fn();
  const readdir = vi.fn();
  const stat = vi.fn();
  const unlink = vi.fn();
  return {
    default: { mkdir, writeFile, readdir, stat, unlink },
    mkdir, writeFile, readdir, stat, unlink
  };
});

// Mock LocaleUtils to control formatted date/time output
vi.mock('../../utils/LocaleUtils', () => {
  const formatDate = vi.fn();
  const formatTime = vi.fn();
  return { default: { formatDate, formatTime }, formatDate, formatTime };
});

import fsDefault from 'fs/promises';
const fs = fsDefault as unknown as Mocked<{ mkdir: any; writeFile: any; readdir: any; stat: any; unlink: any }>;

describe('ExportManager', () => {
  let exportManager;
  let mockEngine;
  let mockPageManager;
  let mockRenderingManager;

  // Setup fresh instance and mocks before each test
  beforeEach(() => {
    mockPageManager = { getPage: vi.fn() };
    mockRenderingManager = { renderMarkdown: vi.fn() };
    mockEngine = {
      getManager: vi.fn((name) => {
        if (name === 'PageManager') return mockPageManager;
        if (name === 'RenderingManager') return mockRenderingManager;
        return null;
      })
    };
    exportManager = new ExportManager(mockEngine);
  });

  // Clear all mocks after each test to avoid cross-test pollution
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Tests for initialization of ExportManager
  describe('initialize', () => {
    it('should set exportDirectory and create directory', async () => {
      await exportManager.initialize({ exportDirectory: './my-exports' });
      expect(exportManager.exportDirectory).toBe('./my-exports');
      expect(fs.mkdir).toHaveBeenCalledWith('./my-exports', {
        recursive: true
      });
    });

    it('should fallback to default exportDirectory', async () => {
      await exportManager.initialize();
      expect(exportManager.exportDirectory).toBe('./exports');
      expect(fs.mkdir).toHaveBeenCalledWith('./exports', {
        recursive: true
      });
    });
  });

  // Tests for exporting a single page to HTML
  describe('exportPageToHtml', () => {
    it('should throw error if page not found', async () => {
      mockPageManager.getPage.mockResolvedValue(null);
      await expect(
        exportManager.exportPageToHtml('NonExistentPage')
      ).rejects.toThrow("Page 'NonExistentPage' not found");
    });

    it('should return HTML content for a page', async () => {
      const page = {
        content: '# Hello World',
        lastModified: '2025-01-01',
        'system-category': 'Test',
        'user-keywords': ['keyword1']
      };
      mockPageManager.getPage.mockResolvedValue(page);
      mockRenderingManager.renderMarkdown.mockResolvedValue(
        '<h1>Hello World</h1>'
      );

      const html = await exportManager.exportPageToHtml('TestPage');

      // Verify that HTML contains expected content and metadata
      expect(html).toContain('<h1>TestPage</h1>');
      expect(html).toContain('<h1>Hello World</h1>');
      expect(html).toContain('System Category: Test');
      expect(html).toContain('User Keywords: keyword1');
    });

    it('should handle pages with no system-category or keywords', async () => {
      const page = { content: 'Hello', lastModified: '2025-01-01' };
      mockPageManager.getPage.mockResolvedValue(page);
      mockRenderingManager.renderMarkdown.mockResolvedValue('<p>Hello</p>');

      const html = await exportManager.exportPageToHtml('PageX');
      expect(html).toContain('<p>Hello</p>');
      expect(html).not.toContain('System Category');
      expect(html).not.toContain('User Keywords');
    });

    it("should show 'Unknown' if lastModified is missing", async () => {
      const page = { content: 'Hello' };
      mockPageManager.getPage.mockResolvedValue(page);
      mockRenderingManager.renderMarkdown.mockResolvedValue('<p>Hello</p>');

      const html = await exportManager.exportPageToHtml('PageUnknown');

      expect(html).toContain('Last modified: Unknown');
    });
  });

  // Tests for exporting pages to Markdown format
  describe('exportToMarkdown', () => {
    it('should export single page to markdown', async () => {
      const page = { content: '# Markdown Content' };
      mockPageManager.getPage.mockResolvedValue(page);

      const markdown = await exportManager.exportToMarkdown('SinglePage');

      expect(markdown).toContain('# Markdown Content');
      expect(markdown).not.toContain('Table of Contents');
    });
  });

  // Tests for saving exported content to file
  describe('saveExport', () => {
    it('should sanitize filename and call writeFile', async () => {
      const content = 'Some content';
      const filename = 'My Page';
      const format = 'html';

      fs.writeFile.mockResolvedValue();

      const filePath = await exportManager.saveExport(
        content,
        filename,
        format
      );

      expect(filePath).toContain('My-Page_'); // Check filename sanitization
      expect(filePath.endsWith('.html')).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(
        filePath,
        content,
        'utf8'
      );
    });

    it('should sanitize filenames with invalid characters', async () => {
      const content = 'Some content';
      const filename = 'My/Strange*File?Name';
      const format = 'md';

      fs.writeFile.mockResolvedValue();

      const filePath = await exportManager.saveExport(content, filename, format);

      expect(filePath).toContain('My-Strange-File-Name_');
      expect(filePath.endsWith('.md')).toBe(true);
      expect(fs.writeFile).toHaveBeenCalledWith(filePath, content, 'utf8');
    });

    it('should include timestamp in filename', async () => {
      const content = 'Test content';
      const filename = 'FileTest';
      const format = 'html';

      fs.writeFile.mockResolvedValue();

      const filePath = await exportManager.saveExport(content, filename, format);
      const timestampRegex = /\d{4}-\d{2}-\d{2}/;
      expect(filePath).toMatch(new RegExp(`FileTest_${timestampRegex.source}\\.html`));
    });

    it('should throw error if writeFile fails', async () => {
      fs.writeFile.mockRejectedValue(new Error('disk full'));
      await expect(exportManager.saveExport('data', 'file', 'html'))
        .rejects.toThrow('disk full');
    });
  });

  // Tests for retrieving list of export files
  describe('getExports', () => {
    it('should return sorted export files', async () => {
      const files = ['file1', 'file2'];

      fs.readdir.mockResolvedValue(files);

      fs.stat.mockImplementation((filePath) => {
        if (filePath.includes('file1')) {
          return Promise.resolve({
            size: 123,
            birthtime: new Date(Date.UTC(2025, 0, 1)),
            mtime: new Date()
          });
        } else {
          return Promise.resolve({
            size: 123,
            birthtime: new Date(Date.UTC(2025, 0, 2)),
            mtime: new Date()
          });
        }
      });

      const exportsList = await exportManager.getExports();

      expect(exportsList.length).toBe(2);
      expect(exportsList[0].filename).toBe('file2'); // newest first
      expect(exportsList[1].filename).toBe('file1'); // oldest second
    });

    it('should return empty array on error', async () => {
      fs.readdir.mockRejectedValue(new Error('fs error'));

      const exportsList = await exportManager.getExports();
      expect(exportsList).toEqual([]);
    });

    it('should return empty array if directory is empty', async () => {
      fs.readdir.mockResolvedValue([]);
      const exportsList = await exportManager.getExports();
      expect(exportsList).toEqual([]);
    });

    it('should correctly sort files by creation date', async () => {
      fs.readdir.mockResolvedValue(['a', 'b', 'c']);
      fs.stat.mockImplementation((filePath) => {
        const map = {
          a: new Date(Date.UTC(2025, 0, 2)),
          b: new Date(Date.UTC(2025, 0, 1)),
          c: new Date(Date.UTC(2025, 0, 3))
        };
        return Promise.resolve({
          size: 123,
          birthtime: map[path.basename(filePath)],
          mtime: new Date()
        });
      });

      const exportsList = await exportManager.getExports();
      expect(exportsList.map(f => f.filename)).toEqual(['c', 'a', 'b']); // newest first
    });

    it('should handle fs errors gracefully', async () => {
      fs.readdir.mockRejectedValue(new Error('fs error'));
      const exportsList = await exportManager.getExports();
      expect(exportsList).toEqual([]);
    });

    it('should return empty array if any fs.stat fails', async () => {
      // Note: Current implementation catches all errors and returns empty array
      // Rather than skipping individual files that fail
      fs.readdir.mockResolvedValue(['goodFile', 'badFile']);
      fs.stat.mockImplementation((file) => {
        if (file.includes('badFile')) throw new Error('fs error');
        return Promise.resolve({ size: 123, birthtime: new Date(), mtime: new Date() });
      });

      const exportsList = await exportManager.getExports();
      // Implementation returns empty array on any error in the loop
      expect(exportsList).toEqual([]);
    });
  });

  describe('deleteExport', () => {
    // Tests for deleting an export file
    it('should call unlink with correct file path', async () => {
      fs.unlink.mockResolvedValue();
      exportManager.exportDirectory = './exports';
      const filename = 'file.html';

      await exportManager.deleteExport(filename);

      expect(fs.unlink).toHaveBeenCalledWith(
        path.join('./exports', filename)
      );
    });

    it('should handle non-existent file deletion gracefully', async () => {
      fs.unlink.mockRejectedValue(new Error('File not found'));
      exportManager.exportDirectory = './exports';
      await expect(exportManager.deleteExport('missing.html')).rejects.toThrow('File not found');
    });

    it('should delete a plain name with special chars', async () => {
      fs.unlink.mockResolvedValue();
      exportManager.exportDirectory = './exports';
      await exportManager.deleteExport('file?name.html');
      expect(fs.unlink).toHaveBeenCalledWith(path.join('./exports', 'file?name.html'));
    });

    it.each(['my/file.html', '../outside.html', '../../config/app-custom-config.json', '..', '.', ''])(
      'refuses %j, which is not a plain file name in the export folder',
      async (name) => {
        fs.unlink.mockResolvedValue();
        exportManager.exportDirectory = './exports';
        await expect(exportManager.deleteExport(name)).rejects.toThrow('Not an export file name');
        expect(fs.unlink).not.toHaveBeenCalled();
      }
    );
  });

  // Tests for generating formatted timestamp
  describe('getFormattedTimestamp', () => {
    it('should use user locale if provided', () => {
      const user = { preferences: { locale: 'en-US' } };
      LocaleUtils.formatDate.mockReturnValue('Jan 1, 2025');
      LocaleUtils.formatTime.mockReturnValue('12:00 PM');

      const timestamp = exportManager.getFormattedTimestamp(user);

      expect(timestamp).toBe('Jan 1, 2025 12:00 PM');
    });

    it('should fallback to system locale if no user locale', () => {
      const timestamp = exportManager.getFormattedTimestamp();
      expect(typeof timestamp).toBe('string');
    });

    it('should fallback if user.preferences.locale is missing', () => {
      const ts = exportManager.getFormattedTimestamp({ preferences: {} });
      expect(typeof ts).toBe('string');
    });

    it('should never throw even with null user', () => {
      expect(() => exportManager.getFormattedTimestamp(null)).not.toThrow();
    });

    it('should throw if LocaleUtils fails (no internal error handling)', () => {
      // Note: Current implementation doesn't catch LocaleUtils errors
      // It throws if LocaleUtils fails
      const user = { preferences: { locale: 'en-US' } };
      LocaleUtils.formatDate.mockImplementation(() => { throw new Error('fail'); });
      LocaleUtils.formatTime.mockImplementation(() => { throw new Error('fail'); });

      expect(() => exportManager.getFormattedTimestamp(user)).toThrow('fail');
    });
  });
});
