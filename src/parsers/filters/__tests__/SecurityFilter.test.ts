/**
 * SecurityFilter tests
 *
 * Covers:
 * - process() with empty content
 * - process() passthrough when securityConfig is null
 * - stripDangerousContent() removes script tags
 * - preventXSS() encodes < > " '
 * - sanitizeHTML() strips disallowed tags
 * - sanitizeHTML() keeps allowed tags
 * - Content length limit exceeded → throws
 * - HTMLTOKEN placeholder preservation
 * - loadSecureDefaults() loads default tags/attrs
 * - getSecurityConfiguration() returns config summary
 * - getInfo() returns metadata
 * - onInitialize() with/without ConfigurationManager
 *
 * @jest-environment node
 */

import SecurityFilter from '../SecurityFilter';

const ctx = { pageName: 'TestPage', engine: { getManager: vi.fn(() => null) } };

function makeFilter(): SecurityFilter {
  const f = new SecurityFilter();
  f.loadModularSecurityConfiguration({ engine: { getManager: vi.fn(() => null) } });
  return f;
}

describe('SecurityFilter', () => {
  describe('metadata', () => {
    test('has correct filterId', () => {
      expect(new SecurityFilter().filterId).toBe('SecurityFilter');
    });

    test('has priority 110', () => {
      expect(new SecurityFilter().priority).toBe(110);
    });
  });

  describe('process() — passthrough cases', () => {
    test('returns empty string for empty content', async () => {
      const f = makeFilter();
      expect(await f.process('', ctx)).toBe('');
    });

    test('returns plain text unchanged', async () => {
      const f = makeFilter();
      const text = 'Simple plain text without any HTML.';
      expect(await f.process(text, ctx)).toBe(text);
    });
  });

  describe('process() — XSS prevention', () => {
    // This filter declares phase: 'html', so process() receives Showdown's
    // rendered output. It used to entity-encode every < > " ' — which turned
    // the whole page into visible HTML source and is why enabling the filter
    // broke rendering. The previous version of this test asserted that
    // encoding, pinning the bug rather than the intent (#1032).
    test('removes unknown tags without encoding the document', async () => {
      const f = makeFilter();
      const result = await f.process('Hello <world>', ctx);

      expect(result).not.toContain('<world>');
      expect(result).not.toContain('&lt;');
      expect(result).toContain('Hello');
    });

    test('preserves legitimate rendered markup', async () => {
      // The regression that matters. If this ever escapes again, every page on
      // an instance with the filter enabled renders as source.
      const f = makeFilter();
      const result = await f.process('<p>Some <strong>bold</strong> text.</p>', ctx);

      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<p>');
    });

    test('strips dangerous script tags', async () => {
      const f = makeFilter();
      const result = await f.process('<script>alert("xss")</script>Hello', ctx);
      expect(result).not.toContain('<script>');
    });

    test('drops event-handler attributes from allowed tags', async () => {
      const f = makeFilter();
      const result = await f.process('<a href="/x" onclick="evil()">link</a>', ctx);

      expect(result).not.toMatch(/onclick/i);
      expect(result).toContain('href');
    });
  });

  describe('stripDangerousContent()', () => {
    test('removes script tags', () => {
      const f = makeFilter();
      const result = f.stripDangerousContent('<script>evil()</script>Safe content');
      expect(result).not.toContain('<script>');
      expect(result).toContain('Safe content');
    });

    test('removes event handler attributes', () => {
      const f = makeFilter();
      const result = f.stripDangerousContent('<a onclick="evil()">link</a>');
      expect(result).not.toContain('onclick');
    });
  });

  describe('preventXSS()', () => {
    test('encodes < as &lt;', () => {
      const f = makeFilter();
      expect(f.preventXSS('<tag>')).toContain('&lt;');
      expect(f.preventXSS('<tag>')).toContain('&gt;');
    });

    test('encodes " as &quot;', () => {
      const f = makeFilter();
      expect(f.preventXSS('"quoted"')).toContain('&quot;');
    });

    test('encodes \' as &#39;', () => {
      const f = makeFilter();
      expect(f.preventXSS("it's")).toContain('&#39;');
    });
  });

  describe('sanitizeHTML()', () => {
    test('strips all HTML when no allowed tags', () => {
      const f = new SecurityFilter();
      f.loadSecureDefaults();
      // Clear allowed tags to test strip-all behavior
      f.allowedTags.clear();
      const result = f.sanitizeHTML('<div>Text <em>here</em></div>');
      expect(result).not.toContain('<div>');
      expect(result).not.toContain('<em>');
      expect(result).toContain('Text');
    });

    test('keeps allowed tags', () => {
      const f = new SecurityFilter();
      f.loadSecureDefaults();
      f.allowedTags.add('p');
      const result = f.sanitizeHTML('<p>Content</p>');
      expect(result).toContain('<p>');
    });

    test('removes disallowed tags', () => {
      const f = new SecurityFilter();
      f.loadSecureDefaults();
      f.allowedTags.clear();
      f.allowedTags.add('p');
      const result = f.sanitizeHTML('<p>Good</p><script>bad</script>');
      expect(result).toContain('<p>');
      expect(result).not.toContain('<script>');
    });
  });

  describe('process() — content length limit', () => {
    test('throws when content exceeds maxContentLength', async () => {
      const f = makeFilter();
      if (f.securityConfig) {
        f.securityConfig.maxContentLength = 10;
      }
      await expect(f.process('This content is longer than 10 chars', ctx)).rejects.toThrow('Content exceeds maximum length limit');
    });
  });

  describe('process() — HTMLTOKEN preservation', () => {
    test('preserves HTMLTOKEN placeholders through filtering', async () => {
      const f = makeFilter();
      const content = 'Before HTMLTOKEN1HTMLTOKEN after';
      const result = await f.process(content, ctx);
      expect(result).toContain('HTMLTOKEN1HTMLTOKEN');
    });
  });

  describe('loadSecureDefaults()', () => {
    test('loads default allowed tags', () => {
      const f = new SecurityFilter();
      f.loadSecureDefaults();
      expect(f.allowedTags.size).toBeGreaterThan(0);
      expect(f.allowedTags.has('p')).toBe(true);
      expect(f.allowedTags.has('div')).toBe(true);
    });

    test('loads default allowed attributes', () => {
      const f = new SecurityFilter();
      f.loadSecureDefaults();
      expect(f.allowedAttributes.has('href')).toBe(true);
      expect(f.allowedAttributes.has('class')).toBe(true);
    });
  });

  describe('getSecurityConfiguration()', () => {
    test('returns configuration object', () => {
      const f = makeFilter();
      const config = f.getSecurityConfiguration();
      expect(typeof config).toBe('object');
    });
  });

  describe('getInfo()', () => {
    test('returns object with features array', () => {
      const f = makeFilter();
      const info = f.getInfo();
      expect(Array.isArray(info.features)).toBe(true);
    });
  });

  describe('onInitialize()', () => {
    test('initializes without throwing when no engine', async () => {
      const f = new SecurityFilter();
      await expect(
        f.onInitialize({ engine: undefined })
      ).resolves.not.toThrow();
    });

    test('initializes with ConfigurationManager', async () => {
      const f = new SecurityFilter();
      const configManager = {
        getProperty: vi.fn((key: string, dv: unknown) => {
          if (key === 'ngdpbase.markup.filters.security.prevent-xss') return true;
          if (key === 'ngdpbase.markup.filters.security.allowed-tags') return 'p,div,span';
          return dv;
        })
      };
      const engine = { getManager: vi.fn((n: string) => n === 'ConfigurationManager' ? configManager : null) };
      await expect(f.onInitialize({ engine })).resolves.not.toThrow();
      expect(f.allowedTags.has('p')).toBe(true);
    });
  });

  describe('sanitizeAttributes()', () => {
    test('returns empty string when no attributes are allowed', () => {
      const f = makeFilter();
      f.allowedAttributes.clear();
      expect(f.sanitizeAttributes('class="foo" id="bar"')).toBe('');
    });

    test('keeps allowed attributes', () => {
      const f = makeFilter();
      f.allowedAttributes.clear();
      f.allowedAttributes.add('class');
      const result = f.sanitizeAttributes('class="foo" id="bar"');
      expect(result).toContain('class="foo"');
      expect(result).not.toContain('id=');
    });

    test('skips href with invalid URL', () => {
      const f = makeFilter();
      f.allowedAttributes.add('href');
      const result = f.sanitizeAttributes('href="javascript:alert(1)"');
      expect(result).not.toContain('href=');
    });

    test('keeps href with valid URL', () => {
      const f = makeFilter();
      f.allowedAttributes.add('href');
      const result = f.sanitizeAttributes('href="https://example.com"');
      expect(result).toContain('href=');
    });

    test('returns empty string when no attributes match', () => {
      const f = makeFilter();
      f.allowedAttributes.clear();
      f.allowedAttributes.add('class');
      const result = f.sanitizeAttributes('id="bar" data-x="y"');
      expect(result).toBe('');
    });
  });

  describe('isValidURL()', () => {
    test('allows relative path starting with /', () => {
      const f = makeFilter();
      expect(f.isValidURL('/wiki/TestPage')).toBe(true);
    });

    test('allows relative path starting with ./', () => {
      const f = makeFilter();
      expect(f.isValidURL('./image.png')).toBe(true);
    });

    test('allows relative path starting with ../', () => {
      const f = makeFilter();
      expect(f.isValidURL('../styles.css')).toBe(true);
    });

    test('allows https URL', () => {
      const f = makeFilter();
      expect(f.isValidURL('https://example.com/page')).toBe(true);
    });

    test('allows http URL', () => {
      const f = makeFilter();
      expect(f.isValidURL('http://example.com')).toBe(true);
    });

    test('allows mailto URL', () => {
      const f = makeFilter();
      expect(f.isValidURL('mailto:user@example.com')).toBe(true);
    });

    test('rejects javascript: URL', () => {
      const f = makeFilter();
      expect(f.isValidURL('javascript:alert(1)')).toBe(false);
    });

    test('rejects invalid URL format', () => {
      const f = makeFilter();
      expect(f.isValidURL('not a url at all %%')).toBe(false);
    });
  });

  describe('escapeAttributeValue()', () => {
    test('escapes & characters', () => {
      const f = makeFilter();
      expect(f.escapeAttributeValue('a&b')).toBe('a&amp;b');
    });

    test('escapes < and > characters', () => {
      const f = makeFilter();
      expect(f.escapeAttributeValue('<script>')).toBe('&lt;script&gt;');
    });

    test('escapes double quotes', () => {
      const f = makeFilter();
      expect(f.escapeAttributeValue('"quoted"')).toBe('&quot;quoted&quot;');
    });

    test('escapes single quotes', () => {
      const f = makeFilter();
      expect(f.escapeAttributeValue("it's")).toBe('it&#39;s');
    });

    test('returns clean string unchanged', () => {
      const f = makeFilter();
      expect(f.escapeAttributeValue('hello world')).toBe('hello world');
    });
  });
});
