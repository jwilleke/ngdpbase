/**
 * WikiRoutes.buildNewPageMetadata() tests
 *
 * Tests the buildNewPageMetadata() helper that provides a single source
 * of truth for page creation metadata (Issue #234).
 *
 * The helper:
 * - Delegates to ValidationManager.generateValidMetadata() when available
 * - Falls back to ConfigurationManager for defaults
 * - Filters undefined/null options so defaults apply
 * - Ensures all required fields are populated
 *
 * @jest-environment node
 */

import WikiRoutes from '../WikiRoutes';

describe('WikiRoutes.buildNewPageMetadata()', () => {
  let wikiRoutes;
  let mockValidationManager;
  let mockConfigurationManager;
  let mockEngine;

  beforeEach(() => {
    // Create mock ValidationManager
    mockValidationManager = {
      generateValidMetadata: vi.fn((title, options) => ({
        title: title,
        'system-category': options['system-category'] || 'general',
        'user-keywords': options['user-keywords'] || [],
        uuid: options.uuid || 'mock-uuid-1234',
        slug: title.toLowerCase().replace(/\s+/g, '-'),
        lastModified: '2026-02-06T00:00:00.000Z',
        ...options
      }))
    };

    // Create mock ConfigurationManager with system-category config
    mockConfigurationManager = {
      getProperty: vi.fn((key, defaultVal) => {
        if (key === 'ngdpbase.system-category') {
          return {
            general: { label: 'general', default: true, enabled: true },
            system: { label: 'system', default: false, enabled: true },
            documentation: { label: 'documentation', default: false, enabled: true }
          };
        }
        return defaultVal;
      })
    };

    // Create mock Engine
    mockEngine = {
      getManager: vi.fn((name) => {
        if (name === 'ValidationManager') return mockValidationManager;
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        return null;
      })
    };

    // Create WikiRoutes instance
    wikiRoutes = new WikiRoutes(mockEngine);
  });

  describe('Delegation to ValidationManager', () => {
    test('should delegate to ValidationManager.generateValidMetadata() when available', () => {
      const result = wikiRoutes.buildNewPageMetadata('Test Page');

      expect(mockValidationManager.generateValidMetadata).toHaveBeenCalledWith(
        'Test Page',
        expect.any(Object)
      );
      expect(result.title).toBe('Test Page');
    });

    test('should pass filtered options to ValidationManager', () => {
      wikiRoutes.buildNewPageMetadata('Test Page', {
        'system-category': 'documentation',
        author: 'testuser'
      });

      expect(mockValidationManager.generateValidMetadata).toHaveBeenCalledWith(
        'Test Page',
        expect.objectContaining({
          'system-category': 'documentation',
          author: 'testuser'
        })
      );
    });

    test('should filter out undefined values from options', () => {
      wikiRoutes.buildNewPageMetadata('Test Page', {
        'system-category': 'general',
        uuid: undefined,
        author: 'testuser'
      });

      const callArgs = mockValidationManager.generateValidMetadata.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('uuid');
      expect(callArgs).toHaveProperty('system-category', 'general');
      expect(callArgs).toHaveProperty('author', 'testuser');
    });

    test('should filter out null values from options', () => {
      wikiRoutes.buildNewPageMetadata('Test Page', {
        'system-category': 'general',
        uuid: null,
        author: 'testuser'
      });

      const callArgs = mockValidationManager.generateValidMetadata.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('uuid');
    });
  });

  describe('Fallback when ValidationManager unavailable', () => {
    beforeEach(() => {
      // Remove ValidationManager
      mockEngine.getManager = vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        return null;
      });
      wikiRoutes = new WikiRoutes(mockEngine);
    });

    test('should return metadata with all required fields', () => {
      const result = wikiRoutes.buildNewPageMetadata('Test Page');

      expect(result).toHaveProperty('title', 'Test Page');
      expect(result).toHaveProperty('system-category');
      expect(result).toHaveProperty('user-keywords');
      expect(result).toHaveProperty('uuid');
      expect(result).toHaveProperty('slug');
      expect(result).toHaveProperty('lastModified');
    });

    test('should get default category from ConfigurationManager', () => {
      const result = wikiRoutes.buildNewPageMetadata('Test Page');

      expect(mockConfigurationManager.getProperty).toHaveBeenCalledWith(
        'ngdpbase.system-category',
        null
      );
      expect(result['system-category']).toBe('general');
    });

    test('should use provided system-category over default', () => {
      const result = wikiRoutes.buildNewPageMetadata('Test Page', {
        'system-category': 'documentation'
      });

      expect(result['system-category']).toBe('documentation');
    });

    test('should generate slug from title', () => {
      const result = wikiRoutes.buildNewPageMetadata('My Test Page');

      expect(result.slug).toBe('my-test-page');
    });

    test('should handle special characters in slug generation', () => {
      const result = wikiRoutes.buildNewPageMetadata('Test & Page! (Example)');

      expect(result.slug).toBe('test-page-example');
    });

    test('should set lastModified to current ISO timestamp', () => {
      const before = new Date().toISOString();
      const result = wikiRoutes.buildNewPageMetadata('Test Page');
      const after = new Date().toISOString();

      expect(result.lastModified >= before).toBe(true);
      expect(result.lastModified <= after).toBe(true);
    });

    test('should default user-keywords to empty array', () => {
      const result = wikiRoutes.buildNewPageMetadata('Test Page');

      expect(result['user-keywords']).toEqual([]);
    });

    test('should preserve provided user-keywords', () => {
      const result = wikiRoutes.buildNewPageMetadata('Test Page', {
        'user-keywords': ['medicine', 'geology']
      });

      expect(result['user-keywords']).toEqual(['medicine', 'geology']);
    });

    test('should preserve provided uuid', () => {
      const result = wikiRoutes.buildNewPageMetadata('Test Page', {
        uuid: 'existing-uuid-5678'
      });

      expect(result.uuid).toBe('existing-uuid-5678');
    });
  });

  describe('ConfigurationManager default category resolution', () => {
    beforeEach(() => {
      // Remove ValidationManager to test fallback path
      mockEngine.getManager = vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        return null;
      });
      wikiRoutes = new WikiRoutes(mockEngine);
    });

    test('should use category marked as default: true', () => {
      mockConfigurationManager.getProperty.mockReturnValue({
        general: { label: 'general', default: false, enabled: true },
        custom: { label: 'custom', default: true, enabled: true }
      });

      const result = wikiRoutes.buildNewPageMetadata('Test Page');

      expect(result['system-category']).toBe('custom');
    });

    test('should skip disabled categories when finding default', () => {
      mockConfigurationManager.getProperty.mockReturnValue({
        disabled: { label: 'disabled', default: true, enabled: false },
        fallback: { label: 'fallback', default: false, enabled: true }
      });

      const result = wikiRoutes.buildNewPageMetadata('Test Page');

      expect(result['system-category']).toBe('fallback');
    });

    test('should fallback to first enabled category when no default set', () => {
      mockConfigurationManager.getProperty.mockReturnValue({
        first: { label: 'first', enabled: true },
        second: { label: 'second', enabled: true }
      });

      const result = wikiRoutes.buildNewPageMetadata('Test Page');

      expect(result['system-category']).toBe('first');
    });

    test('should fallback to "general" when ConfigurationManager unavailable', () => {
      mockEngine.getManager = vi.fn(() => null);
      wikiRoutes = new WikiRoutes(mockEngine);

      const result = wikiRoutes.buildNewPageMetadata('Test Page');

      expect(result['system-category']).toBe('general');
    });

    test('should fallback to "general" when config returns null', () => {
      mockConfigurationManager.getProperty.mockReturnValue(null);

      const result = wikiRoutes.buildNewPageMetadata('Test Page');

      expect(result['system-category']).toBe('general');
    });
  });

  describe('Edge Cases', () => {
    test('should trim whitespace from title', () => {
      mockEngine.getManager = vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigurationManager;
        return null;
      });
      wikiRoutes = new WikiRoutes(mockEngine);

      const result = wikiRoutes.buildNewPageMetadata('  Test Page  ');

      expect(result.title).toBe('Test Page');
    });

    test('should work with empty options object', () => {
      const result = wikiRoutes.buildNewPageMetadata('Test Page', {});

      expect(result).toHaveProperty('title', 'Test Page');
    });

    test('should work without options argument', () => {
      const result = wikiRoutes.buildNewPageMetadata('Test Page');

      expect(result).toHaveProperty('title', 'Test Page');
    });

    test('should include additional options in result', () => {
      const result = wikiRoutes.buildNewPageMetadata('Test Page', {
        author: 'testuser',
        customField: 'customValue'
      });

      expect(result.author).toBe('testuser');
      expect(result.customField).toBe('customValue');
    });
  });
});

/**
 * #1106 — fields that generateValidMetadata seeds unconditionally are lost on an
 * UPDATE unless the caller reposts them. Its own docstring says "for a new page",
 * but the save path calls it for updates too, and the #803 carry-forward at
 * WikiRoutes.ts:3833 cannot restore them because it only fills keys that are
 * ABSENT — and these are always present. Same defect as #1017/#1008, which was
 * hand-rescued for one field.
 *
 * Governing rule: frontmatter is the author's or editor's to change. A save that
 * does not mention a field must leave it alone. Deleting a field requires intent,
 * never an omission.
 */
describe('#1106 seeded fields yield to existing frontmatter', () => {
  let routes;
  let engine;

  beforeEach(() => {
    const validation = {
      generateValidMetadata: vi.fn((title, options) => ({
        title,
        'system-category': options['system-category'] || 'general',
        'system-keywords': options['system-keywords'] || ['general'],
        'user-keywords': options['user-keywords'] || [],
        uuid: options.uuid || 'mock-uuid-1234',
        slug: options.slug || title.toLowerCase().replace(/\s+/g, '-'),
        lastModified: '2026-02-06T00:00:00.000Z',
        ...options
      }))
    };
    engine = {
      getManager: vi.fn((name) => (name === 'ValidationManager' ? validation : null))
    };
    routes = new WikiRoutes(engine);
  });

  const existing = {
    'system-category': 'documentation',
    'system-keywords': ['capture'],
    'user-keywords': ['interwiki', 'links'],
    slug: 'a-deliberately-custom-slug',
    uuid: 'mock-uuid-1234'
  };

  test.each([
    ['system-category', 'documentation'],
    ['system-keywords', ['capture']],
    ['user-keywords', ['interwiki', 'links']],
    ['slug', 'a-deliberately-custom-slug']
  ])('an omitted %s keeps the on-disk value', (field, expected) => {
    const result = routes.buildNewPageMetadata('New Title', {}, existing);
    expect(result[field]).toEqual(expected);
  });

  test('an explicitly supplied value still wins over the on-disk one', () => {
    const result = routes.buildNewPageMetadata('New Title', {
      'system-category': 'general',
      'user-keywords': ['replaced']
    }, existing);
    expect(result['system-category']).toBe('general');
    expect(result['user-keywords']).toEqual(['replaced']);
  });

  test('an existing empty array is preserved as empty, not re-seeded', () => {
    // #1017's rule: an empty array is a real state a user chose, not a reason
    // to restore defaults.
    const result = routes.buildNewPageMetadata('New Title', {}, {
      ...existing,
      'user-keywords': []
    });
    expect(result['user-keywords']).toEqual([]);
  });

  test('a new page still gets the seeded defaults', () => {
    const result = routes.buildNewPageMetadata('Brand New', {});
    expect(result['system-category']).toBe('general');
    expect(result['user-keywords']).toEqual([]);
    expect(result.slug).toBe('brand-new');
  });

  test('a field missing from the existing page falls through to the default', () => {
    const result = routes.buildNewPageMetadata('New Title', {}, { uuid: 'mock-uuid-1234' });
    expect(result['system-category']).toBe('general');
    expect(result['user-keywords']).toEqual([]);
  });

  test('title and lastModified are never taken from the existing page', () => {
    const result = routes.buildNewPageMetadata('New Title', {}, {
      ...existing,
      title: 'Stale Title',
      lastModified: '1999-01-01T00:00:00.000Z'
    });
    expect(result.title).toBe('New Title');
    expect(result.lastModified).not.toBe('1999-01-01T00:00:00.000Z');
  });

  test('unrelated existing fields are not copied in by this rule', () => {
    // The #803 carry-forward owns general preservation; this rule covers only
    // the fields the generator seeds. Two mechanisms doing the same job would
    // drift.
    const result = routes.buildNewPageMetadata('New Title', {}, {
      ...existing,
      status: 'draft'
    });
    expect(result.status).toBeUndefined();
  });
});
