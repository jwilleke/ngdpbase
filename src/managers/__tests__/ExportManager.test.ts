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

  // Tests for rendering one page as an HTML document
  describe('renderPageDocument', () => {
    it('should return HTML content for a page', async () => {
      const page = {
        content: '# Hello World',
        lastModified: '2025-01-01',
        'system-category': 'Test',
        'user-keywords': ['keyword1']
      };
      mockRenderingManager.renderMarkdown.mockResolvedValue(
        '<h1>Hello World</h1>'
      );

      const html = await exportManager.renderPageDocument('TestPage', page);

      // Verify that HTML contains expected content and metadata
      expect(html).toContain('<h1>TestPage</h1>');
      expect(html).toContain('<h1>Hello World</h1>');
      expect(html).toContain('System Category: Test');
      expect(html).toContain('User Keywords: keyword1');
    });

    it('should handle pages with no system-category or keywords', async () => {
      const page = { content: 'Hello', lastModified: '2025-01-01' };
      mockRenderingManager.renderMarkdown.mockResolvedValue('<p>Hello</p>');

      const html = await exportManager.renderPageDocument('PageX', page);
      expect(html).toContain('<p>Hello</p>');
      expect(html).not.toContain('System Category');
      expect(html).not.toContain('User Keywords');
    });

    it("should show 'Unknown' if lastModified is missing", async () => {
      const page = { content: 'Hello' };
      mockRenderingManager.renderMarkdown.mockResolvedValue('<p>Hello</p>');

      const html = await exportManager.renderPageDocument('PageUnknown', page);

      expect(html).toContain('Last modified: Unknown');
    });
  });

  // Tests for retrieving list of export files

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
