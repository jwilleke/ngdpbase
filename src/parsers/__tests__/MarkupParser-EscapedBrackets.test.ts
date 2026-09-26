/**
 * A backslash-escaped bracket is literal text (#1476).
 *
 * CommonMark: `\\[` is a literal `[`. The wiki extraction used to take the
 * bracket anyway and leave the backslash in front of its placeholder, which
 * markdown-it then read as an escaped `<` — so the page showed the internal
 * `<span data-jspwiki-placeholder=…>` markup. A bracket preceded by an odd
 * number of backslashes is now left for markdown-it; an even number (an
 * escaped backslash) still starts a wiki link.
 */

import MarkupParser from '../MarkupParser';
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

describe('escaped brackets (#1476)', () => {
  let parser;

  beforeEach(async () => {
    const engine = createMockEngine();
    parser = new MarkupParser(engine);
    parser.domVariableHandler = new DOMVariableHandler(engine);
    await parser.domVariableHandler.initialize();
    parser.domPluginHandler = new DOMPluginHandler(engine);
    await parser.domPluginHandler.initialize();
    parser.domLinkHandler = new DOMLinkHandler(engine);
    await parser.domLinkHandler.initialize();
  });

  const render = (content: string): Promise<string> => parser.parseWithDOMExtraction(content, { pageName: 'TestPage' });

  test('\\[text\\] is the literal [text], and no placeholder leaks', async () => {
    const html = await render('Say \\[not a link\\] here.');

    expect(html).toContain('[not a link]');
    expect(html).not.toContain('placeholder');
    expect(html).not.toContain('wiki-link');
  });

  test('an escaped variable or plugin stays literal too', async () => {
    const html = await render('\\[{$username}] and \\[{TableOfContents}]');

    expect(html).toContain('[{$username}]');
    expect(html).toContain('[{TableOfContents}]');
    expect(html).not.toContain('placeholder');
    expect(html).not.toContain('JohnDoe');
    expect(html).not.toContain('class="toc"');
  });

  test('an escaped backslash before a bracket still leaves a working link', async () => {
    const html = await render('Path \\\\[HomePage] here');

    expect(html).toContain('wiki-link');
    expect(html).not.toContain('placeholder');
  });

  test('an ordinary link is unchanged', async () => {
    const html = await render('Visit [HomePage] now');

    expect(html).toContain('wiki-link');
  });
});

describe('the shared wiki link pattern honours the escape (#1480)', () => {
  // The renderer's link pass (LinkParserHandler), the link graph and the
  // rename rewriter all read links through this one pattern.
  test('an escaped bracket is not a link; an escaped backslash before one is', async () => {
    const { wikiLinkPattern } = await import('../LinkParser');
    const targets = (text: string) => [...text.matchAll(wikiLinkPattern())].map(m => m[1]);

    expect(targets('Say \\[not a link\\] here')).toEqual([]);
    expect(targets('Path \\\\[Main] here')).toEqual(['Main']);
    expect(targets('Visit [Main] and [Help|Docs]')).toEqual(['Main', 'Help']);
  });
});

describe('task lists (#1476 — operator: supported)', () => {
  test('[ ] and [x] after a list marker are checkboxes, not links — in the shared pattern', async () => {
    const { wikiLinkPattern } = await import('../LinkParser');
    const targets = (text: string) => [...text.matchAll(wikiLinkPattern())].map(m => m[1]);

    expect(targets('- [ ] todo\n- [x] done\n* [X] also\n1. [ ] numbered')).toEqual([]);
    // Not a task marker: a link to a page named "x" mid-line, or a bracket with no space after.
    expect(targets('see [x] here')).toEqual(['x']);
    expect(targets('- [Main] is a link in a bullet')).toEqual(['Main']);
  });
});

describe('task lists render as checkboxes (#1476)', () => {
  let parser;
  beforeEach(async () => {
    const engine = createMockEngine();
    parser = new MarkupParser(engine);
    parser.domVariableHandler = new DOMVariableHandler(engine);
    await parser.domVariableHandler.initialize();
    parser.domPluginHandler = new DOMPluginHandler(engine);
    await parser.domPluginHandler.initialize();
    parser.domLinkHandler = new DOMLinkHandler(engine);
    await parser.domLinkHandler.initialize();
  });

  test('neither marker becomes a link or a placeholder', async () => {
    const html = await parser.parseWithDOMExtraction('- [ ] todo\n- [x] done', { pageName: 'TestPage' });

    expect(html).not.toContain('wiki-link');
    expect(html).not.toContain('placeholder');
    expect(html).not.toContain('/edit/');
  });
});
