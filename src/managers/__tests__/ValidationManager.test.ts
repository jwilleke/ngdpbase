import ValidationManager from '../ValidationManager';
import { v4 as uuidv4 } from 'uuid';

describe('ValidationManager', () => {
  let validationManager;
  let mockEngine;

  beforeEach(() => {
    mockEngine = {
      getManager: vi.fn()
    };
    validationManager = new ValidationManager(mockEngine);
  });

  describe('validateFilename', () => {
    test('should validate UUID-based filenames', () => {
      const validUuid = uuidv4();
      const result = validationManager.validateFilename(`${validUuid}.md`);
      
      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    test('should reject non-UUID filenames', () => {
      const result = validationManager.validateFilename('regular-filename.md');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not follow UUID naming convention');
    });

    test('should reject files without .md extension', () => {
      const validUuid = uuidv4();
      const result = validationManager.validateFilename(`${validUuid}.txt`);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('must have .md extension');
    });

    test('should reject invalid UUID format', () => {
      const result = validationManager.validateFilename('invalid-uuid-format.md');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not follow UUID naming convention');
    });
  });

  describe('validateMetadata', () => {
    test('should validate complete metadata', () => {
      const validMetadata = {
        title: 'Test Page',
        uuid: uuidv4(),
        slug: 'test-page',
        'system-category': 'General',
        'user-keywords': ['test', 'example'],
        lastModified: new Date().toISOString()
      };

      const result = validationManager.validateMetadata(validMetadata);

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    test('should reject metadata missing required fields', () => {
      const incompleteMetadata = {
        title: 'Test Page'
        // Missing uuid, slug, category, user-keywords, lastModified
      };

      const result = validationManager.validateMetadata(incompleteMetadata);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Required metadata field');
    });

    test('should reject invalid UUID', () => {
      const metadata = {
        title: 'Test Page',
        uuid: 'invalid-uuid',
        slug: 'test-page',
        'system-category': 'General',
        'user-keywords': [],
        lastModified: new Date().toISOString()
      };

      const result = validationManager.validateMetadata(metadata);

      expect(result.success).toBe(false);
      expect(result.error).toContain('uuid must be a valid RFC 4122 UUID v4');
    });

    test('should reject invalid slug format', () => {
      const metadata = {
        title: 'Test Page',
        uuid: uuidv4(),
        slug: 'Invalid Slug With Spaces',
        'system-category': 'General',
        'user-keywords': [],
        lastModified: new Date().toISOString()
      };

      const result = validationManager.validateMetadata(metadata);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('slug must be a URL-safe string');
    });

    test('should validate user keywords array', () => {
      const metadata = {
        title: 'Test Page',
        uuid: uuidv4(),
        slug: 'test-page',
        'system-category': 'General',
        'user-keywords': ['valid', 'keywords'],
        lastModified: new Date().toISOString()
      };

      const result = validationManager.validateMetadata(metadata);
      
      expect(result.success).toBe(true);
    });

    test('should reject too many user keywords', () => {
      validationManager.maxUserKeywords = 3;
      
      const metadata = {
        title: 'Test Page',
        uuid: uuidv4(),
        slug: 'test-page',
        'system-category': 'General',
        'user-keywords': ['one', 'two', 'three', 'four'], // Too many
        lastModified: new Date().toISOString()
      };

      const result = validationManager.validateMetadata(metadata);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum 3 user keywords are allowed');
    });

    test('should warn about non-standard categories', () => {
      const metadata = {
        title: 'Test Page',
        uuid: uuidv4(),
        slug: 'test-page',
        'system-category': 'NonStandardCategory',
        'user-keywords': [],
        lastModified: new Date().toISOString()
      };

      const result = validationManager.validateMetadata(metadata);

      expect(result.success).toBe(true);
      expect(result.warnings).toContainEqual(expect.stringContaining('is not in the standard list'));
    });

    // #706 knowledge-role enum — opt-in (absent = no role) + HARD REJECT
    // when present with a value outside the catalog. Unlike system-category,
    // which warns; knowledge-role's enum is small and authoritative.
    describe('knowledge-role (#706)', () => {
      const baseMetadata = () => ({
        title: 'Test Page',
        uuid: uuidv4(),
        slug: 'test-page',
        'system-category': 'General',
        'user-keywords': [],
        lastModified: new Date().toISOString()
      });

      test.each(['source', 'citation', 'concept'])(
        'should accept knowledge-role: %s',
        (role) => {
          const result = validationManager.validateMetadata({ ...baseMetadata(), 'knowledge-role': role });
          expect(result.success).toBe(true);
          expect(result.error).toBeNull();
        }
      );

      test('should accept absent knowledge-role (the default — page outside the graph)', () => {
        const result = validationManager.validateMetadata(baseMetadata());
        expect(result.success).toBe(true);
      });

      test.each([null, ''])(
        'should treat knowledge-role: %s as absent (no role)',
        (value) => {
          const result = validationManager.validateMetadata({ ...baseMetadata(), 'knowledge-role': value });
          expect(result.success).toBe(true);
        }
      );

      test('should hard-reject knowledge-role with an unrecognized value', () => {
        const result = validationManager.validateMetadata({ ...baseMetadata(), 'knowledge-role': 'garbage' });
        expect(result.success).toBe(false);
        expect(result.error).toContain("knowledge-role 'garbage' is not a recognized role");
      });

      test('should hard-reject knowledge-role that is not a string', () => {
        const result = validationManager.validateMetadata({ ...baseMetadata(), 'knowledge-role': 42 });
        expect(result.success).toBe(false);
        expect(result.error).toContain('knowledge-role must be a string');
      });

      test('should accept knowledge-role case-insensitively', () => {
        const result = validationManager.validateMetadata({ ...baseMetadata(), 'knowledge-role': 'SOURCE' });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('validatePage', () => {
    test('should validate complete page with matching UUID', () => {
      const uuid = uuidv4();
      const filename = `${uuid}.md`;
      const metadata = {
        title: 'Test Page',
        uuid: uuid,
        slug: 'test-page',
        'system-category': 'General',
        'user-keywords': [],
        lastModified: new Date().toISOString()
      };
      const content = '# Test Page\n\nThis is test content.';

      const result = validationManager.validatePage(filename, metadata, content);
      
      expect(result.success).toBe(true);
      expect(result.filenameValid).toBe(true);
      expect(result.metadataValid).toBe(true);
    });

    test('should reject page with UUID mismatch', () => {
      const filenameUuid = uuidv4();
      const metadataUuid = uuidv4();
      const filename = `${filenameUuid}.md`;
      const metadata = {
        title: 'Test Page',
        uuid: metadataUuid,
        slug: 'test-page',
        'system-category': 'General',
        'user-keywords': [],
        lastModified: new Date().toISOString()
      };

      const result = validationManager.validatePage(filename, metadata);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('UUID mismatch');
    });
  });

  describe('generateValidMetadata', () => {
    test('should generate complete metadata with UUID', () => {
      const title = 'Test Page';
      const result = validationManager.generateValidMetadata(title);

      expect(result.title).toBe(title);
      expect(result.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(result.slug).toBe('test-page');
      expect(result['system-category']).toBe('general');
      expect(Array.isArray(result['user-keywords'])).toBe(true);
      expect(result.lastModified).toBeDefined();
    });

    test('should use provided options', () => {
      const title = 'Test Page';
      const options = {
        'system-category': 'documentation',
        'user-keywords': ['test'],
        uuid: uuidv4()
      };

      const result = validationManager.generateValidMetadata(title, options);

      expect(result['system-category']).toBe('documentation');
      expect(result['user-keywords']).toEqual(['test']);
      expect(result.uuid).toBe(options.uuid);
    });
  });

  describe('generateSlug', () => {
    test('should create URL-safe slugs', () => {
      expect(validationManager.generateSlug('Test Page')).toBe('test-page');
      expect(validationManager.generateSlug('Multiple   Spaces')).toBe('multiple-spaces');
      expect(validationManager.generateSlug('Special@#$Characters')).toBe('special-characters');
      expect(validationManager.generateSlug('  Leading and Trailing  ')).toBe('leading-and-trailing');
    });

    test('should transliterate Greek characters (#295)', () => {
      expect(validationManager.generateSlug('Aβ')).toBe('abeta');
      expect(validationManager.generateSlug('α-helix')).toBe('alpha-helix');
      expect(validationManager.generateSlug('Ω')).toBe('omega');
      expect(validationManager.generateSlug('π')).toBe('pi');
    });

    test('should transliterate Latin extended / accented characters (#295)', () => {
      expect(validationManager.generateSlug('Über')).toBe('uber');
      expect(validationManager.generateSlug('café')).toBe('cafe');
      expect(validationManager.generateSlug('naïve')).toBe('naive');
      expect(validationManager.generateSlug('Ångström')).toBe('angstrom');
    });

    test('Aβ and A should produce different slugs (#295)', () => {
      const slugA  = validationManager.generateSlug('A');
      const slugAb = validationManager.generateSlug('Aβ');
      expect(slugA).toBe('a');
      expect(slugAb).toBe('abeta');
      expect(slugA).not.toBe(slugAb);
    });
  });

  describe('generateFilename', () => {
    test('should generate UUID-based filename', () => {
      const uuid = uuidv4();
      const metadata = { uuid };
      
      const result = validationManager.generateFilename(metadata);
      
      expect(result).toBe(`${uuid}.md`);
    });

    test('should throw error for missing UUID', () => {
      const metadata = { title: 'Test' };
      
      expect(() => {
        validationManager.generateFilename(metadata);
      }).toThrow('UUID is required to generate filename');
    });
  });

  describe('checkConflicts', () => {
    let mockPageManager;

    beforeEach(() => {
      mockPageManager = { getPage: vi.fn() };
      mockEngine.getManager.mockReturnValue(mockPageManager);
    });

    test('returns no conflict when page does not exist', async () => {
      mockPageManager.getPage.mockResolvedValue(null);
      const uuid = uuidv4();

      const result = await validationManager.checkConflicts(uuid, 'Test Page', 'test-page');

      expect(result.hasConflict).toBe(false);
      expect(result.conflictType).toBeNull();
    });

    test('detects uuid-mismatch when slug exists under different UUID', async () => {
      const sourceUuid = uuidv4();
      const liveUuid = uuidv4();
      mockPageManager.getPage.mockResolvedValue({ uuid: liveUuid });

      const result = await validationManager.checkConflicts(sourceUuid, 'Test Page', 'test-page');

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('uuid-mismatch');
      expect(result.conflictingUuid).toBe(liveUuid);
    });

    test('returns no conflict when slug exists under same UUID', async () => {
      const uuid = uuidv4();
      mockPageManager.getPage.mockResolvedValue({ uuid });

      const result = await validationManager.checkConflicts(uuid, 'Test Page', 'test-page');

      expect(result.hasConflict).toBe(false);
      expect(result.conflictType).toBeNull();
    });

    test('detects title-duplicate when title exists under different UUID', async () => {
      const sourceUuid = uuidv4();
      const liveUuid = uuidv4();
      // slug lookup returns null, title lookup returns conflicting page
      mockPageManager.getPage
        .mockResolvedValueOnce(null)       // slug check
        .mockResolvedValue({ uuid: liveUuid }); // title check

      const result = await validationManager.checkConflicts(sourceUuid, 'Test Page', 'test-page');

      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('title-duplicate');
      expect(result.conflictingUuid).toBe(liveUuid);
    });

    test('treats getPage error as no conflict', async () => {
      mockPageManager.getPage.mockRejectedValue(new Error('Provider error'));
      const uuid = uuidv4();

      const result = await validationManager.checkConflicts(uuid, 'Test Page', 'test-page');

      expect(result.hasConflict).toBe(false);
      expect(result.conflictType).toBeNull();
    });

    test('skips slug check when slug is empty', async () => {
      const sourceUuid = uuidv4();
      const liveUuid = uuidv4();
      mockPageManager.getPage.mockResolvedValue({ uuid: liveUuid });

      const result = await validationManager.checkConflicts(sourceUuid, 'Test Page', '');

      // No slug to check, falls through to title check → title-duplicate
      expect(result.hasConflict).toBe(true);
      expect(result.conflictType).toBe('title-duplicate');
    });
  });

  describe('generateFixSuggestions', () => {
    test('should suggest fixes for incomplete metadata', () => {
      const filename = 'old-filename.md';
      const metadata = {
        title: 'Test Page'
        // Missing other required fields
      };

      const fixes = validationManager.generateFixSuggestions(filename, metadata);

      expect(fixes.metadata.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(fixes.metadata.slug).toBe('test-page');
      expect(fixes.metadata['system-category']).toBe('general');
      expect(Array.isArray(fixes.metadata['user-keywords'])).toBe(true);
      expect(fixes.metadata.lastModified).toBeDefined();
      expect(fixes.filename).toBe(`${fixes.metadata.uuid}.md`);
    });

    test('should preserve existing valid metadata', () => {
      const uuid = uuidv4();
      const filename = `${uuid}.md`;
      const metadata = {
        title: 'Test Page',
        uuid: uuid,
        slug: 'test-page',
        'system-category': 'General',
        'user-keywords': ['test'],
        lastModified: '2025-01-01T00:00:00.000Z'
      };

      const fixes = validationManager.generateFixSuggestions(filename, metadata);

      expect(fixes.metadata).toEqual(metadata);
      expect(fixes.filename).toBeNull(); // No filename change needed
    });
  });

  describe('sanitizeMetadata', () => {
    test('trims leading and trailing spaces from string fields', () => {
      const result = validationManager.sanitizeMetadata({
        title: '  My Page  ',
        slug: ' my-page ',
        'system-category': ' general ',
        lastModified: ' 2026-01-01T00:00:00.000Z ',
        author: ' alice '
      });
      expect(result.title).toBe('My Page');
      expect(result.slug).toBe('my-page');
      expect(result['system-category']).toBe('general');
      expect(result.lastModified).toBe('2026-01-01T00:00:00.000Z');
      expect(result.author).toBe('alice');
    });

    test('decodes percent-encoded whitespace (%09 tab) before trimming', () => {
      const result = validationManager.sanitizeMetadata({
        title: '%09Illinois',
        'system-category': '%20general%20'
      });
      expect(result.title).toBe('Illinois');
      expect(result['system-category']).toBe('general');
    });

    test('trims tabs and newlines', () => {
      const result = validationManager.sanitizeMetadata({
        title: '\t My Page \n',
        slug: '\nmy-page\t'
      });
      expect(result.title).toBe('My Page');
      expect(result.slug).toBe('my-page');
    });

    test('trims each user-keyword and removes empty ones', () => {
      const result = validationManager.sanitizeMetadata({
        'user-keywords': ['  economics  ', '\tArtificial Intelligence\n', '  ', '']
      });
      expect(result['user-keywords']).toEqual(['economics', 'Artificial Intelligence']);
    });

    test('decodes percent-encoded characters in user-keywords', () => {
      const result = validationManager.sanitizeMetadata({
        'user-keywords': ['%09Illinois', ' economics ']
      });
      expect(result['user-keywords']).toEqual(['Illinois', 'economics']);
    });

    test('does not mutate the input object', () => {
      const input = { title: '  My Page  ', 'user-keywords': ['  tag  '] };
      validationManager.sanitizeMetadata(input);
      expect(input.title).toBe('  My Page  ');
      expect(input['user-keywords'][0]).toBe('  tag  ');
    });

    test('leaves non-string fields unchanged', () => {
      const result = validationManager.sanitizeMetadata({
        title: '  My Page  ',
        someNumber: 42,
        someObject: { nested: true }
      });
      expect(result.someNumber).toBe(42);
      expect(result.someObject).toEqual({ nested: true });
    });

    test('handles missing optional fields without error', () => {
      const result = validationManager.sanitizeMetadata({
        title: '  My Page  '
      });
      expect(result.title).toBe('My Page');
      expect(result.slug).toBeUndefined();
      expect(result['user-keywords']).toBeUndefined();
    });
  });

  describe('validatePage()', () => {
    const validUuid = uuidv4();
    const validMeta = {
      title: 'My Page',
      'system-category': 'General',
      'user-keywords': ['tag1'],
      uuid: validUuid,
      lastModified: new Date().toISOString(),
      slug: 'my-page'
    };

    test('returns filenameValid=false and error for invalid filename', () => {
      const result = validationManager.validatePage('bad-name.md', validMeta);
      expect(result.filenameValid).toBe(false);
      expect(result.success).toBe(false);
    });

    test('returns metadataValid=false for incomplete metadata', () => {
      const result = validationManager.validatePage(`${validUuid}.md`, { title: 'Only Title', uuid: validUuid });
      expect(result.metadataValid).toBe(false);
      expect(result.success).toBe(false);
    });

    test('returns error for UUID mismatch between filename and metadata', () => {
      const otherUuid = uuidv4();
      const result = validationManager.validatePage(`${otherUuid}.md`, validMeta);
      expect(result.success).toBe(false);
      expect(result.error).toContain('UUID mismatch');
    });

    test('returns success for valid filename and metadata', () => {
      const result = validationManager.validatePage(`${validUuid}.md`, validMeta);
      expect(result.success).toBe(true);
      expect(result.filenameValid).toBe(true);
      expect(result.metadataValid).toBe(true);
    });

    test('validates content when provided', () => {
      const result = validationManager.validatePage(`${validUuid}.md`, validMeta, '# My Page\n\nContent here.');
      expect(result.success).toBe(true);
    });
  });

  describe('validateContent()', () => {
    test('returns warning for empty content', () => {
      const result = validationManager.validateContent('');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('returns warning for non-string content', () => {
      const result = validationManager.validateContent(null);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    test('returns warning when no markdown headers', () => {
      const result = validationManager.validateContent('Some text without headers here.');
      expect(result.warnings.some(w => w.includes('headers'))).toBe(true);
    });

    test('returns warning for very short content', () => {
      const result = validationManager.validateContent('Hi');
      expect(result.warnings.some(w => w.includes('short'))).toBe(true);
    });

    test('returns no warnings for well-formed content', () => {
      const result = validationManager.validateContent('# My Page\n\nThis is a well-formed wiki page with enough content to pass validation checks.');
      expect(result.warnings.length).toBe(0);
    });
  });
});
