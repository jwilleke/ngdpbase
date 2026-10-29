/**
 * WikiRoutes.isRequiredPage() tests
 *
 * Tests the isRequiredPage() method that determines if a page
 * requires admin permission to edit (Issue #174).
 *
 * Protected pages are determined solely by system-category metadata: the
 * system-categories required-pages/ ships (#1503), as PageManager reads them
 * from its files' frontmatter. Hardcoded page-name lists were removed.
 *
 * @jest-environment node
 */

import WikiRoutes from '../WikiRoutes';

describe('WikiRoutes.isRequiredPage()', () => {
  let wikiRoutes;
  let mockPageManager;
  let mockEngine;

  beforeEach(() => {
    // Create mock PageManager. #1503: the protected system-categories are the
    // ones required-pages/ ships, read from its files' frontmatter.
    mockPageManager = {
      getPageMetadata: vi.fn(),
      shippedSystemCategories: vi.fn().mockResolvedValue(new Set(['system', 'documentation']))
    };

    // Create mock Engine
    mockEngine = {
      getManager: vi.fn((name) => (name === 'PageManager' ? mockPageManager : null))
    };

    // Create WikiRoutes instance
    wikiRoutes = new WikiRoutes(mockEngine);
  });

  describe('Page Name Alone (no system-category)', () => {
    test('should return false for "System Categories" without system-category metadata', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({ title: 'System Categories' });
      const result = await wikiRoutes.isRequiredPage('System Categories');
      expect(result).toBe(false);
    });

    test('should return false for "User Documentation" without system-category metadata', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({ title: 'User Documentation' });
      const result = await wikiRoutes.isRequiredPage('User Documentation');
      expect(result).toBe(false);
    });
  });

  describe('System Category Protection (Issue #174)', () => {
    test('should return true for system-category: system (lowercase)', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({
        title: 'Test Page',
        'system-category': 'system'
      });

      const result = await wikiRoutes.isRequiredPage('Test Page');
      expect(result).toBe(true);
    });

    test('should return true for system-category: System (uppercase)', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({
        title: 'Test Page',
        'system-category': 'System'
      });

      const result = await wikiRoutes.isRequiredPage('Test Page');
      expect(result).toBe(true);
    });

    test('should return true for system-category: documentation', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({
        title: 'Test Page',
        'system-category': 'documentation'
      });

      const result = await wikiRoutes.isRequiredPage('Test Page');
      expect(result).toBe(true);
    });

    test('should return true for system-category: Documentation (uppercase)', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({
        title: 'Test Page',
        'system-category': 'Documentation'
      });

      const result = await wikiRoutes.isRequiredPage('Test Page');
      expect(result).toBe(true);
    });

    test('should return false for system-category: System/Admin (invalid legacy category, not in required list)', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({
        title: 'Test Page',
        'system-category': 'System/Admin'
      });

      const result = await wikiRoutes.isRequiredPage('Test Page');
      expect(result).toBe(false);
    });

    test('should return false for category: System/Admin (invalid legacy category, not in required list)', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({
        title: 'Test Page',
        category: 'System/Admin'
      });

      const result = await wikiRoutes.isRequiredPage('Test Page');
      expect(result).toBe(false);
    });
  });

  describe('Non-Protected Pages', () => {
    test('should return false for system-category: General', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({
        title: 'Test Page',
        'system-category': 'General'
      });

      const result = await wikiRoutes.isRequiredPage('Test Page');
      expect(result).toBe(false);
    });

    test('should return false for system-category: Developer', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({
        title: 'Test Page',
        'system-category': 'Developer'
      });

      const result = await wikiRoutes.isRequiredPage('Test Page');
      expect(result).toBe(false);
    });

    test('should return false when no system-category is set', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue({
        title: 'Test Page'
      });

      const result = await wikiRoutes.isRequiredPage('Test Page');
      expect(result).toBe(false);
    });

    test('should return false when page does not exist', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue(null);

      const result = await wikiRoutes.isRequiredPage('NonExistent Page');
      expect(result).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should return false when PageManager throws error', async () => {
      mockPageManager.getPageMetadata.mockRejectedValue(new Error('Database error'));

      const result = await wikiRoutes.isRequiredPage('Error Page');
      expect(result).toBe(false);
    });

    test('should return false when metadata is null', async () => {
      mockPageManager.getPageMetadata.mockResolvedValue(null);

      const result = await wikiRoutes.isRequiredPage('Test Page');
      expect(result).toBe(false);
    });
  });
});
