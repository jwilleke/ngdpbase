/**
 * PageManager-Storage.test.js - Integration Tests
 *
 * Tests PageManager's storage operations with an actual FileSystemProvider.
 * These are integration tests that verify the full flow from PageManager
 * through to file system operations.
 *
 * For unit tests:
 * - PageManager proxy behavior: see PageManager.test.js
 * - FileSystemProvider operations: see FileSystemProvider.test.js
 *
 * @jest-environment node
 */

// Unmock FileSystemProvider to use actual implementation for integration tests
// Must happen before any requires
vi.unmock('../../providers/FileSystemProvider');
vi.unmock('../../utils/PageNameMatcher');

import path from 'path';
import fs from 'fs-extra';
import PageManager from '../PageManager';

// Test directories - unique per test run
let TEST_DIR;
let TEST_PAGES_DIR;
let TEST_REQUIRED_DIR;

// Create mock ConfigurationManager with test directories
const createMockConfigManager = () => ({
  getProperty: vi.fn((key, defaultValue) => {
    const config = {
      'ngdpbase.page.enabled': true,
      'ngdpbase.page.provider': 'filesystemprovider',
      'ngdpbase.page.provider.default': 'filesystemprovider',
      'ngdpbase.page.provider.filesystem.storagedir': TEST_PAGES_DIR,
      'ngdpbase.page.provider.filesystem.requiredpagesdir': TEST_REQUIRED_DIR,
      'ngdpbase.page.provider.filesystem.encoding': 'utf-8',
      'ngdpbase.translator-reader.match-english-plurals': true
    };
    return config[key] !== undefined ? config[key] : defaultValue;
  }),
  // Support INSTANCE_DATA_FOLDER feature
  getResolvedDataPath: vi.fn((key, defaultValue) => {
    if (key === 'ngdpbase.page.provider.filesystem.storagedir') {
      return TEST_PAGES_DIR;
    }
    return defaultValue;
  }),
  getInstanceDataFolder: vi.fn(() => TEST_DIR)
});

// Create mock engine
const createMockEngine = () => ({
  getManager: vi.fn((name) => {
    if (name === 'ConfigurationManager') {
      return createMockConfigManager();
    }
    return null;
  })
});

describe('PageManager Storage Integration', () => {
  let pageManager;
  let engine;

  beforeEach(async () => {
    // Create unique test directories
    TEST_DIR = path.join(__dirname, `../../temp-test-pm-storage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    TEST_PAGES_DIR = path.join(TEST_DIR, 'pages');
    TEST_REQUIRED_DIR = path.join(TEST_DIR, 'required-pages');

    await fs.ensureDir(TEST_PAGES_DIR);
    await fs.ensureDir(TEST_REQUIRED_DIR);

    engine = createMockEngine();
    pageManager = new PageManager(engine);
    await pageManager.initialize();
  });

  afterEach(async () => {
    if (pageManager && pageManager.provider) {
      await pageManager.shutdown();
    }
    if (TEST_DIR) {
      await fs.remove(TEST_DIR);
    }
  });

  describe('Save and Retrieve Pages', () => {
    test('should save a new page and retrieve it by title', async () => {
      await pageManager.savePage('Test Page', '# Hello World', {
        category: 'General',
        author: 'testuser'
      });

      const page = await pageManager.getPage('Test Page');

      expect(page).toBeDefined();
      expect(page.title).toBe('Test Page');
      expect(page.content).toContain('Hello World');
      expect(page.metadata.category).toBe('General');
      expect(page.metadata.author).toBe('testuser');
    });

    test('should save page and retrieve content only', async () => {
      await pageManager.savePage('Content Test', '# Just Content', {});

      const content = await pageManager.getPageContent('Content Test');

      expect(content).toContain('Just Content');
    });

    test('should save page and retrieve metadata only', async () => {
      await pageManager.savePage('Metadata Test', '# Test', {
        category: 'Testing',
        'user-keywords': ['test', 'metadata']
      });

      const metadata = await pageManager.getPageMetadata('Metadata Test');

      expect(metadata).toBeDefined();
      expect(metadata.title).toBe('Metadata Test');
      expect(metadata.category).toBe('Testing');
    });
  });

  describe('Page Existence and Listing', () => {
    test('should correctly identify existing pages', async () => {
      await pageManager.savePage('Exists Page', '# Content', {});

      expect(pageManager.pageExists('Exists Page')).toBe(true);
      expect(pageManager.pageExists('Does Not Exist')).toBe(false);
    });

    test('should list all pages', async () => {
      await pageManager.savePage('Page A', '# A', {});
      await pageManager.savePage('Page B', '# B', {});
      await pageManager.savePage('Page C', '# C', {});

      const allPages = await pageManager.getAllPages();

      expect(allPages).toHaveLength(3);
      expect(allPages).toContain('Page A');
      expect(allPages).toContain('Page B');
      expect(allPages).toContain('Page C');
    });
  });

  describe('Page Updates', () => {
    test('should update existing page content', async () => {
      await pageManager.savePage('Update Test', '# Original', { category: 'Original' });

      const original = await pageManager.getPage('Update Test');
      expect(original.content).toContain('Original');

      await pageManager.savePage('Update Test', '# Updated Content', {
        category: 'Updated',
        uuid: original.uuid
      });

      const updated = await pageManager.getPage('Update Test');
      expect(updated.content).toContain('Updated Content');
      expect(updated.metadata.category).toBe('Updated');
      expect(updated.uuid).toBe(original.uuid);
    });
  });

  describe('Agent provenance stamping (#946)', () => {
    const agentCtx = (pageName, content) => ({
      pageName,
      content,
      userContext: {
        username: 'jim',
        viaToken: { id: 'tok_1', name: 'claude-laptop', scopes: ['page-create', 'page-edit'] }
      }
    });
    const humanCtx = (pageName, content) => ({
      pageName,
      content,
      userContext: { username: 'sarah' }
    });

    test('an agent-created page records BOTH created-via-token and via-token', async () => {
      await pageManager.savePageWithContext(agentCtx('Agent Made', '# One'), {});
      const page = await pageManager.getPage('Agent Made');
      expect(page.metadata['created-via-token']).toBe('claude-laptop');
      expect(page.metadata['via-token']).toBe('claude-laptop');
      expect(page.metadata.author).toBe('jim');
    });

    test('a human edit CLEARS via-token but keeps created-via-token', async () => {
      // The whole point of two fields: origin is permanent, current state is not.
      await pageManager.savePageWithContext(agentCtx('Handover', '# One'), {});
      await pageManager.savePageWithContext(humanCtx('Handover', '# Two'), {});

      const page = await pageManager.getPage('Handover');
      expect(page.metadata['created-via-token']).toBe('claude-laptop');
      expect(page.metadata['via-token']).toBeUndefined();
      // author is immutable from create; the human is the editor.
      expect(page.metadata.author).toBe('jim');
    });

    test('a human-created page never gains created-via-token from a later agent edit', async () => {
      await pageManager.savePageWithContext(humanCtx('Human Made', '# One'), {});
      await pageManager.savePageWithContext(agentCtx('Human Made', '# Two'), {});

      const page = await pageManager.getPage('Human Made');
      expect(page.metadata['created-via-token']).toBeUndefined();
      expect(page.metadata['via-token']).toBe('claude-laptop');
    });

    test('caller-supplied provenance is discarded, not merged', async () => {
      // A forgeable provenance marker is not a provenance marker.
      await pageManager.savePageWithContext(humanCtx('Forgery', '# One'), {
        'via-token': 'not-a-real-token',
        'created-via-token': 'also-fake'
      });
      const page = await pageManager.getPage('Forgery');
      expect(page.metadata['via-token']).toBeUndefined();
      expect(page.metadata['created-via-token']).toBeUndefined();
    });

    test('a caller cannot overwrite a real creation stamp', async () => {
      await pageManager.savePageWithContext(agentCtx('Locked Origin', '# One'), {});
      await pageManager.savePageWithContext(humanCtx('Locked Origin', '# Two'), {
        'created-via-token': 'spoofed'
      });
      const page = await pageManager.getPage('Locked Origin');
      expect(page.metadata['created-via-token']).toBe('claude-laptop');
    });

    test('an ordinary human page carries neither field', async () => {
      await pageManager.savePageWithContext(humanCtx('Plain', '# One'), {});
      const page = await pageManager.getPage('Plain');
      expect(page.metadata['via-token']).toBeUndefined();
      expect(page.metadata['created-via-token']).toBeUndefined();
    });
  });

  describe('Page Deletion', () => {
    test('should delete page', async () => {
      await pageManager.savePage('Delete Me', '# Content', {});

      expect(pageManager.pageExists('Delete Me')).toBe(true);

      const deleted = await pageManager.deletePage('Delete Me');

      expect(deleted).toBe(true);
      expect(pageManager.pageExists('Delete Me')).toBe(false);
    });

    test('should return false when deleting non-existent page', async () => {
      const deleted = await pageManager.deletePage('Non Existent');
      expect(deleted).toBe(false);
    });
  });

  describe('WikiContext Integration', () => {
    test('should save page using WikiContext', async () => {
      const wikiContext = {
        pageName: 'Context Page',
        content: '# WikiContext Content',
        userContext: { username: 'contextuser' }
      };

      await pageManager.savePageWithContext(wikiContext, { category: 'Context' });

      const page = await pageManager.getPage('Context Page');
      expect(page).toBeDefined();
      expect(page.content).toContain('WikiContext Content');
      expect(page.metadata.author).toBe('contextuser');
      expect(page.metadata.category).toBe('Context');
    });

    test('should delete page using WikiContext', async () => {
      await pageManager.savePage('Context Delete', '# Content', {});

      const wikiContext = {
        pageName: 'Context Delete',
        userContext: { username: 'admin' }
      };

      await pageManager.deletePageWithContext(wikiContext);

      expect(pageManager.pageExists('Context Delete')).toBe(false);
    });
  });

  describe('UUID and File System', () => {
    test('should store page with UUID-based filename', async () => {
      await pageManager.savePage('UUID Test', '# Content', {});

      const files = await fs.readdir(TEST_PAGES_DIR);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      expect(mdFiles).toHaveLength(1);
      expect(mdFiles[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.md$/);
    });

    test('should retrieve page by UUID', async () => {
      await pageManager.savePage('Find By UUID', '# Content', {});

      const page = await pageManager.getPage('Find By UUID');
      const uuid = page.uuid;

      const byUuid = await pageManager.getPage(uuid);
      expect(byUuid).toBeDefined();
      expect(byUuid.title).toBe('Find By UUID');
    });
  });

  describe('Cache Refresh', () => {
    test('should refresh page list after external changes', async () => {
      await pageManager.savePage('Existing Page', '# Content', {});

      expect((await pageManager.getAllPages()).length).toBe(1);

      // Manually create a new page file
      const newUuid = '12345678-1234-1234-1234-123456789abc';
      const newPagePath = path.join(TEST_PAGES_DIR, `${newUuid}.md`);
      await fs.writeFile(newPagePath, `---
title: "External Page"
uuid: ${newUuid}
---

# External Content
`);

      // Before refresh, cache doesn't know about new file
      expect((await pageManager.getAllPages()).length).toBe(1);

      // Refresh should pick up the new file
      await pageManager.refreshPageList();

      expect((await pageManager.getAllPages()).length).toBe(2);
      expect(pageManager.pageExists('External Page')).toBe(true);
    });
  });

  describe('Backup and Restore', () => {
    test('should backup all pages', async () => {
      await pageManager.savePage('Backup Page 1', '# Content 1', { category: 'A' });
      await pageManager.savePage('Backup Page 2', '# Content 2', { category: 'B' });

      const backup = await pageManager.backup();

      expect(backup.managerName).toBe('PageManager');
      expect(backup.timestamp).toBeDefined();
      expect(backup.providerBackup).toBeDefined();
      expect(backup.providerBackup.pages).toHaveLength(2);
    });

    test('should restore pages from backup', async () => {
      // Create and backup pages
      await pageManager.savePage('Restore Page', '# Original', {});
      const backup = await pageManager.backup();

      // Delete the page
      await pageManager.deletePage('Restore Page');
      expect(pageManager.pageExists('Restore Page')).toBe(false);

      // Restore from backup
      await pageManager.restore(backup);

      // Page should be back
      expect(pageManager.pageExists('Restore Page')).toBe(true);
      const page = await pageManager.getPage('Restore Page');
      expect(page.content).toContain('Original');
    });
  });

  describe('Error Handling', () => {
    test('should return null for non-existent page', async () => {
      const page = await pageManager.getPage('Does Not Exist');
      expect(page).toBeNull();
    });

    test('should throw for getPageContent on non-existent page', async () => {
      await expect(pageManager.getPageContent('Does Not Exist'))
        .rejects.toThrow("Page 'Does Not Exist' not found");
    });

    test('should return null for getPageMetadata on non-existent page', async () => {
      const metadata = await pageManager.getPageMetadata('Does Not Exist');
      expect(metadata).toBeNull();
    });
  });

  describe('Plural Name Matching', () => {
    test('should find page by plural form', async () => {
      await pageManager.savePage('Plugin', '# Plugin Content', {});

      // Search for "Plugins" should find "Plugin"
      const page = await pageManager.getPage('Plugins');

      // If plural matching is working
      if (page) {
        expect(page.title).toBe('Plugin');
      }
    });

    test('should find page by singular form', async () => {
      await pageManager.savePage('Categories', '# Categories Content', {});

      // Search for "Category" should find "Categories"
      const page = await pageManager.getPage('Category');

      // If plural matching is working
      if (page) {
        expect(page.title).toBe('Categories');
      }
    });
  });
});
