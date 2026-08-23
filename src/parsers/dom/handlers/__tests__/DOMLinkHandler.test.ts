/**
 * Unit tests for DOMLinkHandler
 * Tests DOM-based link processing
 *
 * Part of Phase 5 of WikiDocument DOM Migration (GitHub Issue #108)
 */

// Mock logger to capture warnings
vi.mock('../../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()

  }
}));

import logger from '../../../../utils/logger';
import DOMLinkHandler from '../DOMLinkHandler';
import WikiDocument from '../../WikiDocument';
import { DOMParser } from '../../DOMParser';
import { type MockInstance } from 'vitest';

// Mock engine with PageManager and ConfigurationManager
const createMockEngine = () => {
  const mockPageNames = ['HomePage', 'WikiDocumentation', 'TestPage', 'PageIndex'];

  return {
    getManager: vi.fn((name) => {
      if (name === 'PageManager') {
        return {
          getAllPages: vi.fn(async () => mockPageNames)
        };
      }
      if (name === 'ConfigurationManager') {
        return {
          getProperty: vi.fn((key, defaultValue) => {
            if (key === 'ngdpbase.translator-reader.match-english-plurals') return true;
            if (key === 'ngdpbase.interwiki.enabled') return true;
            if (key === 'ngdpbase.interwiki.sites') {
              return {
                Wikipedia: { url: 'https://en.wikipedia.org/wiki/%s', enabled: true, openInNewWindow: true },
                JSPWiki: { url: 'https://jspwiki-wiki.apache.org/Wiki.jsp?page=%s', enabled: true, openInNewWindow: true }
              };
            }
            return defaultValue;
          })
        };
      }
      return null;
    })
  };
};

describe('DOMLinkHandler', () => {
  let handler;
  let mockEngine;
  let parser;

  beforeEach(async () => {
    mockEngine = createMockEngine();
    handler = new DOMLinkHandler(mockEngine);
    await handler.initialize();

    // Create parser for integration tests
    parser = new DOMParser();
  });

  describe('Constructor and Initialization', () => {
    test('creates handler with engine', () => {
      expect(handler.engine).toBe(mockEngine);
      expect(handler.linkParser).not.toBeNull();
    });

    test('loads page names from PageManager', async () => {
      expect(handler.pageNames.size).toBeGreaterThan(0);
      expect(handler.pageNames.has('HomePage')).toBe(true);
      expect(handler.pageNames.has('TestPage')).toBe(true);
    });

    test('warns if PageManager not available', async () => {
      (logger.warn as MockInstance).mockClear();

      const badEngine = {
        getManager: vi.fn(() => null)
      };

      const badHandler = new DOMLinkHandler(badEngine);
      await badHandler.initialize();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('PageManager not available')
      );
    });

    test('loads InterWiki sites configuration', async () => {
      const sites = handler.linkParser.interWikiSites;
      expect(sites.size).toBeGreaterThan(0);
      expect(sites.has('Wikipedia')).toBe(true);
      expect(sites.has('JSPWiki')).toBe(true);
    });
  });

  describe('processLinks()', () => {
    test('processes internal wiki link (existing page)', async () => {
      const wikiDoc = parser.parse('[HomePage]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('href="/view/HomePage"');
      expect(html).toContain('class="wiki-link wikipage"');
      expect(html).not.toContain('redlink');
    });

    test('processes internal wiki link (non-existing page)', async () => {
      const wikiDoc = parser.parse('[NonExistingPage]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('href="/edit/NonExistingPage"');
      expect(html).toContain('class="wiki-link redlink"');
      expect(html).toContain('color: red');
      expect(html).toContain('Create page: NonExistingPage');
    });

    // #1082: a rename used to break every inbound link silently — apiRenamePage
    // says so in its own comment ("the old title is simply gone"). These cover
    // the fallback that resolves a link to a page's former title, and the
    // ambiguity rule that stops it guessing.
    describe('renamed pages (#1082)', () => {
      const withRenameMap = (resolveRenamedPage) => {
        const engine = createMockEngine();
        const inner = engine.getManager;
        engine.getManager = vi.fn((name) => {
          if (name === 'RenderingManager') return { resolveRenamedPage };
          return inner(name);
        });
        return engine;
      };

      test('a link to a renamed page resolves to its current title instead of a red link', async () => {
        const renamedHandler = new DOMLinkHandler(withRenameMap(
          (title) => (title === 'OldName' ? 'HomePage' : null)
        ));
        await renamedHandler.initialize();

        const wikiDoc = parser.parse('[OldName]', {});
        await renamedHandler.processLinks(wikiDoc, { pageName: 'TestPage' });

        const html = wikiDoc.toHTML();
        expect(html).toContain('href="/view/HomePage"');
        expect(html).not.toContain('redlink');
      });

      test('a live page still wins over the rename map', async () => {
        // The fallback runs only after live resolution fails, so a stale
        // rename can never shadow a page that exists.
        const shadowing = vi.fn().mockReturnValue('SomewhereElse');
        const renamedHandler = new DOMLinkHandler(withRenameMap(shadowing));
        await renamedHandler.initialize();

        const wikiDoc = parser.parse('[HomePage]', {});
        await renamedHandler.processLinks(wikiDoc, { pageName: 'TestPage' });

        expect(wikiDoc.toHTML()).toContain('href="/view/HomePage"');
        expect(shadowing).not.toHaveBeenCalled();
      });

      test('an unresolvable title stays a red link', async () => {
        const renamedHandler = new DOMLinkHandler(withRenameMap(() => null));
        await renamedHandler.initialize();

        const wikiDoc = parser.parse('[NeverExisted]', {});
        await renamedHandler.processLinks(wikiDoc, { pageName: 'TestPage' });

        expect(wikiDoc.toHTML()).toContain('class="wiki-link redlink"');
      });

      test('a RenderingManager without the rename map does not break link rendering', async () => {
        // The map is derived state a deployment may not have populated.
        const renamedHandler = new DOMLinkHandler(withRenameMap(undefined));
        await renamedHandler.initialize();

        const wikiDoc = parser.parse('[NonExistingPage]', {});
        await renamedHandler.processLinks(wikiDoc, { pageName: 'TestPage' });

        expect(wikiDoc.toHTML()).toContain('class="wiki-link redlink"');
      });

      test('a throwing rename lookup degrades to a red link rather than failing the render', async () => {
        const renamedHandler = new DOMLinkHandler(withRenameMap(() => {
          throw new Error('rename map exploded');
        }));
        await renamedHandler.initialize();

        const wikiDoc = parser.parse('[NonExistingPage]', {});
        await renamedHandler.processLinks(wikiDoc, { pageName: 'TestPage' });

        expect(wikiDoc.toHTML()).toContain('class="wiki-link redlink"');
      });
    });

    test('processes internal link with display text', async () => {
      const wikiDoc = parser.parse('[Go Home|HomePage]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('Go Home');
      expect(html).toContain('href="/view/HomePage"');
      expect(html).toContain('wikipage');
    });

    test('processes external link', async () => {
      const wikiDoc = parser.parse('[Google|https://www.google.com]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('href="https://www.google.com"');
      expect(html).toContain('class="wiki-link external-link"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    });

    test('processes InterWiki link', async () => {
      const wikiDoc = parser.parse('[Wiki Article|Wikipedia:DOM_Parsing]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('href="https://en.wikipedia.org/wiki/DOM_Parsing"');
      expect(html).toContain('class="wiki-link interwiki-link interwiki-wikipedia"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
    });

    test('processes email link', async () => {
      const wikiDoc = parser.parse('[Contact|mailto:test@example.com]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('href="mailto:test@example.com"');
      expect(html).toContain('class="wiki-link email-link"');
    });

    test('processes anchor link', async () => {
      const wikiDoc = parser.parse('[Jump to Section|#section]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('href="#section"');
      expect(html).toContain('class="wiki-link anchor-link"');
    });

    test('processes multiple links of different types', async () => {
      const wikiDoc = parser.parse(
        '[HomePage] and [Google|https://google.com] and [Wiki|Wikipedia:Test]',
        {}
      );

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('wikipage');
      expect(html).toContain('external-link');
      expect(html).toContain('interwiki-link');
    });

    test('returns unchanged document if no links', async () => {
      const wikiDoc = parser.parse('No links here', {});
      const originalHTML = wikiDoc.toHTML();

      await handler.processLinks(wikiDoc, {});

      const newHTML = wikiDoc.toHTML();
      expect(newHTML).toBe(originalHTML);
    });

    test('handles link processing errors gracefully', async () => {
      const wikiDoc = parser.parse('[TestLink]', {});

      // Force an error by making linkParser null
      const originalLinkParser = handler.linkParser;
      handler.linkParser = null;

      logger.warn.mockClear();

      await handler.processLinks(wikiDoc, {});

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot process links')
      );

      handler.linkParser = originalLinkParser;
    });
  });

  describe('Link Type Determination', () => {
    test('correctly identifies internal link', () => {
      const linkInfo = { text: 'HomePage', target: 'HomePage', attributes: {} };
      const linkType = handler.linkParser.determineLinkType(linkInfo);
      expect(linkType).toBe('internal');
    });

    test('correctly identifies external HTTP link', () => {
      const linkInfo = { text: 'Google', target: 'http://www.google.com', attributes: {} };
      const linkType = handler.linkParser.determineLinkType(linkInfo);
      expect(linkType).toBe('external');
    });

    test('correctly identifies external HTTPS link', () => {
      const linkInfo = { text: 'Google', target: 'https://www.google.com', attributes: {} };
      const linkType = handler.linkParser.determineLinkType(linkInfo);
      expect(linkType).toBe('external');
    });

    test('correctly identifies InterWiki link', () => {
      const linkInfo = { text: 'Article', target: 'Wikipedia:Article', attributes: {} };
      const linkType = handler.linkParser.determineLinkType(linkInfo);
      expect(linkType).toBe('interwiki');
    });

    test('correctly identifies email link', () => {
      const linkInfo = { text: 'Email', target: 'mailto:test@example.com', attributes: {} };
      const linkType = handler.linkParser.determineLinkType(linkInfo);
      expect(linkType).toBe('email');
    });

    test('correctly identifies anchor link', () => {
      const linkInfo = { text: 'Section', target: '#section', attributes: {} };
      const linkType = handler.linkParser.determineLinkType(linkInfo);
      expect(linkType).toBe('anchor');
    });
  });

  describe('getStatistics()', () => {
    test('returns statistics for document with links', async () => {
      const wikiDoc = parser.parse(
        '[HomePage] and [NonExisting] and [Google|https://google.com]',
        {}
      );

      await handler.processLinks(wikiDoc, {});

      const stats = handler.getStatistics(wikiDoc);

      expect(stats.totalLinks).toBe(3);
      expect(stats.linkTypes.internal).toBe(2); // HomePage + NonExisting
      expect(stats.linkTypes.external).toBe(1); // Google
      expect(stats.redLinks).toBe(1); // NonExisting
    });

    test('returns empty statistics for document without links', () => {
      const wikiDoc = parser.parse('No links', {});

      const stats = handler.getStatistics(wikiDoc);

      expect(stats.totalLinks).toBe(0);
    });

    test('counts InterWiki links', async () => {
      const wikiDoc = parser.parse('[Article|Wikipedia:DOM]', {});

      await handler.processLinks(wikiDoc, {});

      const stats = handler.getStatistics(wikiDoc);

      expect(stats.totalLinks).toBe(1);
      expect(stats.linkTypes.interwiki).toBe(1);
    });

    test('counts different link types correctly', async () => {
      const wikiDoc = parser.parse(
        '[HomePage] [Email|mailto:test@example.com] [Section|#top] [Wiki|Wikipedia:Test] [Site|https://example.com]',
        {}
      );

      await handler.processLinks(wikiDoc, {});

      const stats = handler.getStatistics(wikiDoc);

      expect(stats.totalLinks).toBe(5);
      expect(stats.linkTypes.internal).toBe(1);
      expect(stats.linkTypes.email).toBe(1);
      expect(stats.linkTypes.anchor).toBe(1);
      expect(stats.linkTypes.interwiki).toBe(1);
      expect(stats.linkTypes.external).toBe(1);
    });
  });

  describe('Integration with DOMParser', () => {
    test('links in paragraphs', async () => {
      const wikiDoc = parser.parse('Check out [HomePage] for more info', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('Check out');
      expect(html).toContain('for more info');
      expect(html).toContain('href="/view/HomePage"');
    });

    test('links with other markup', async () => {
      const wikiDoc = parser.parse('__Bold__ and [HomePage]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('<strong');
      expect(html).toContain('href="/view/HomePage"');
    });

    test('multiple links in same paragraph', async () => {
      const wikiDoc = parser.parse('[HomePage] and [WikiDocumentation] pages', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('href="/view/HomePage"');
      expect(html).toContain('href="/view/WikiDocumentation"');
    });
  });

  describe('Escaped Content', () => {
    test('does NOT process links in escaped content', async () => {
      const wikiDoc = parser.parse('[[Links like [HomePage] should not work]]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      // Should contain the literal link syntax
      expect(html).toContain('[HomePage]');
      // Should NOT contain a processed link
      expect(html).not.toContain('href="/view/HomePage"');
    });

    test('processes links outside escaped content but not inside', async () => {
      const wikiDoc = parser.parse(
        '[HomePage] and [[Do not process [TestPage]]]',
        {}
      );

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      // Outside escaped: processed
      expect(html).toContain('href="/view/HomePage"');
      // Inside escaped: NOT processed
      expect(html).toContain('[TestPage]');
      // Only one processed link
      const linkCount = (html.match(/href="\/view\//g) || []).length;
      expect(linkCount).toBe(1);
    });
  });

  describe('Page Name Matching', () => {
    test('handles fuzzy matching for existing pages', async () => {
      // PageNameMatcher should match "HomePage" even with different case
      const wikiDoc = parser.parse('[homepage]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      // Should match HomePage (case-insensitive)
      expect(html).toContain('href="/view/HomePage"');
      expect(html).toContain('wikipage');
    });

    test('creates red link for truly non-existing page', async () => {
      const wikiDoc = parser.parse('[CompletelyNonExistentPage]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('href="/edit/CompletelyNonExistentPage"');
      expect(html).toContain('redlink');
    });
  });

  describe('InterWiki Site Handling', () => {
    test('processes known InterWiki site', async () => {
      const wikiDoc = parser.parse('[JSPWiki Docs|JSPWiki:WikiDocumentation]', {});

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      const html = wikiDoc.toHTML();
      expect(html).toContain('https://jspwiki-wiki.apache.org/Wiki.jsp?page=WikiDocumentation');
      expect(html).toContain('interwiki-jspwiki');
    });

    test('warns on unknown InterWiki site', async () => {
      const wikiDoc = parser.parse('[Unknown|UnknownWiki:Page]', {});

      logger.warn.mockClear();

      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown InterWiki site')
      );
    });
  });

  describe('Performance', () => {
    test('handles many links efficiently', async () => {
      const links = Array(50).fill('[HomePage]').join(' ');
      const wikiDoc = parser.parse(links, {});

      const start = Date.now();
      await handler.processLinks(wikiDoc, { pageName: 'TestPage' });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000); // Should be fast
    });
  });

  describe('Edge Cases', () => {
    test('handles link with empty target', async () => {
      // Parse a document and then remove the data-wiki-link attribute to simulate missing data
      const wikiDoc = parser.parse('[TestLink]', {});

      // Find the link element and remove its data-wiki-link attribute
      const linkElement = wikiDoc.querySelectorAll('a.wiki-link')[0];
      linkElement.removeAttribute('data-wiki-link');

      logger.warn.mockClear();

      await handler.processLinks(wikiDoc, {});

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('missing data-wiki-link attribute')
      );
    });

    test('handles invalid InterWiki format', async () => {
      // Create link with invalid InterWiki format (missing colon)
      const wikiDoc = parser.parse('[InvalidWikiPage]', {});

      // Manually modify to look like InterWiki but with invalid format
      const linkElement = wikiDoc.querySelectorAll('a.wiki-link')[0];
      linkElement.setAttribute('data-wiki-link', 'WikiWithoutColon');

      await handler.processLinks(wikiDoc, {});

      // Should process as internal link (fallback behavior)
      const html = wikiDoc.toHTML();
      expect(html).toContain('redlink'); // Non-existing internal page
    });
  });
});
