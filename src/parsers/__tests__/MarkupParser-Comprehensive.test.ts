/**
 * Comprehensive Integration Tests for WikiDocument DOM Pipeline
 *
 * Part of Phase 5 (Issue #119) - Complete pipeline validation
 * Tests: extraction → DOM → markdown-it → merge
 *
 * Related Issues: #114, #115, #116, #117, #118
 */

import MarkupParser from '../MarkupParser';
import DOMVariableHandler from '../dom/handlers/DOMVariableHandler';
import DOMPluginHandler from '../dom/handlers/DOMPluginHandler';
import DOMLinkHandler from '../dom/handlers/DOMLinkHandler';

// Skipped: Output format expectations don't match current implementation
describe('WikiDocument DOM Pipeline - Comprehensive Integration', () => {
  let parser;
  let mockEngine;
  let context;

  beforeEach(async () => {
    // Create mock engine with all managers
    mockEngine = {
      getManager: (name) => {
        if (name === 'VariableManager') {
          const variableHandlers = new Map();
          variableHandlers.set('username', (ctx) => ctx?.userName || 'TestUser');
          variableHandlers.set('applicationname', () => 'ngdpbase');
          variableHandlers.set('pagename', (ctx) => ctx?.pageName || 'TestPage');
          return { variableHandlers };
        }
        if (name === 'PluginManager') {
          return {
            execute: async (pluginName, pageName, parameters, pluginContext) => {
              if (pluginName === 'TableOfContents' || pluginName === 'TOC') {
                return '<div class="toc">Table of Contents</div>';
              }
              if (pluginName === 'CurrentTime') {
                return '<span class="current-time">2025-10-13</span>';
              }
              if (pluginName === 'INSERT') {
                return `<div class="plugin-insert">${parameters.text || ''}</div>`;
              }
              return `<div class="plugin-${pluginName.toLowerCase()}">${pluginName} Output</div>`;
            }
          };
        }
        if (name === 'ConfigurationManager') {
          return { getProperty: (key, def) => def };
        }
        if (name === 'PageManager') {
          return {
            getAllPages: async () => ['HomePage', 'Features', 'About', 'TestPage']
          };
        }
        return null;
      }
    };

    // Create parser and handlers
    parser = new MarkupParser(mockEngine);
    parser.domVariableHandler = new DOMVariableHandler(mockEngine);
    await parser.domVariableHandler.initialize();
    parser.domPluginHandler = new DOMPluginHandler(mockEngine);
    await parser.domPluginHandler.initialize();
    parser.domLinkHandler = new DOMLinkHandler(mockEngine);
    await parser.domLinkHandler.initialize();

    // Create context
    context = {
      userName: 'JohnDoe',
      pageName: 'TestPage'
    };
  });

  // =========================================================================
  // 1. MARKDOWN PRESERVATION TESTS
  // =========================================================================

  describe('Markdown Preservation', () => {
    test('headings: ## → <h2>', async () => {
      const content = '## Features\n### Subheading\n#### Detail';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<h2');
      expect(result).toContain('Features');
      expect(result).toContain('</h2>');
      expect(result).toContain('<h3');
      expect(result).toContain('Subheading');
      expect(result).toContain('<h4');
      expect(result).toContain('Detail');
    });

    test('lists: - → <li>', async () => {
      const content = '- Item 1\n- Item 2\n- Item 3';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
      expect(result).toContain('<li>Item 3</li>');
      expect(result).toContain('</ul>');
    });

    test('ordered lists: 1. → <ol>', async () => {
      const content = '1. First\n2. Second\n3. Third';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<ol>');
      expect(result).toContain('<li>First</li>');
      expect(result).toContain('<li>Second</li>');
      expect(result).toContain('<li>Third</li>');
      expect(result).toContain('</ol>');
    });

    test('code blocks preserved', async () => {
      const content = '```javascript\nconst x = 1;\nconst y = 2;\n```';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<code');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('const y = 2;');
    });

    test('inline code preserved', async () => {
      const content = 'Use `const x = 1` in your code.';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toMatch(/<code[^>]*>const x = 1<\/code>/);
    });

    test('markdown links: [text](url)', async () => {
      const content = '[Google](https://google.com) and [GitHub](https://github.com)';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<a href="https://google.com">Google</a>');
      expect(result).toContain('<a href="https://github.com">GitHub</a>');
    });

    test('markdown tables', async () => {
      const content = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<table');
      expect(result).toContain('<thead>');
      expect(result).toContain('<th>A</th>');
      expect(result).toContain('<th>B</th>');
      expect(result).toContain('<tbody>');
      expect(result).toContain('<td>1</td>');
      expect(result).toContain('<td>2</td>');
    });

    test('bold and italic', async () => {
      const content = '**bold** and *italic* and ***both***';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
    });

    test('blockquotes', async () => {
      const content = '> This is a quote\n> Second line';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<blockquote>');
      expect(result).toContain('This is a quote');
    });

    test('horizontal rules', async () => {
      const content = 'Before\n\n---\n\nAfter';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<hr');
    });
  });

  // =========================================================================
  // 2. JSPWIKI SYNTAX PROCESSING TESTS
  // =========================================================================

  describe('JSPWiki Syntax Processing', () => {
    test('variables: [{$username}] → JohnDoe', async () => {
      const content = 'User: [{$username}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('User:');
      expect(result).toContain('JohnDoe');
      expect(result).toContain('wiki-variable');
    });

    test('multiple variables', async () => {
      const content = '[{$username}] uses [{$applicationname}] on [{$pagename}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('JohnDoe');
      expect(result).toContain('ngdpbase');
      expect(result).toContain('TestPage');
    });

    test('plugins: [{TableOfContents}]', async () => {
      const content = '[{TableOfContents}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('class="toc"');
      expect(result).toContain('Table of Contents');
    });

    test('plugins: [{TOC}] (short form)', async () => {
      const content = '[{TOC}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('class="toc"');
    });

    test('plugins with parameters', async () => {
      const content = '[{INSERT text="Hello World"}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('Hello World');
    });

    test('wiki links: [HomePage]', async () => {
      const content = 'Visit [HomePage] for details.';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<a');
      expect(result).toContain('HomePage');
      expect(result).toContain('href');
      expect(result).not.toContain('redlink');
    });

    test('wiki links: [Link|Text]', async () => {
      const content = '[HomePage|Main Page]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<a');
      expect(result).toContain('Main Page');
      expect(result).toContain('HomePage');
    });

    test('red links: [NonExistent]', async () => {
      const content = 'See [NonExistentPage] for info.';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<a');
      expect(result).toContain('redlink');
      expect(result).toContain('color: red');
      expect(result).toContain('NonExistentPage');
    });

    test('escaped syntax: [[{$var}]', async () => {
      const content = 'Example: [[{$username}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('Example:');
      expect(result).toContain('[{$username}]'); // Literal, not expanded
      expect(result).not.toContain('JohnDoe');
    });

    test('escaped syntax: [[...]', async () => {
      const content = 'Code: [[{$var}] and [[{PLUGIN}] are literal';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('[{$var}]');
      expect(result).toContain('[{PLUGIN}]');
      expect(result).toContain('are literal');
    });
  });

  // =========================================================================
  // 3. MIXED CONTENT TESTS
  // =========================================================================

  describe('Mixed Content', () => {
    test('markdown headings + variables', async () => {
      const content = '## Welcome\n\nHello, [{$username}]!';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<h2');
      expect(result).toContain('Welcome');
      expect(result).toContain('Hello,');
      expect(result).toContain('JohnDoe');
    });

    test('markdown headings + plugins', async () => {
      const content = '## Contents\n\n[{TableOfContents}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<h2');
      expect(result).toContain('Contents');
      expect(result).toContain('class="toc"');
    });

    test('markdown lists + wiki links', async () => {
      const content = '- [HomePage]\n- [About]\n- [Features]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
      expect(result).toContain('HomePage');
      expect(result).toContain('About');
      expect(result).toContain('Features');
    });

    test('markdown lists + variables', async () => {
      const content = '- User: [{$username}]\n- App: [{$applicationname}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<ul>');
      expect(result).toContain('JohnDoe');
      expect(result).toContain('ngdpbase');
    });

    test('markdown code blocks + JSPWiki syntax outside', async () => {
      const content = 'User: [{$username}]\n\n```javascript\nconst x = 1;\n```\n\nPage: [{$pagename}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('JohnDoe');
      expect(result).toContain('TestPage');
      expect(result).toContain('<code');
      expect(result).toContain('const x = 1');
    });

    test('markdown tables + wiki links', async () => {
      const content = '| Page | Description |\n|---|---|\n| [HomePage] | Main |\n| [About] | Info |';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<table');
      expect(result).toContain('HomePage');
      expect(result).toContain('About');
      expect(result).toContain('Main');
    });

    test('full complex page', async () => {
      const content = `# Welcome to ngdpbase

Current user: [{$username}]

## Table of Contents

[{TableOfContents}]

## Features

- Fast rendering
- JSPWiki compatibility
- Visit [HomePage] for details

## Code Example

\`\`\`javascript
const wiki = 'ngdpbase';
console.log(wiki);
\`\`\`

## Links

- [Google](https://google.com)
- [HomePage]
- Example: [[{$var}]

## Current Page

You are on: [{$pagename}]`;

      const result = await parser.parseWithDOMExtraction(content, context);

      // Markdown headings
      expect(result).toContain('<h1');
      expect(result).toContain('Welcome to ngdpbase');
      expect(result).toContain('<h2');
      expect(result).toContain('Table of Contents');
      expect(result).toContain('Features');

      // Markdown lists
      expect(result).toContain('<li>Fast rendering</li>');
      expect(result).toContain('<li>JSPWiki compatibility</li>');

      // Markdown code
      expect(result).toContain('<code');
      expect(result).toContain('const wiki');

      // JSPWiki variables
      expect(result).toContain('JohnDoe');
      expect(result).toContain('TestPage');

      // JSPWiki plugins
      expect(result).toContain('class="toc"');

      // JSPWiki wiki links
      expect(result).toContain('HomePage');

      // Markdown links
      expect(result).toContain('<a href="https://google.com">Google</a>');

      // Escaped JSPWiki
      expect(result).toContain('[{$var}]'); // Literal

      // No placeholders leaked
      expect(result).not.toContain('<!--JSPWIKI-');
    });
  });

  // =========================================================================
  // 4. EDGE CASES TESTS
  // =========================================================================

  describe('Edge Cases', () => {
    test('empty content', async () => {
      const result = await parser.parseWithDOMExtraction('', context);
      expect(result).toBe('');
    });

    test('whitespace only', async () => {
      const result = await parser.parseWithDOMExtraction('   \n\n  \n  ', context);
      expect(result.trim()).toBe('');
    });

    test('only markdown, no JSPWiki', async () => {
      const content = '## Heading\n- Item 1\n- Item 2';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<h2');
      expect(result).toContain('Heading');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).not.toContain('<!--JSPWIKI-');
    });

    test('only JSPWiki syntax, no markdown', async () => {
      const content = '[{$username}] [{TOC}] [HomePage]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('JohnDoe');
      expect(result).toContain('class="toc"');
      expect(result).toContain('HomePage');
      expect(result).not.toContain('<!--JSPWIKI-');
    });

    test('JSPWiki syntax in markdown code blocks NOT processed', async () => {
      const content = '```\n[{$username}]\n[{TOC}]\n[HomePage]\n```';
      const result = await parser.parseWithDOMExtraction(content, context);

      // Should remain literal in code block
      expect(result).toContain('[{$username}]');
      expect(result).toContain('[{TOC}]');
      expect(result).toContain('[HomePage]');
      // Should NOT be expanded
      expect(result).not.toContain('JohnDoe');
      expect(result).not.toContain('class="toc"');
    });

    test('JSPWiki syntax in inline code NOT processed', async () => {
      const content = 'Use `[{$username}]` to show the user.';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toMatch(/<code[^>]*>\[{[^}]+}\]<\/code>/);
      expect(result).not.toContain('JohnDoe');
    });

    describe('Footnote Syntax', () => {
      test('footnote reference [^1] renders as anchor link, not red link', async () => {
        const content = 'Text with footnote[^1].\n\n[^1]: Footnote definition.';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).toContain('href="#footnote-1"');
        expect(result).toContain('id="footnote-1"');
        expect(result).not.toContain('class="redlink"');
        expect(result).not.toContain('style="color: red;"');
      });

      test('[^my-note] text identifier renders as anchor', async () => {
        const content = 'See note[^my-note].\n\n[^my-note]: The note text.';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).toContain('href="#footnote-my-note"');
        expect(result).toContain('id="footnote-my-note"');
      });

      test('[[PageName] renders as escaped literal [PageName], not a wiki link', async () => {
        const content = 'Type [[HomePage] to link.';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).toContain('[HomePage]');
        expect(result).not.toContain('href="/view/HomePage"');
        expect(result).not.toContain('href="/edit/HomePage"');
      });

      test('[^1] inside backtick code span is not converted to footnote', async () => {
        const content = 'Use `[^1]` for footnotes.';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).toMatch(/<code[^>]*>\[\^1\]<\/code>/);
        expect(result).not.toContain('href="#footnote-1"');
      });
    });

    describe('Plugins in Tables', () => {
      // Note: populateCell applies to tables inside %%class.../%% style blocks.
      // Bare |...|..| tables are handled by JSPWikiPreprocessor (not registered
      // in this test context). We test the style-block table path here.

      test('[{$pagename}] variable in style-block table cell resolves', async () => {
        const content = '%%table-striped\n|[{$pagename}]|next cell|\n/%';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).not.toContain('[{$pagename}]');
        expect(result).toContain('<td>');
        expect(result).toContain('TestPage');
      });

      test('[{TOC}] plugin in style-block table cell resolves', async () => {
        const content = '%%table-striped\n|[{TableOfContents}]|side|\n/%';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).not.toContain('[{TableOfContents}]');
        expect(result).toContain('<td>');
      });

      test('[PageName] link in style-block table cell resolves to anchor', async () => {
        const content = '%%table-striped\n|[SomePage]|text|\n/%';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).toContain('href=');
        expect(result).not.toContain('[SomePage]');
      });

      test('plain text in style-block table cell unchanged', async () => {
        const content = '%%table-striped\n|hello|world|\n/%';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).toContain('>hello<');
        expect(result).toContain('>world<');
      });

      test('[[EscapedPage] in style-block table cell renders as literal [EscapedPage]', async () => {
        const content = '%%table-striped\n|[[EscapedPage]|text|\n/%';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).toContain('[EscapedPage]');
        expect(result).not.toContain('href=');
      });
    });

    describe('Plugins in Style Blocks (non-table)', () => {
      test('[{$pagename}] variable in style block resolves', async () => {
        const content = '%%note\n[{$pagename}]\n/%';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).not.toContain('[{$pagename}]');
        expect(result).toContain('TestPage');
      });

      test('[{TOC}] plugin in style block resolves', async () => {
        const content = '%%note\n[{TableOfContents}]\n/%';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).not.toContain('[{TableOfContents}]');
      });

      test('[PageName] link in style block resolves', async () => {
        const content = '%%note\n[SomePage]\n/%';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).toContain('href=');
        expect(result).not.toContain('[SomePage]');
      });

      test('plain text in style block unchanged', async () => {
        const content = '%%note\nhello world\n/%';
        const result = await parser.parseWithDOMExtraction(content, context);
        expect(result).toContain('hello world');
      });
    });

    test('user writes placeholder-like text (UUID prevents conflict)', async () => {
      const content = 'Debug: <!--JSPWIKI-12345678-0-->';
      const result = await parser.parseWithDOMExtraction(content, context);

      // Should be preserved (different UUID)
      expect(result).toContain('<!--JSPWIKI-12345678-0-->');
    });

    test('malformed JSPWiki syntax ignored', async () => {
      const content = '[{$} [{] [}] [{PLUGIN';
      const result = await parser.parseWithDOMExtraction(content, context);

      // Should not crash
      expect(result).toBeDefined();
      // Malformed syntax treated as text
      expect(result).toContain('[{$}');
      expect(result).toContain('[{]');
    });

    test('special characters in content', async () => {
      const content = '## <script>alert("XSS")</script>\n\nUser: [{$username}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      // Should be escaped by markdown-it
      expect(result).toBeDefined();
      expect(result).toContain('JohnDoe');
    });

    test('very long content (10KB+)', async () => {
      const content = '## Section\n\nText [{$username}]\n\n'.repeat(500);
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result.length).toBeGreaterThan(10000);
      expect(result).toContain('<h2');
      expect(result).toContain('Section');
      expect(result).toContain('JohnDoe');
      expect(result).not.toContain('<!--JSPWIKI-');
    });

    test('multiple variables on same line', async () => {
      const content = '[{$username}] [{$applicationname}] [{$pagename}] [{$username}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      const johndoeCount = (result.match(/JohnDoe/g) || []).length;
      expect(johndoeCount).toBe(2);
      expect(result).toContain('ngdpbase');
      expect(result).toContain('TestPage');
    });

    test('consecutive JSPWiki syntax', async () => {
      const content = '[{$username}][{$applicationname}][{TOC}][HomePage]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('JohnDoe');
      expect(result).toContain('ngdpbase');
      expect(result).toContain('class="toc"');
      expect(result).toContain('HomePage');
    });

    test('JSPWiki syntax across line breaks', async () => {
      const content = '[{$username}]\n\n[{TOC}]\n\n[HomePage]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('JohnDoe');
      expect(result).toContain('class="toc"');
      expect(result).toContain('HomePage');
    });
  });

  // =========================================================================
  // 5. REGRESSION TESTS
  // =========================================================================

  describe('Regression Tests', () => {
    test('escaping issue from #110 fixed', async () => {
      const content = '[[{$applicationname}] : [{$applicationname}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      // First is escaped (literal), second is expanded
      expect(result).toContain('[{$applicationname}]');
      expect(result).toContain('ngdpbase');
    });

    test('heading issue from #114 and #93 fixed', async () => {
      const content = '## Features\n- Item';
      const result = await parser.parseWithDOMExtraction(content, context);

      // Should be heading, NOT list item
      expect(result).toContain('<h2');
      expect(result).toContain('Features');
      expect(result).toContain('</h2>');

      // Should NOT have Features as list item (that was the bug)
      expect(result).not.toMatch(/<li>.*Features.*<\/li>/);
    });

    test('multiple headings not becoming lists (#110)', async () => {
      const content = '## First\n\n## Second\n\n### Third';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<h2');
      expect(result).toContain('First');
      expect(result).toContain('Second');
      expect(result).toContain('<h3');
      expect(result).toContain('Third');
    });

    test('markdown and JSPWiki no longer conflict', async () => {
      const content = '## Heading with [{$username}]\n\n- Item with [HomePage]';
      const result = await parser.parseWithDOMExtraction(content, context);

      // Both markdown AND JSPWiki work correctly
      expect(result).toContain('<h2');
      expect(result).toContain('JohnDoe');
      expect(result).toContain('<li>');
      expect(result).toContain('HomePage');
    });
  });

  // =========================================================================
  // 6. PERFORMANCE TESTS
  // =========================================================================

  describe('Performance', () => {
    test('parse time <50ms per typical page', async () => {
      const content = `## Heading
User: [{$username}]
[{TOC}]
[HomePage]
- Item 1
- Item 2

## Another Section
[{$applicationname}]`;

      const start = Date.now();
      await parser.parseWithDOMExtraction(content, context);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });

    test('extraction performance for 100 elements', async () => {
      const content = '[{$username}] '.repeat(100);

      const start = Date.now();
      const { jspwikiElements } = parser.extractJSPWikiSyntax(content, context);
      const duration = Date.now() - start;

      expect(jspwikiElements.length).toBe(100);
      expect(duration).toBeLessThan(10); // <10ms for extraction
    });

    test('merge performance for 100 nodes', async () => {
      const content = '[{$username}] '.repeat(100);
      const result = await parser.parseWithDOMExtraction(content, context);

      // Count JohnDoe occurrences
      const count = (result.match(/JohnDoe/g) || []).length;
      expect(count).toBe(100);
    });

    test('large page performance (5KB content)', async () => {
      const section = `## Section
User: [{$username}]
[{TOC}]
- Item 1
- Item 2
- Item 3

Text content with [HomePage] link.

`;
      const content = section.repeat(50); // ~5KB

      const start = Date.now();
      const result = await parser.parseWithDOMExtraction(content, context);
      const duration = Date.now() - start;

      expect(result.length).toBeGreaterThan(5000);
      expect(duration).toBeLessThan(100); // <100ms for large page
    });
  });

  // =========================================================================
  // 7. PLACEHOLDER SAFETY TESTS
  // =========================================================================

  describe('Placeholder Safety', () => {
    test('no placeholders leak into output', async () => {
      const content = `## Test
[{$username}]
[{TOC}]
[HomePage]
[[escaped]]`;

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).not.toContain('<!--JSPWIKI-');
      expect(result).not.toContain('__JSPWIKI_');
    });

    test('UUID makes placeholders unique per parse', async () => {
      const content = '[{$username}]';

      const { uuid: uuid1 } = parser.extractJSPWikiSyntax(content, context);
      const { uuid: uuid2 } = parser.extractJSPWikiSyntax(content, context);

      expect(uuid1).not.toBe(uuid2); // Different UUIDs
      expect(uuid1.length).toBe(8);
      expect(uuid2.length).toBe(8);
    });

    test('placeholders with different UUIDs do not conflict', async () => {
      // Simulate content from one parse with placeholder from another
      const { uuid: uuid1 } = parser.extractJSPWikiSyntax('[{$username}]', context);
      const { uuid: uuid2 } = parser.extractJSPWikiSyntax('[{$username}]', context);

      const content = `User: <!--JSPWIKI-${uuid1}-0--> and <!--JSPWIKI-${uuid2}-0-->`;

      // Extract with a new UUID
      const result = await parser.parseWithDOMExtraction(content, context);

      // Old placeholders preserved (different UUIDs)
      expect(result).toContain(`<!--JSPWIKI-${uuid1}-0-->`);
      expect(result).toContain(`<!--JSPWIKI-${uuid2}-0-->`);
    });
  });

  // =========================================================================
  // 8. ERROR HANDLING TESTS
  // =========================================================================

  describe('Error Handling', () => {
    test('undefined variable returns empty', async () => {
      const content = '[{$nonexistent}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      // Should have variable span but empty or error indicator
      expect(result).toContain('wiki-variable');
    });

    test('parsing continues after error', async () => {
      const content = 'Before [{$username}] Middle [{$nonexistent}] After [{$applicationname}]';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('Before');
      expect(result).toContain('JohnDoe');
      expect(result).toContain('Middle');
      expect(result).toContain('After');
      expect(result).toContain('ngdpbase');
    });

    test('malformed markdown does not break JSPWiki processing', async () => {
      const content = '## Incomplete heading\n\nUser: [{$username}]\n\n| incomplete | table';
      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('JohnDoe'); // JSPWiki still works
    });
  });
});
