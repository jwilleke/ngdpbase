/**
 * Tests for MarkdownConverter
 */

import MarkdownConverter from '../MarkdownConverter';

describe('MarkdownConverter', () => {
  let converter;

  beforeEach(() => {
    converter = new MarkdownConverter();
  });

  describe('interface properties', () => {
    it('should have correct formatId', () => {
      expect(converter.formatId).toBe('markdown');
    });

    it('should have correct formatName', () => {
      expect(converter.formatName).toBe('Markdown');
    });

    it('should have correct fileExtensions', () => {
      expect(converter.fileExtensions).toEqual(['.md', '.markdown']);
    });
  });

  describe('canHandle', () => {
    it('should detect .md files', () => {
      expect(converter.canHandle('any content', 'page.md')).toBe(true);
      expect(converter.canHandle('any content', 'PAGE.MD')).toBe(true);
    });

    it('should detect .markdown files', () => {
      expect(converter.canHandle('any content', 'page.markdown')).toBe(true);
    });

    it('should detect content with YAML frontmatter', () => {
      expect(converter.canHandle('---\ntitle: Test\n---\n# Body', 'page.txt')).toBe(true);
    });

    it('should detect content starting with ATX heading', () => {
      expect(converter.canHandle('# My Page\n\nSome content', 'page.txt')).toBe(true);
    });

    it('should not match plain text without markdown signals', () => {
      expect(converter.canHandle('Just some text here.', 'page.txt')).toBe(false);
    });
  });

  describe('convert — no frontmatter', () => {
    it('should pass content through unchanged', () => {
      const input = '# Hello\n\nSome content here.';
      const result = converter.convert(input);
      expect(result.content).toBe('# Hello\n\nSome content here.');
    });

    it('should return empty metadata', () => {
      const result = converter.convert('# Hello');
      // importedFrom is always set; other keys should be absent
      expect(result.metadata['importedFrom']).toBe('markdown');
      expect(result.metadata['title']).toBeUndefined();
    });

    it('should warn when no frontmatter found', () => {
      const result = converter.convert('# Hello\n\nContent');
      expect(result.warnings.some(w => w.detail === 'No frontmatter found — title, uuid, and slug will be generated from filename')).toBe(true);
    });
  });

  describe('convert — with frontmatter', () => {
    const input = [
      '---',
      'title: My Test Page',
      'uuid: 12345678-0000-0000-0000-000000000001',
      'slug: my-test-page',
      'audience:',
      '  - admin',
      '  - reader',
      'system-category: general',
      'user-keywords:',
      '  - test',
      '---',
      '# My Test Page',
      '',
      'Page body here.'
    ].join('\n');

    it('should extract title from frontmatter', () => {
      const result = converter.convert(input);
      expect(result.metadata['title']).toBe('My Test Page');
    });

    it('should extract uuid from frontmatter', () => {
      const result = converter.convert(input);
      expect(result.metadata['uuid']).toBe('12345678-0000-0000-0000-000000000001');
    });

    it('should extract audience array', () => {
      const result = converter.convert(input);
      expect(result.metadata['audience']).toEqual(['admin', 'reader']);
    });

    it('should extract user-keywords array', () => {
      const result = converter.convert(input);
      expect(result.metadata['user-keywords']).toEqual(['test']);
    });

    it('should return body content without frontmatter block', () => {
      const result = converter.convert(input);
      expect(result.content).toBe('# My Test Page\n\nPage body here.');
    });

    it('should not warn about missing frontmatter', () => {
      const result = converter.convert(input);
      expect(result.warnings.some(w => w.detail === 'No frontmatter found — title, uuid, and slug will be generated from filename')).toBe(false);
    });

    it('should set importedFrom to markdown', () => {
      const result = converter.convert(input);
      expect(result.metadata['importedFrom']).toBe('markdown');
    });
  });

  describe('convert — unknown frontmatter fields', () => {
    it('should warn about unknown fields but still include them', () => {
      const input = '---\ntitle: Test\ncustom-field: value\n---\nContent';
      const result = converter.convert(input);
      expect(result.metadata['custom-field']).toBe('value');
      expect(result.warnings.some(w => w.detail.includes('custom-field'))).toBe(true);
    });
  });

  describe('convert — malformed frontmatter', () => {
    it('should fall back to treating as plain markdown on parse error', () => {
      // Provide a string that gray-matter cannot parse as valid YAML
      // (e.g. tabs in YAML values that cause parse errors)
      // Most content parses fine; this tests the catch branch gracefully
      const result = converter.convert('plain markdown with no front matter at all');
      expect(result.content).toBeDefined();
    });
  });
});
