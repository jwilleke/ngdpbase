/**
 * Code spans and fences are lifted out before markdown-it parses blocks
 * (#1726), so they must follow CommonMark's own rules or the internal
 * placeholder ends up in the page. Rendered with the page profile.
 */

import MarkupParser from '../MarkupParser';
import DOMVariableHandler from '../dom/handlers/DOMVariableHandler';
import DOMPluginHandler from '../dom/handlers/DOMPluginHandler';
import DOMLinkHandler from '../dom/handlers/DOMLinkHandler';
import { createMarkdownConverter } from '../../rendering/markdownConverter';

// The page profile, with no HTML policy configured.
const pageConverter = createMarkdownConverter('page');

// The engine the parser needs for a page with no variables, plugins or pages.
const createMockEngine = () => ({
  getManager: vi.fn((name: string) => {
    if (name === 'VariableManager') return { variableHandlers: new Map() };
    if (name === 'PluginManager') return { execute: vi.fn(async () => '') };
    if (name === 'ConfigurationManager') return { getProperty: (_key: string, fallback: unknown) => fallback };
    if (name === 'PageManager') return { getAllPages: async () => [] };
    if (name === 'RenderingManager') return { converter: pageConverter };
    return null;
  })
});

describe('code extraction follows CommonMark (#1726)', () => {
  let parser;

  beforeAll(async () => {
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

  test('an escaped backtick opens no code span, and no placeholder leaks', async () => {
    const html = await render('\\`not code`');

    expect(html).toContain('`not code`');
    expect(html).not.toContain('<code>');
    expect(html).not.toContain('placeholder');
  });

  test('a ~~~ fence holding backticks is one code block', async () => {
    const html = await render('~~~\naaa\n```\n~~~');

    expect(html).toContain('<pre><code>aaa\n```\n</code></pre>');
    expect(html).not.toContain('placeholder');
  });

  test('a fence opened on a list item\'s marker line stays in the item', async () => {
    const html = await render('1. ```\n   foo\n   ```\n\n   bar');

    expect(html).toMatch(/<ol>\s*<li>\s*<pre><code>foo\n<\/code><\/pre>/);
    expect(html).toContain('<p>bar</p>');
    expect(html).not.toContain('placeholder');
  });

  test('a fence closes only on a run at least as long as its opener', async () => {
    expect(await render('````\naaa\n```\n``````')).toContain('<pre><code>aaa\n```\n</code></pre>');
  });

  test('line endings in a code span become spaces', async () => {
    expect(await render('``\nfoo\nbar  \nbaz\n``')).toContain('<code>foo bar   baz</code>');
  });

  test('a code span does not cross into a new list item or table row', async () => {
    expect(await render('- `one\n- two`')).not.toContain('<code>');
    expect(await render('| `a | b |\n| c` | d |')).not.toMatch(/<code>[^<]*\n/);
  });

  test('an autolink is taken before a backtick inside it', async () => {
    expect(await render('<https://foo.bar.`baz>`')).toContain('<a href="https://foo.bar.%60baz">');
  });
});
