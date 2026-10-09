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
import { createMarkdownConverter } from '../../rendering/markdownConverter';

// The page profile, the markdown settings real pages use. Without a
// RenderingManager the parser falls back to the `fallback` profile, which is
// not what a reader sees (found by the #1709 suite).
const pageConverter = createMarkdownConverter('page');

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
      if (name === 'RenderingManager') {
        return { converter: pageConverter };
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

  test('renders with the page profile: a single newline is a line break', async () => {
    expect(await render('first\nsecond')).toMatch(/first<br\s*\/?>\s*second/);
  });

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

describe('inline Markdown in a %%-wrapped table cell (#1351)', () => {
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

  test('plain and wiki-bearing cells both get emphasis; HTML stays text', async () => {
    const html = await parser.parseWithDOMExtraction(
      '%%table-striped\n|| A || B ||\n| **bold** <i>x</i> | *it* [HomePage] |\n/%', { pageName: 'TestPage' });

    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>it</em>');
    expect(html).toContain('&lt;i&gt;x&lt;/i&gt;');
    expect(html).toContain('wiki-link');
  });
});

describe('dotted classes in a block-form style block (#1345)', () => {
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

  test('%%size-20.bg-silver opens a block with both classes', async () => {
    const html = await parser.parseWithDOMExtraction('%%size-20.bg-silver\n20% wide\n/%', { pageName: 'TestPage' });

    expect(html).toMatch(/class="size-20 bg-silver"/);
    expect(html).not.toContain('%%size-20');
  });

  test('space-separated and single classes still work', async () => {
    expect(await parser.parseWithDOMExtraction('%%btn btn-sm\nx\n/%', { pageName: 'T' })).toMatch(/class="btn btn-sm"/);
    expect(await parser.parseWithDOMExtraction('%%information\nx\n/%', { pageName: 'T' })).toMatch(/information/);
  });
});

describe('brackets inside a Markdown link\'s text (#1708)', () => {
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

  // Expected HTML from the CommonMark spec (0.31.2, links: balanced brackets in link text).
  test.each([
    ['[a [b] c](https://example.com/x)', '<a href="https://example.com/x">a [b] c</a>'],
    ['[link [foo [bar]]](/uri)', '<a href="/uri">link [foo [bar]]</a>'],
    ['[see [HomePage] here](https://example.com/y)', '<a href="https://example.com/y">see [HomePage] here</a>']
  ])('%s renders as one link', async (input, expected) => {
    const html = await render(input);

    expect(html).toContain(expected);
    expect(html).not.toContain('wiki-link');
  });

  test('an image inside link text stays an image', async () => {
    expect(await render('[![moon](moon.jpg)](/uri)')).toContain('<a href="/uri"><img src="moon.jpg" alt="moon"></a>');
  });

  test('an unbalanced bracket is not link text: the inner link stands (spec example)', async () => {
    expect(await render('[link [bar](/uri)')).toContain('[link <a href="/uri">bar</a>');
  });

  test('a wiki link outside a Markdown link is still a wiki link', async () => {
    const html = await render('[HomePage] and [a [b] c](https://example.com/x)');

    expect(html).toContain('wiki-link');
    expect(html).toContain('<a href="https://example.com/x">a [b] c</a>');
  });

  test('bracket groups not followed by ( are not link text', async () => {
    expect(await render('[HomePage] (a note)')).toContain('wiki-link');
  });
});

describe('markdownLinkTextRanges (#1708)', () => {
  test('finds link text that holds brackets, and nothing else', async () => {
    const { markdownLinkTextRanges } = await import('../LinkParser');

    expect(markdownLinkTextRanges('[a [b] c](u)')).toEqual([[0, 8]]);
    expect(markdownLinkTextRanges('x [a](u) [Main] [b [c]] d')).toEqual([]);
    expect(markdownLinkTextRanges('[a \\[b\\] c](u)')).toEqual([]);
    expect(markdownLinkTextRanges('[link [bar](/uri)')).toEqual([]);
    // NCM's [[ escape wins: [[^1]](#ref-1) keeps rendering as it did.
    expect(markdownLinkTextRanges('[[^1]](#ref-1) and [[a] b](u)')).toEqual([]);
  });
});

describe('reference links (#1491)', () => {
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

  test('full, collapsed and shortcut forms render; definitions render as nothing', async () => {
    const html = await render([
      'Read [the spec][cm] and [markdown-it][] or [CM].',
      '',
      '[cm]: https://spec.commonmark.org "CommonMark spec"',
      '[markdown-it]: https://github.com/markdown-it/markdown-it'
    ].join('\n'));

    expect(html).toContain('<a href="https://spec.commonmark.org" title="CommonMark spec">the spec</a>');
    expect(html).toContain('<a href="https://github.com/markdown-it/markdown-it">markdown-it</a>');
    expect(html).toContain('<a href="https://spec.commonmark.org" title="CommonMark spec">CM</a>');
    expect(html).not.toContain('wiki-link');
    expect(html).not.toContain('[cm]:');
  });

  test('labels match case-insensitively with whitespace collapsed', async () => {
    expect(await render('[Foo  Bar][] here\n\n[foo bar]: /path')).toContain('<a href="/path">Foo  Bar</a>');
  });

  test('an undefined bracket on the same page stays a wiki link', async () => {
    const html = await render('[HomePage] stays.\n\n[cm]: https://spec.commonmark.org');

    expect(html).toContain('wiki-link');
    expect(html).toContain('HomePage');
  });

  test('a page that defines nothing renders as before', async () => {
    expect(await render('[the spec][cm] here')).toContain('wiki-link');
  });

  test('[Term]: value is not a definition unless the value looks like a link', async () => {
    const html = await render('[LOINC Code]: 785-6');

    expect(html).toContain('wiki-link');
    expect(html).toContain(': 785-6');
  });

  test('brackets inside code are untouched', async () => {
    expect(await render('`[cm]` in code\n\n[cm]: https://example.com')).toContain('<code>[cm]</code>');
  });

  test('[x] [cm] with a space is a wiki link and a shortcut reference, not a full reference', async () => {
    const html = await render('[x] [cm] here\n\n[cm]: https://example.com');

    expect(html).toContain('<a href="https://example.com">cm</a>');
    expect(html).toContain('data-target="x"');
  });
});

describe('referenceLinkRanges (#1491)', () => {
  test('marks definitions and uses of defined labels only', async () => {
    const { referenceLinkRanges } = await import('../LinkParser');
    const text = '[a][cm] [Main]\n\n[cm]: https://x.example';

    expect(referenceLinkRanges(text)).toEqual([[16, 19], [0, 6]]);
    expect(referenceLinkRanges('[a][cm]')).toEqual([]);
    expect(referenceLinkRanges('[^1]: https://x.example')).toEqual([]);
  });
});
