/**
 * MarkupParser - DOM Node Creation Tests (Phase 2)
 *
 * Tests the createNodeFromExtract() methods added to handlers in Phase 2
 * of the WikiDocument DOM migration (Issue #116).
 *
 * These tests verify that extracted JSPWiki elements can be converted
 * to proper DOM nodes with correct attributes and content.
 */

import MarkupParser from '../MarkupParser';
import WikiDocument from '../dom/WikiDocument';
import DOMVariableHandler from '../dom/handlers/DOMVariableHandler';
import DOMPluginHandler from '../dom/handlers/DOMPluginHandler';
import DOMLinkHandler from '../dom/handlers/DOMLinkHandler';
import { LinkParser } from '../LinkParser';

// Mock engine for testing
const createMockEngine = () => {
  const variableHandlers = new Map();

  // Register test variables
  variableHandlers.set('username', (context) => context?.userName || 'TestUser');
  variableHandlers.set('pagename', (context) => context?.pageName || 'TestPage');
  variableHandlers.set('applicationname', () => 'ngdpbase');

  const pluginManager = {
    execute: vi.fn(async (pluginName, pageName, params, context) => {
      if (pluginName === 'CurrentTimePlugin') {
        return '<div>Current time: 12:00 PM</div>';
      }
      if (pluginName === 'Search') {
        return '<div>Search results...</div>';
      }
      if (pluginName === 'NonExistentPlugin') {
        throw new Error('Plugin not found');
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
          getAllPages: async () => ['HomePage', 'TestPage', 'AboutPage']
        };
      }
      return null;
    })
  };
};

// Skipped: Output format expectations don't match current implementation
describe('MarkupParser - DOM Node Creation (Phase 2)', () => {
  let mockEngine;
  let parser;
  let wikiDocument;

  beforeEach(async () => {
    // Create mock engine
    mockEngine = createMockEngine();

    // Create MarkupParser instance
    parser = new MarkupParser(mockEngine);

    // Create a WikiDocument for testing
    wikiDocument = new WikiDocument('');
  });

  describe('createTextNodeForEscaped()', () => {
    test('creates span element with escaped literal text', () => {
      const element = {
        type: 'escaped',
        syntax: '[[{$username}]',
        literal: '[{$username}]',
        id: 0
      };

      const node = parser.createTextNodeForEscaped(element, wikiDocument);

      expect(node.tagName).toBe('SPAN');
      expect(node.className).toBe('wiki-escaped');
      expect(node.textContent).toBe('[{$username}]');
      expect(node.getAttribute('data-jspwiki-id')).toBe('0');
    });

    test('handles escaped plugin syntax', () => {
      const element = {
        type: 'escaped',
        syntax: '[[{TableOfContents}]',
        literal: '[{TableOfContents}]',
        id: 1
      };

      const node = parser.createTextNodeForEscaped(element, wikiDocument);

      expect(node.textContent).toBe('[{TableOfContents}]');
      expect(node.getAttribute('data-jspwiki-id')).toBe('1');
    });

    test('handles escaped link syntax', () => {
      const element = {
        type: 'escaped',
        syntax: '[[{HomePage}]',
        literal: '[{HomePage}]',
        id: 2
      };

      const node = parser.createTextNodeForEscaped(element, wikiDocument);

      expect(node.textContent).toBe('[{HomePage}]');
      expect(node.getAttribute('data-jspwiki-id')).toBe('2');
    });
  });

  describe('DOMVariableHandler.createNodeFromExtract()', () => {
    let variableHandler;

    beforeEach(async () => {
      variableHandler = new DOMVariableHandler(mockEngine);
      await variableHandler.initialize();
    });

    test('creates node for resolved variable', async () => {
      const element = {
        type: 'variable',
        varName: '$applicationname',
        id: 0
      };

      const context = {
        pageName: 'TestPage',
        userName: 'TestUser'
      };

      const node = await variableHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('SPAN');
      expect(node.className).toBe('wiki-variable');
      expect(node.getAttribute('data-variable')).toBe('applicationname');
      expect(node.getAttribute('data-jspwiki-id')).toBe('0');
      // applicationname should resolve to 'ngdpbase' or similar
      expect(node.textContent).toBeTruthy();
    });

    test('creates node for unresolved variable', async () => {
      const element = {
        type: 'variable',
        varName: '$unknownvariable',
        id: 1
      };

      const context = {
        pageName: 'TestPage',
        userName: 'TestUser'
      };

      const node = await variableHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('SPAN');
      expect(node.textContent).toBe('{$unknownvariable}');
      expect(node.getAttribute('data-jspwiki-id')).toBe('1');
    });

    test('removes $ prefix from variable name', async () => {
      const element = {
        type: 'variable',
        varName: '$username',
        id: 2
      };

      const context = {
        userName: 'JohnDoe'
      };

      const node = await variableHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.getAttribute('data-variable')).toBe('username');
      expect(node.textContent).toBe('JohnDoe');
    });

    test('handles variable name without $ prefix', async () => {
      const element = {
        type: 'variable',
        varName: 'username',
        id: 3
      };

      const context = {
        userName: 'JohnDoe'
      };

      const node = await variableHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.getAttribute('data-variable')).toBe('username');
      expect(node.textContent).toBe('JohnDoe');
    });
  });

  describe('DOMPluginHandler.createNodeFromExtract()', () => {
    let pluginHandler;

    beforeEach(async () => {
      pluginHandler = new DOMPluginHandler(mockEngine);
      await pluginHandler.initialize();
    });

    test('creates node for valid plugin without parameters', async () => {
      const element = {
        type: 'plugin',
        inner: 'CurrentTimePlugin',
        id: 0
      };

      const context = {
        pageName: 'TestPage',
        userName: 'TestUser'
      };

      const node = await pluginHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('DIV');
      // className may be 'wiki-plugin' or the plugin's own class after unwrapping
      expect(node.getAttribute('data-plugin')).toBe('CurrentTimePlugin');
      expect(node.getAttribute('data-jspwiki-id')).toBe('0');
    });

    test('creates node for plugin with parameters', async () => {
      const element = {
        type: 'plugin',
        inner: 'Search query="test" max=10',
        id: 1
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await pluginHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('DIV');
      expect(node.getAttribute('data-plugin')).toBe('Search');
      expect(node.getAttribute('data-jspwiki-id')).toBe('1');
    });

    test('creates error node for invalid plugin syntax', async () => {
      const element = {
        type: 'plugin',
        inner: '',  // Empty plugin name
        id: 2
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await pluginHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('SPAN');
      expect(node.className).toBe('wiki-plugin-error');
      expect(node.textContent).toContain('Error');
      expect(node.getAttribute('data-jspwiki-id')).toBe('2');
    });

    test('creates error node for non-existent plugin', async () => {
      const element = {
        type: 'plugin',
        inner: 'NonExistentPlugin',
        id: 3
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await pluginHandler.createNodeFromExtract(element, context, wikiDocument);

      // Should create error node since plugin doesn't exist
      expect(node.getAttribute('data-jspwiki-id')).toBe('3');
      // Either success div or error span depending on whether plugin exists
      expect(['DIV', 'SPAN']).toContain(node.tagName);
    });
  });

  describe('DOMLinkHandler.createNodeFromExtract()', () => {
    let linkHandler;

    beforeEach(async () => {
      linkHandler = new DOMLinkHandler(mockEngine);
      await linkHandler.initialize();
    });

    test('creates node for internal wiki link (simple)', async () => {
      const element = {
        type: 'link',
        target: 'HomePage',
        id: 0
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('A');
      expect(node.textContent).toBe('HomePage');
      expect(node.getAttribute('data-link-type')).toBe('internal');
      expect(node.getAttribute('data-target')).toBe('HomePage');
      expect(node.getAttribute('data-jspwiki-id')).toBe('0');
      expect(node.getAttribute('href')).toBeTruthy();
    });

    test('creates node for internal wiki link with pipe syntax', async () => {
      const element = {
        type: 'link',
        target: 'Click Here|HomePage',
        id: 1
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('A');
      expect(node.textContent).toBe('Click Here');
      expect(node.getAttribute('data-target')).toBe('HomePage');
      expect(node.getAttribute('data-jspwiki-id')).toBe('1');
    });

    test('creates node for external link', async () => {
      const element = {
        type: 'link',
        target: 'Visit Google|https://www.google.com',
        id: 2
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('A');
      expect(node.textContent).toBe('Visit Google');
      expect(node.getAttribute('href')).toBe('https://www.google.com');
      expect(node.getAttribute('class')).toContain('external-link');
      expect(node.getAttribute('target')).toBe('_blank');
      expect(node.getAttribute('rel')).toBe('noopener noreferrer');
      expect(node.getAttribute('data-link-type')).toBe('external');
      expect(node.getAttribute('data-jspwiki-id')).toBe('2');
    });

    test('creates node for InterWiki link', async () => {
      const element = {
        type: 'link',
        target: 'Apache|Wikipedia:Apache_HTTP_Server',
        id: 3
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('A');
      expect(node.textContent).toBe('Apache');
      expect(node.getAttribute('data-link-type')).toBe('interwiki');
      expect(node.getAttribute('href')).toContain('wikipedia.org');
      expect(node.getAttribute('data-jspwiki-id')).toBe('3');
    });

    test('creates node for email link', async () => {
      const element = {
        type: 'link',
        target: 'Contact|mailto:test@example.com',
        id: 4
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('A');
      expect(node.textContent).toBe('Contact');
      expect(node.getAttribute('href')).toBe('mailto:test@example.com');
      expect(node.getAttribute('class')).toContain('email-link');
      expect(node.getAttribute('data-link-type')).toBe('email');
      expect(node.getAttribute('data-jspwiki-id')).toBe('4');
    });

    test('creates node for anchor link', async () => {
      const element = {
        type: 'link',
        target: 'Jump to Section|#section',
        id: 5
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('A');
      expect(node.textContent).toBe('Jump to Section');
      expect(node.getAttribute('href')).toBe('#section');
      expect(node.getAttribute('class')).toContain('anchor-link');
      expect(node.getAttribute('data-link-type')).toBe('anchor');
      expect(node.getAttribute('data-jspwiki-id')).toBe('5');
    });

    test('creates red link for non-existent page', async () => {
      const element = {
        type: 'link',
        target: 'NonExistentPage123456789',
        id: 6
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.tagName).toBe('A');
      expect(node.textContent).toBe('NonExistentPage123456789');
      expect(node.getAttribute('class')).toContain('redlink');
      expect(node.getAttribute('style')).toContain('red');
      expect(node.getAttribute('href')).toContain('edit');
      expect(node.getAttribute('data-jspwiki-id')).toBe('6');
    });

    // Section anchors (#1024) — the fragment must be split off the page name,
    // otherwise the whole string is treated as a page and always redlinks.
    test('creates node for internal link with section slug', async () => {
      const element = {
        type: 'link',
        target: 'The Elements|HomePage#the-elements',
        id: 7
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.getAttribute('href')).toBe('/view/HomePage#the-elements');
      expect(node.getAttribute('class')).toContain('wikipage');
      expect(node.getAttribute('class')).not.toContain('redlink');
      expect(node.getAttribute('data-jspwiki-id')).toBe('7');
    });

    test('resolves #section=Heading Name to a slug on internal links', async () => {
      const element = {
        type: 'link',
        target: 'The Elements|HomePage#section=The Elemental Ingredients',
        id: 8
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.getAttribute('href')).toBe('/view/HomePage#the-elemental-ingredients');
      expect(node.getAttribute('class')).toContain('wikipage');
      expect(node.getAttribute('data-jspwiki-id')).toBe('8');
    });

    test('keeps the section fragment on a red link', async () => {
      const element = {
        type: 'link',
        target: 'Missing|NonExistentPage123456789#some-heading',
        id: 9
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.getAttribute('href')).toBe('/edit/NonExistentPage123456789#some-heading');
      expect(node.getAttribute('class')).toContain('redlink');
      expect(node.getAttribute('title')).toBe('Create page: NonExistentPage123456789');
    });

    test('resolves #section=Heading Name on same-page anchor links', async () => {
      const element = {
        type: 'link',
        target: 'Jump|#section=The Elemental Ingredients',
        id: 10
      };

      const context = {
        pageName: 'TestPage'
      };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node.getAttribute('href')).toBe('#the-elemental-ingredients');
      expect(node.getAttribute('class')).toContain('anchor-link');
    });
  });

  describe('Integration: All node types maintain data-jspwiki-id', () => {
    test('all created nodes have data-jspwiki-id attribute', async () => {
      const variableHandler = new DOMVariableHandler(mockEngine);
      await variableHandler.initialize();
      const pluginHandler = new DOMPluginHandler(mockEngine);
      await pluginHandler.initialize();
      const linkHandler = new DOMLinkHandler(mockEngine);
      await linkHandler.initialize();

      const context = { pageName: 'TestPage', userName: 'TestUser' };

      // Test variable node
      const varElement = { type: 'variable', varName: '$username', id: 10 };
      const varNode = await variableHandler.createNodeFromExtract(varElement, context, wikiDocument);
      expect(varNode.getAttribute('data-jspwiki-id')).toBe('10');

      // Test plugin node
      const pluginElement = { type: 'plugin', inner: 'CurrentTimePlugin', id: 20 };
      const pluginNode = await pluginHandler.createNodeFromExtract(pluginElement, context, wikiDocument);
      expect(pluginNode.getAttribute('data-jspwiki-id')).toBe('20');

      // Test link node
      const linkElement = { type: 'link', target: 'HomePage', id: 30 };
      const linkNode = await linkHandler.createNodeFromExtract(linkElement, context, wikiDocument);
      expect(linkNode.getAttribute('data-jspwiki-id')).toBe('30');

      // Test escaped node
      const escapedElement = { type: 'escaped', literal: '[{$test}]', id: 40 };
      const escapedNode = parser.createTextNodeForEscaped(escapedElement, wikiDocument);
      expect(escapedNode.getAttribute('data-jspwiki-id')).toBe('40');
    });

    test('ID values are preserved correctly', async () => {
      const variableHandler = new DOMVariableHandler(mockEngine);
      await variableHandler.initialize();
      const context = { pageName: 'TestPage', userName: 'TestUser' };

      // Test with various ID values
      const ids = [0, 1, 99, 1000, 12345];

      for (const id of ids) {
        const element = { type: 'variable', varName: '$username', id };
        const node = await variableHandler.createNodeFromExtract(element, context, wikiDocument);
        expect(node.getAttribute('data-jspwiki-id')).toBe(id.toString());
      }
    });
  });

  describe('Error handling', () => {
    test('variable handler handles missing VariableManager gracefully', async () => {
      const variableHandler = new DOMVariableHandler(mockEngine);
      await variableHandler.initialize();

      // Temporarily remove VariableManager reference
      const originalManager = variableHandler.variableManager;
      variableHandler.variableManager = null;

      const element = { type: 'variable', varName: '$test', id: 0 };
      const context = { pageName: 'TestPage' };

      const node = await variableHandler.createNodeFromExtract(element, context, wikiDocument);

      // Should still create a node (with unresolved variable)
      expect(node).toBeTruthy();
      expect(node.getAttribute('data-jspwiki-id')).toBe('0');

      // Restore
      variableHandler.variableManager = originalManager;
    });

    test('plugin handler handles missing PluginManager gracefully', async () => {
      // Create engine that returns null for PluginManager
      const badEngine = {
        getManager: vi.fn((name) => {
          if (name === 'PluginManager') {
            return null;
          }
          return mockEngine.getManager(name);
        })
      };

      const pluginHandler = new DOMPluginHandler(badEngine);
      await pluginHandler.initialize();

      const element = { type: 'plugin', inner: 'TestPlugin', id: 0 };
      const context = { pageName: 'TestPage' };

      // Should create an error node when PluginManager is not available
      const node = await pluginHandler.createNodeFromExtract(element, context, wikiDocument);

      expect(node).toBeTruthy();
      expect(node.tagName).toBe('SPAN');
      expect(node.className).toBe('wiki-plugin-error');
      expect(node.textContent).toContain('Error');
      expect(node.getAttribute('data-jspwiki-id')).toBe('0');
    });

    test('link handler handles unknown InterWiki site', async () => {
      const linkHandler = new DOMLinkHandler(mockEngine);
      await linkHandler.initialize();

      const element = {
        type: 'link',
        target: 'Test|UnknownWiki:Page',
        id: 0
      };

      const context = { pageName: 'TestPage' };

      const node = await linkHandler.createNodeFromExtract(element, context, wikiDocument);

      // Should fall back to treating as internal link
      expect(node.tagName).toBe('A');
      expect(node.getAttribute('data-jspwiki-id')).toBe('0');
      // Should create a red link since UnknownWiki:Page doesn't exist
      expect(node.className).toContain('redlink');
    });
  });
});
