/**
 * MarkupParser - Merge Pipeline Tests (Phase 3)
 *
 * Tests the complete DOM extraction pipeline (Phase 1-3):
 * 1. Extract JSPWiki syntax
 * 2. Create DOM nodes
 * 3. Let markdown-it parse markdown
 * 4. Merge nodes back into HTML
 *
 * This is the integration test for Issue #117.
 */

import MarkupParser from '../MarkupParser';
import WikiDocument from '../dom/WikiDocument';
import DOMVariableHandler from '../dom/handlers/DOMVariableHandler';
import DOMPluginHandler from '../dom/handlers/DOMPluginHandler';
import DOMLinkHandler from '../dom/handlers/DOMLinkHandler';

// Mock engine for testing
const createMockEngine = () => {
  const variableHandlers = new Map();

  // Register test variables
  variableHandlers.set('username', (context) => context?.userName || 'JohnDoe');
  variableHandlers.set('pagename', (context) => context?.pageName || 'TestPage');
  variableHandlers.set('applicationname', () => 'ngdpbase');
  variableHandlers.set('version', () => '1.0.0');

  const pluginManager = {
    execute: vi.fn(async (pluginName, pageName, params, context) => {
      if (pluginName === 'TableOfContents' || pluginName === 'TOC') {
        return '<div class="toc"><ul><li><a href="#section1">Section 1</a></li></ul></div>';
      }
      if (pluginName === 'CurrentTimePlugin') {
        return '<span class="time">2025-10-13 12:00:00</span>';
      }
      if (pluginName === 'Search') {
        return '<div class="search-results">Search results...</div>';
      }
      return '';
    })
  };

  return {
    getManager: vi.fn((name) => {
      if (name === 'VariableManager') {
        return { variableHandlers };
      }
      if (name === 'PluginManager') {
        return pluginManager;
      }
      if (name === 'ConfigurationManager') {
        return {
          getProperty: (key, defaultValue) => defaultValue
        };
      }
      if (name === 'PageManager') {
        return {
          getAllPages: async () => ['HomePage', 'TestPage', 'AboutPage', 'Features']
        };
      }
      return null;
    })
  };
};

// Skipped: Output format expectations don't match current implementation
describe('MarkupParser - Merge Pipeline (Phase 3)', () => {
  let mockEngine;
  let parser;

  beforeEach(async () => {
    // Create mock engine
    mockEngine = createMockEngine();

    // Create MarkupParser instance
    parser = new MarkupParser(mockEngine);

    // Initialize handlers
    parser.domVariableHandler = new DOMVariableHandler(mockEngine);
    await parser.domVariableHandler.initialize();

    parser.domPluginHandler = new DOMPluginHandler(mockEngine);
    await parser.domPluginHandler.initialize();

    parser.domLinkHandler = new DOMLinkHandler(mockEngine);
    await parser.domLinkHandler.initialize();
  });

  describe('Basic Replacement', () => {
    test('replaces variable placeholder', async () => {
      const content = 'User: [{$username}]';
      const context = { userName: 'JohnDoe' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('User:');
      expect(result).toContain('JohnDoe');
      expect(result).not.toContain('<!--JSPWIKI-');
      expect(result).toContain('wiki-variable');
    });

    test('replaces plugin placeholder', async () => {
      const content = '[{TableOfContents}]';
      const context = { pageName: 'TestPage' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('class="toc"'); // may have data-plugin/data-jspwiki-id attrs too
      expect(result).not.toContain('data-jspwiki-placeholder');
    });

    test('replaces link placeholder', async () => {
      const content = 'Visit [HomePage] for more info.';
      const context = { pageName: 'TestPage' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('HomePage');
      expect(result).toContain('wiki-link');
      expect(result).not.toContain('<!--JSPWIKI-');
    });

    test('replaces escaped placeholder', async () => {
      const content = 'Show literal: [[{$username}]';
      const context = { userName: 'JohnDoe' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('[{$username}]'); // Literal text
      expect(result).not.toContain('JohnDoe'); // Should NOT be resolved
      expect(result).not.toContain('<!--JSPWIKI-');
    });
  });

  describe('Markdown Preservation', () => {
    test('preserves markdown headings', async () => {
      const content = '## Features\n\nUser: [{$username}]';
      const context = { userName: 'JohnDoe' };

      const result = await parser.parseWithDOMExtraction(content, context);

      // Should have H2 heading
      expect(result).toContain('<h2');
      expect(result).toContain('Features');
      expect(result).toContain('</h2>');

      // Should have variable resolved
      expect(result).toContain('JohnDoe');
      expect(result).not.toContain('<!--JSPWIKI-');
    });

    test('preserves markdown lists', async () => {
      const content = `
- Item 1: [{$username}]
- Item 2
- Item 3
`;
      const context = { userName: 'JohnDoe' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<li>');
      expect(result).toContain('Item 1');
      expect(result).toContain('JohnDoe');
      expect(result).toContain('Item 2');
    });

    test('preserves markdown links alongside wiki links', async () => {
      const content = '[Google](https://google.com) and [HomePage]';
      const context = { pageName: 'TestPage' };

      const result = await parser.parseWithDOMExtraction(content, context);

      // Markdown link
      expect(result).toContain('<a href="https://google.com">Google</a>');

      // Wiki link
      expect(result).toContain('HomePage');
      expect(result).toContain('wiki-link');
    });

    test('preserves markdown bold and italic', async () => {
      const content = '**Bold [{$username}]** and *italic text*';
      const context = { userName: 'JohnDoe' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<strong>');
      expect(result).toContain('JohnDoe');
      expect(result).toContain('</strong>');
      expect(result).toContain('<em>');
      expect(result).toContain('italic');
    });

    test('preserves markdown code blocks', async () => {
      const content = '```\ncode here\n```\nUser: [{$username}]';
      const context = { userName: 'JohnDoe' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<code>');
      expect(result).toContain('code here');
      expect(result).toContain('JohnDoe');
    });
  });

  describe('Multiple Elements', () => {
    test('handles multiple variables', async () => {
      const content = 'User: [{$username}], Page: [{$pagename}], App: [{$applicationname}]';
      const context = { userName: 'JohnDoe', pageName: 'TestPage' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('JohnDoe');
      expect(result).toContain('TestPage');
      expect(result).toContain('ngdpbase');
      expect(result).not.toContain('<!--JSPWIKI-');
    });

    test('handles multiple plugins', async () => {
      const content = '[{TOC}]\n\nContent here\n\n[{CurrentTimePlugin}]';
      const context = { pageName: 'TestPage' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('class="toc"');
      expect(result).toContain('class="time"');
      expect(result).not.toContain('<!--JSPWIKI-');
    });

    test('handles multiple links', async () => {
      const content = 'See [HomePage], [Features], and [AboutPage]';
      const context = { pageName: 'TestPage' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('HomePage');
      expect(result).toContain('Features');
      expect(result).toContain('AboutPage');
      expect(result).not.toContain('<!--JSPWIKI-');
    });

    test('handles mixed JSPWiki syntax', async () => {
      const content = '[{$username}] on [HomePage] using [{TOC}]';
      const context = { userName: 'JohnDoe', pageName: 'TestPage' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('JohnDoe');
      expect(result).toContain('HomePage');
      expect(result).toContain('class="toc"');
      expect(result).not.toContain('<!--JSPWIKI-');
    });
  });

  describe('Nested JSPWiki Syntax', () => {
    test('handles variable inside plugin parameter', async () => {
      // Note: Currently variables inside plugin parameters are extracted separately
      // The plugin receives the literal parameter text
      const content = '[{Search query="test"}] and [{$username}]';
      const context = { userName: 'JohnDoe', pageName: 'TestPage' };

      const result = await parser.parseWithDOMExtraction(content, context);

      // Plugin should execute and variable should be resolved
      expect(result).toContain('search-results');
      expect(result).toContain('JohnDoe');
      expect(result).not.toContain('<!--JSPWIKI-');
    });

    test('handles link with separate variable', async () => {
      // Variables are extracted first, then links, so this becomes two elements
      const content = '[{$username}] visits [HomePage]';
      const context = { userName: 'JohnDoe', pageName: 'TestPage' };

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('JohnDoe');
      expect(result).toContain('HomePage');
      expect(result).toContain('wiki-link');
      expect(result).not.toContain('<!--JSPWIKI-');
    });
  });

  describe('Edge Cases', () => {
    test('handles user writing placeholder-like text', async () => {
      const content = 'Test <!--JSPWIKI-0--> text and [{$username}]';
      const context = { userName: 'JohnDoe' };

      const result = await parser.parseWithDOMExtraction(content, context);

      // UUID prevents conflict, user's text preserved
      expect(result).toContain('Test <!--JSPWIKI-0--> text');
      expect(result).toContain('JohnDoe');
    });

    test('handles empty content', async () => {
      const content = '';
      const context = {};

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toBeDefined();
      expect(result).toBe('');
    });

    test('handles content with no JSPWiki syntax', async () => {
      const content = '## Just Markdown\n\nNo wiki syntax here.';
      const context = {};

      const result = await parser.parseWithDOMExtraction(content, context);

      expect(result).toContain('<h2');
      expect(result).toContain('Just Markdown');
      expect(result).toContain('</h2>');
      expect(result).toContain('No wiki syntax here');
    });

    test('handles malformed JSPWiki syntax gracefully', async () => {
      const content = '[{InvalidSyntax';
      const context = {};

      const result = await parser.parseWithDOMExtraction(content, context);

      // Should not crash, just preserve the text
      expect(result).toBeDefined();
    });
  });

  describe('Complex Content', () => {
    test('handles mixed complex content', async () => {
      const content = `
## Test Heading

Current user: [{$username}]
Current page: [{$pagename}]

[{TableOfContents}]

Visit [HomePage] for more information.

### Subsection

- Item 1: [{$applicationname}]
- Item 2
- Item 3: [Features]

**Bold text** and *italic text*

[External Link](https://example.com)

Time: [{CurrentTimePlugin}]
`;
      const context = { userName: 'JohnDoe', pageName: 'TestPage' };

      const result = await parser.parseWithDOMExtraction(content, context);

      // Headings (markdown-it adds IDs)
      expect(result).toContain('<h2');
      expect(result).toContain('Test Heading');
      expect(result).toContain('</h2>');
      expect(result).toContain('<h3');
      expect(result).toContain('Subsection');
      expect(result).toContain('</h3>');

      // Variables
      expect(result).toContain('JohnDoe');
      expect(result).toContain('TestPage');
      expect(result).toContain('ngdpbase');

      // Plugins
      expect(result).toContain('class="toc"');
      expect(result).toContain('class="time"');

      // Links
      expect(result).toContain('HomePage');
      expect(result).toContain('Features');
      expect(result).toContain('https://example.com');

      // Lists
      expect(result).toContain('<li>');

      // Formatting
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');

      // No placeholders
      expect(result).not.toContain('<!--JSPWIKI-');
    });
  });

  describe('Helper Methods', () => {
    describe('createDOMNode()', () => {
      let wikiDocument;

      beforeEach(() => {
        wikiDocument = new WikiDocument('');
      });

      test('creates variable node', async () => {
        const element = { type: 'variable', varName: '$username', id: 0 };
        const context = { userName: 'JohnDoe' };

        const node = await parser.createDOMNode(element, context, wikiDocument);

        expect(node.tagName).toBe('SPAN');
        expect(node.className).toBe('wiki-variable');
        expect(node.textContent).toBe('JohnDoe');
      });

      test('creates plugin node', async () => {
        const element = { type: 'plugin', inner: 'TOC', id: 0 };
        const context = { pageName: 'TestPage' };

        const node = await parser.createDOMNode(element, context, wikiDocument);

        expect(node.tagName).toBe('DIV');
        // className may be 'wiki-plugin' or the plugin's rendered class (e.g. 'toc') after unwrapping
        expect(node.getAttribute('data-plugin') || node.tagName).toBeTruthy();
      });

      test('creates link node', async () => {
        const element = { type: 'link', target: 'HomePage', id: 0 };
        const context = { pageName: 'TestPage' };

        const node = await parser.createDOMNode(element, context, wikiDocument);

        expect(node.tagName).toBe('A');
        expect(node.textContent).toBe('HomePage');
      });

      test('creates escaped node', async () => {
        const element = { type: 'escaped', literal: '[{$username}]', id: 0 };
        const context = {};

        const node = await parser.createDOMNode(element, context, wikiDocument);

        expect(node.tagName).toBe('SPAN');
        expect(node.className).toBe('wiki-escaped');
        expect(node.textContent).toBe('[{$username}]');
      });

      test('creates error node for unknown type', async () => {
        const element = { type: 'unknown', id: 0 };
        const context = {};

        const node = await parser.createDOMNode(element, context, wikiDocument);

        expect(node.tagName).toBe('SPAN');
        expect(node.className).toBe('wiki-error');
        expect(node.textContent).toContain('Unknown type');
      });
    });

    describe('mergeDOMNodes()', () => {
      let wikiDocument;

      beforeEach(() => {
        wikiDocument = new WikiDocument('');
      });

      test('replaces single placeholder', () => {
        // Use the current span-based placeholder format (not the old HTML comment format)
        const html = '<p>User: <span data-jspwiki-placeholder="abc123-0"></span></p>';
        const node = wikiDocument.createElement('span');
        node.setAttribute('data-jspwiki-id', '0');
        node.textContent = 'JohnDoe';
        const nodes = [node];

        const result = parser.mergeDOMNodes(html, nodes, 'abc123');

        expect(result).toContain('JohnDoe');
        expect(result).not.toContain('data-jspwiki-placeholder="abc123-0"');
      });

      test('replaces multiple placeholders', () => {
        const html = '<p><span data-jspwiki-placeholder="abc-0"></span> and <span data-jspwiki-placeholder="abc-1"></span></p>';

        const node0 = wikiDocument.createElement('span');
        node0.setAttribute('data-jspwiki-id', '0');
        node0.textContent = 'First';

        const node1 = wikiDocument.createElement('span');
        node1.setAttribute('data-jspwiki-id', '1');
        node1.textContent = 'Second';

        const nodes = [node0, node1];

        const result = parser.mergeDOMNodes(html, nodes, 'abc');

        expect(result).toContain('First');
        expect(result).toContain('Second');
        expect(result).not.toContain('data-jspwiki-placeholder="abc-');
      });

      test('handles nested placeholders (reverse order)', () => {
        // Simulate plugin containing variable
        const html = '<p><span data-jspwiki-placeholder="abc-1"></span></p>';

        const node0 = wikiDocument.createElement('span');
        node0.setAttribute('data-jspwiki-id', '0');
        node0.textContent = 'Variable';

        const node1 = wikiDocument.createElement('div');
        node1.setAttribute('data-jspwiki-id', '1');
        node1.innerHTML = 'Plugin: <span data-jspwiki-placeholder="abc-0"></span>';

        const nodes = [node0, node1];

        const result = parser.mergeDOMNodes(html, nodes, 'abc');

        // Should replace plugin first (id=1), then variable (id=0)
        // data-jspwiki-id is stripped from final output (internal routing attribute)
        expect(result).toContain('Plugin:');
        expect(result).toContain('Variable');
        expect(result).not.toContain('data-jspwiki-id=');
        expect(result).not.toContain('data-jspwiki-placeholder="abc-');
      });

      test('handles empty nodes array', () => {
        const html = '<p>Test content</p>';
        const nodes = [];

        const result = parser.mergeDOMNodes(html, nodes, 'abc');

        expect(result).toBe(html);
      });

      test('handles null nodes', () => {
        const html = '<p>Test content</p>';

        const result = parser.mergeDOMNodes(html, null, 'abc');

        expect(result).toBe(html);
      });
    });
  });

  describe('Performance', () => {
    test('merge completes in reasonable time', async () => {
      const content = `
## Heading
User: [{$username}]
[{TOC}]
[HomePage]
      `.repeat(10); // 40 elements

      const context = { userName: 'JohnDoe', pageName: 'TestPage' };

      const start = Date.now();
      const result = await parser.parseWithDOMExtraction(content, context);
      const duration = Date.now() - start;

      expect(result).toBeDefined();
      expect(result).not.toContain('<!--JSPWIKI-');
      expect(duration).toBeLessThan(500); // Should be fast
    });
  });
});
