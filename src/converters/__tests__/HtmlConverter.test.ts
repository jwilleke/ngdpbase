/**
 * Tests for HtmlConverter
 */

import HtmlConverter from '../HtmlConverter';
import type { ConversionResult } from '../IContentConverter';

describe('HtmlConverter', () => {
  let converter: HtmlConverter;

  beforeEach(() => {
    converter = new HtmlConverter();
  });

  describe('interface properties', () => {
    it('should have correct formatId', () => {
      expect(converter.formatId).toBe('html');
    });

    it('should have correct formatName', () => {
      expect(converter.formatName).toBe('HTML Web Page');
    });

    it('should have correct fileExtensions', () => {
      expect(converter.fileExtensions).toEqual(['.html', '.htm']);
    });
  });

  describe('canHandle', () => {
    it('should detect .html files', () => {
      expect(converter.canHandle('any content', 'page.html')).toBe(true);
      expect(converter.canHandle('any content', 'PAGE.HTML')).toBe(true);
    });

    it('should detect .htm files', () => {
      expect(converter.canHandle('any content', 'page.htm')).toBe(true);
    });

    it('should detect HTML doctype', () => {
      expect(converter.canHandle('<!DOCTYPE html><html><body>Hi</body></html>', 'file.txt')).toBe(true);
    });

    it('should detect <html> tag', () => {
      expect(converter.canHandle('<html><body>Hi</body></html>', 'file.txt')).toBe(true);
    });

    it('should detect head+body pattern', () => {
      expect(converter.canHandle('<head><title>T</title></head><body>B</body>', 'file.txt')).toBe(true);
    });

    it('should not detect plain text', () => {
      expect(converter.canHandle('Just some plain text', 'file.txt')).toBe(false);
    });

    it('should not detect Markdown', () => {
      expect(converter.canHandle('# Heading\n\nParagraph', 'file.md')).toBe(false);
    });
  });

  describe('convert - basic HTML', () => {
    it('should convert simple paragraph', () => {
      const html = '<html><body><p>Hello world</p></body></html>';
      const result = converter.convert(html);
      expect(result.content).toContain('Hello world');
    });

    it('should convert headings', () => {
      const html = '<html><body><h1>Title</h1><h2>Subtitle</h2><p>Text</p></body></html>';
      const result = converter.convert(html);
      expect(result.content).toContain('# Title');
      expect(result.content).toContain('## Subtitle');
    });

    it('should convert links', () => {
      const html = '<html><body><a href="https://example.com">Link</a></body></html>';
      const result = converter.convert(html);
      expect(result.content).toContain('[Link](https://example.com)');
    });

    it('should convert emphasis', () => {
      const html = '<html><body><strong>bold</strong> and <em>italic</em></body></html>';
      const result = converter.convert(html);
      expect(result.content).toContain('**bold**');
      expect(result.content).toContain('*italic*');
    });

    it('should convert unordered lists', () => {
      const html = '<html><body><ul><li>One</li><li>Two</li></ul></body></html>';
      const result = converter.convert(html);
      expect(result.content).toContain('-   One');
      expect(result.content).toContain('-   Two');
    });

    it('should convert code blocks', () => {
      const html = '<html><body><pre><code class="language-js">const x = 1;</code></pre></body></html>';
      const result = converter.convert(html);
      expect(result.content).toContain('```js');
      expect(result.content).toContain('const x = 1;');
    });
  });

  describe('convert - content extraction', () => {
    it('should prefer <article> element', () => {
      const html = `<html><body>
        <nav>Navigation</nav>
        <article><p>Article content</p></article>
        <footer>Footer</footer>
      </body></html>`;
      const result = converter.convert(html);
      expect(result.content).toContain('Article content');
      expect(result.content).not.toContain('Navigation');
      expect(result.content).not.toContain('Footer');
    });

    it('should prefer <main> element', () => {
      const html = `<html><body>
        <header>Header</header>
        <main><p>Main content here</p></main>
        <aside>Sidebar</aside>
      </body></html>`;
      const result = converter.convert(html);
      expect(result.content).toContain('Main content here');
      expect(result.content).not.toContain('Header');
      expect(result.content).not.toContain('Sidebar');
    });

    it('should fall back to body when no article/main', () => {
      const html = '<html><body><p>Body content only</p></body></html>';
      const result = converter.convert(html);
      expect(result.content).toContain('Body content only');
      expect(result.warnings.some(w => w.detail.includes('body content'))).toBe(true);
    });

    it('should remove script and style elements', () => {
      const html = `<html><body>
        <script>alert('bad')</script>
        <style>.x { color: red; }</style>
        <p>Visible content</p>
      </body></html>`;
      const result = converter.convert(html);
      expect(result.content).toContain('Visible content');
      expect(result.content).not.toContain('alert');
      expect(result.content).not.toContain('color: red');
    });

    it('should remove nav, header, footer, aside, iframe', () => {
      const html = `<html><body>
        <nav>Nav links</nav>
        <header>Site header</header>
        <article><p>Good content with enough text to pass the threshold check for primary extraction</p></article>
        <footer>Site footer</footer>
        <aside>Sidebar stuff</aside>
        <iframe src="ad.html"></iframe>
      </body></html>`;
      const result = converter.convert(html);
      expect(result.content).toContain('Good content');
      expect(result.content).not.toContain('Nav links');
      expect(result.content).not.toContain('Site header');
      expect(result.content).not.toContain('Site footer');
      expect(result.content).not.toContain('Sidebar stuff');
    });
  });

  describe('convert - metadata extraction', () => {
    it('should extract title from <title>', () => {
      const html = '<html><head><title>My Page Title</title></head><body><p>Content</p></body></html>';
      const result = converter.convert(html);
      expect(result.metadata['title']).toBe('My Page Title');
    });

    it('should prefer og:title over <title>', () => {
      const html = `<html><head>
        <title>Basic Title</title>
        <meta property="og:title" content="OG Title">
      </head><body><p>Content</p></body></html>`;
      const result = converter.convert(html);
      expect(result.metadata['title']).toBe('OG Title');
    });

    it('should extract description', () => {
      const html = `<html><head>
        <meta name="description" content="A test description">
      </head><body><p>Content</p></body></html>`;
      const result = converter.convert(html);
      const schema = result.metadata['schema'] as Record<string, unknown>;
      expect(schema.description).toBe('A test description');
    });

    it('should extract author', () => {
      const html = `<html><head>
        <meta name="author" content="John Doe">
      </head><body><p>Content</p></body></html>`;
      const result = converter.convert(html);
      const schema = result.metadata['schema'] as Record<string, unknown>;
      expect(schema.author).toBe('John Doe');
    });

    it('should extract keywords as array', () => {
      const html = `<html><head>
        <meta name="keywords" content="tech, wiki, open source">
      </head><body><p>Content</p></body></html>`;
      const result = converter.convert(html);
      const schema = result.metadata['schema'] as Record<string, unknown>;
      expect(schema.keywords).toEqual(['tech', 'wiki', 'open source']);
    });

    it('should extract og:image', () => {
      const html = `<html><head>
        <meta property="og:image" content="https://example.com/img.jpg">
      </head><body><p>Content</p></body></html>`;
      const result = converter.convert(html);
      const schema = result.metadata['schema'] as Record<string, unknown>;
      expect(schema.image).toBe('https://example.com/img.jpg');
    });

    it('should extract og:site_name as publisher', () => {
      const html = `<html><head>
        <meta property="og:site_name" content="Example News">
      </head><body><p>Content</p></body></html>`;
      const result = converter.convert(html);
      const schema = result.metadata['schema'] as Record<string, unknown>;
      expect(schema.publisher).toBe('Example News');
    });

    it('should extract language from html lang attribute', () => {
      const html = '<html lang="en-US"><head><title>T</title></head><body><p>Content</p></body></html>';
      const result = converter.convert(html);
      const schema = result.metadata['schema'] as Record<string, unknown>;
      expect(schema.inLanguage).toBe('en-US');
    });

    it('should extract canonical URL', () => {
      const html = `<html><head>
        <link rel="canonical" href="https://example.com/canonical">
      </head><body><p>Content</p></body></html>`;
      const result = converter.convert(html);
      const schema = result.metadata['schema'] as Record<string, unknown>;
      expect(schema.url).toBe('https://example.com/canonical');
    });

    it('should extract article dates', () => {
      const html = `<html><head>
        <meta property="article:published_time" content="2025-12-15T10:00:00Z">
        <meta property="article:modified_time" content="2025-12-20T14:30:00Z">
      </head><body><p>Content</p></body></html>`;
      const result = converter.convert(html);
      const schema = result.metadata['schema'] as Record<string, unknown>;
      expect(schema.datePublished).toBe('2025-12-15T10:00:00Z');
      expect(schema.dateModified).toBe('2025-12-20T14:30:00Z');
    });
  });

  describe('convert - JSON-LD extraction', () => {
    it('should extract Schema.org Article data', () => {
      const html = `<html><head>
        <script type="application/ld+json">
        {
          "@type": "Article",
          "author": { "name": "Jane Author" },
          "datePublished": "2025-06-01",
          "publisher": { "name": "Tech Blog" },
          "description": "An article about tech"
        }
        </script>
      </head><body><p>Content</p></body></html>`;
      const result = converter.convert(html);
      const schema = result.metadata['schema'] as Record<string, unknown>;
      expect(schema.author).toBe('Jane Author');
      expect(schema.datePublished).toBe('2025-06-01');
      expect(schema.publisher).toBe('Tech Blog');
      expect(schema.description).toBe('An article about tech');
    });

    it('should handle invalid JSON-LD gracefully', () => {
      const html = `<html><head>
        <script type="application/ld+json">not valid json</script>
      </head><body><p>Content</p></body></html>`;
      const result = converter.convert(html);
      expect(result.content).toContain('Content');
      // Should not throw
    });
  });

  describe('convert - citation references', () => {
    it('should convert escaped bracket references to footnotes', () => {
      const html = '<html><body><article><p>Some fact.[1] Another fact.[2][3] More text.[10]</p></article></body></html>';
      const result = converter.convert(html);
      expect(result.content).toContain('[^1]');
      expect(result.content).toContain('[^2]');
      expect(result.content).toContain('[^3]');
      expect(result.content).toContain('[^10]');
      expect(result.content).not.toContain('\\[1\\]');
      expect(result.content).not.toContain('\\[2\\]');
    });

    it('should not affect non-numeric bracket content', () => {
      const html = '<html><body><article><p>See [example] and [more info] for details.</p></article></body></html>';
      const result = converter.convert(html);
      // Non-numeric brackets should remain as-is (escaped or linked)
      expect(result.content).not.toContain('[^example]');
    });

    it('should convert a references section to footnote definitions', () => {
      const html = `<html><body><article>
        <p>Some text.[1] More text.[2]</p>
        <h2>References</h2>
        <ol>
          <li><a href="https://example.com/one">https://example.com/one</a></li>
          <li><a href="https://example.com/two">https://example.com/two</a></li>
        </ol>
      </article></body></html>`;
      const result = converter.convert(html);
      expect(result.content).toContain('[^1]');
      expect(result.content).toContain('[^2]');
      expect(result.content).toContain('[^1]: https://example.com/one');
      expect(result.content).toContain('[^2]: https://example.com/two');
      expect(result.content).not.toContain('## References');
    });

    it('should preserve content when no references section exists', () => {
      const html = '<html><body><article><p>Just text with no references.</p></article></body></html>';
      const result = converter.convert(html);
      expect(result.content).toContain('Just text with no references.');
      expect(result.content).not.toContain('[^');
    });
  });

  describe('convert - edge cases', () => {
    it('should handle empty HTML', () => {
      const result = converter.convert('');
      expect(result.content).toBe('');
      expect(result.warnings.some(w => w.detail.includes('No meaningful content'))).toBe(true);
    });

    it('should handle HTML with only whitespace body', () => {
      const html = '<html><body>   </body></html>';
      const result = converter.convert(html);
      expect(result.content).toBe('');
    });

    it('should clean up excessive newlines', () => {
      const html = '<html><body><p>A</p><br><br><br><br><p>B</p></body></html>';
      const result = converter.convert(html);
      expect(result.content).not.toContain('\n\n\n');
    });

    it('should return ConversionResult shape', () => {
      const html = '<html><body><p>Test</p></body></html>';
      const result: ConversionResult = converter.convert(html);
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('warnings');
      expect(typeof result.content).toBe('string');
      expect(typeof result.metadata).toBe('object');
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('convert - full page simulation', () => {
    it('should handle a realistic article page', () => {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Understanding TypeScript Generics</title>
    <meta name="description" content="A comprehensive guide to TypeScript generics">
    <meta name="author" content="John Developer">
    <meta name="keywords" content="typescript, generics, programming">
    <meta property="og:title" content="Understanding TypeScript Generics">
    <meta property="og:site_name" content="Dev Blog">
    <meta property="og:image" content="https://devblog.com/ts-generics.png">
    <meta property="article:published_time" content="2025-11-01T09:00:00Z">
    <link rel="canonical" href="https://devblog.com/typescript-generics">
    <style>body { font-family: sans-serif; }</style>
    <script>console.log('analytics');</script>
</head>
<body>
    <nav><a href="/">Home</a> <a href="/blog">Blog</a></nav>
    <header><h1>Dev Blog</h1></header>
    <article>
        <h1>Understanding TypeScript Generics</h1>
        <p>TypeScript generics allow you to write <strong>reusable</strong> and <em>type-safe</em> code.</p>
        <h2>Basic Syntax</h2>
        <pre><code class="language-typescript">function identity&lt;T&gt;(arg: T): T {
    return arg;
}</code></pre>
        <h2>Generic Constraints</h2>
        <p>You can constrain generics using <code>extends</code>:</p>
        <ul>
            <li>Extend interfaces</li>
            <li>Extend classes</li>
            <li>Use keyof</li>
        </ul>
        <p>For more info, visit <a href="https://www.typescriptlang.org/docs/handbook/2/generics.html">TypeScript Docs</a>.</p>
    </article>
    <aside>Related: Advanced Types</aside>
    <footer>Copyright 2025</footer>
</body>
</html>`;

      const result = converter.convert(html);

      // Content checks
      expect(result.content).toContain('Understanding TypeScript Generics');
      expect(result.content).toContain('**reusable**');
      expect(result.content).toContain('*type-safe*');
      expect(result.content).toContain('```typescript');
      expect(result.content).toContain('-   Extend interfaces');
      expect(result.content).toContain('[TypeScript Docs]');

      // Should NOT contain boilerplate
      expect(result.content).not.toContain('analytics');
      expect(result.content).not.toContain('Copyright 2025');
      expect(result.content).not.toContain('Related: Advanced Types');

      // Metadata checks
      expect(result.metadata['title']).toBe('Understanding TypeScript Generics');
      const schema = result.metadata['schema'] as Record<string, unknown>;
      expect(schema.description).toBe('A comprehensive guide to TypeScript generics');
      expect(schema.author).toBe('John Developer');
      expect(schema.publisher).toBe('Dev Blog');
      expect(schema.url).toBe('https://devblog.com/typescript-generics');
      expect(schema.image).toBe('https://devblog.com/ts-generics.png');
      expect(schema.datePublished).toBe('2025-11-01T09:00:00Z');
      expect(schema.inLanguage).toBe('en');
      expect(schema.keywords).toEqual(['typescript', 'generics', 'programming']);
    });
  });
});
