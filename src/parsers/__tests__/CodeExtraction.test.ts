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

  test('a [[ escape around a plugin prints the plugin as written, not its placeholder', async () => {
    const html = await render('[[Inline: [{Image src=\'a.png\'}] and `code` here.]');

    expect(html).toContain('[Inline: [{Image src=\'a.png\'}] and `code` here.]');
    expect(html).not.toContain('placeholder');
  });

  test('an indented code block holding a fence is code, not a fence', async () => {
    const html = await render('    ```\n    aaa\n    ```\n');

    expect(html).toContain('<pre><code>```\naaa\n```\n</code></pre>');
    expect(html).not.toContain('placeholder');
  });

  test('an indented block holding a reference definition is code', async () => {
    const html = await render('    [foo]: /url "title"\n\n[foo]\n');

    expect(html).toContain('<pre><code>[foo]: /url "title"\n</code></pre>');
    expect(html).not.toContain('placeholder');
  });

  test('a fence after a quote inside a list item stays in the item', async () => {
    const html = await render('- a\n  > b\n  ```\n  c\n  ```\n- d\n');

    expect(html).toMatch(/<li>a\s*<blockquote>\s*<p>b<\/p>\s*<\/blockquote>\s*<pre><code>c\n<\/code><\/pre>\s*<\/li>\s*<li>d<\/li>/);
    expect(html).not.toContain('placeholder');
  });

  test('a code span inside link brackets leaves no placeholder', async () => {
    const html = await render('[foo`][ref]`\n\n[ref]: /uri\n');

    expect(html).toContain('<p>[foo<code>][ref]</code></p>');
    expect(html).not.toContain('placeholder');
  });

  // Round 2 (PR #2438 review).
  test('a footnote body after a blank line is not lifted as code', async () => {
    const html = await render('Text[^1] here.\n\n[^1]:\n\n    Body after blank.\n');

    expect(html).toContain('Body after blank.');
    expect(html).not.toContain('placeholder');
    expect(html).not.toContain('<pre>');
  });

  test('a footnote body on the next line, or in a second paragraph, renders as on master', async () => {
    const next = await render('Text[^1] here.\n\n[^1]:\n    Body next line.\n');
    const second = await render('Text[^1] here.\n\n[^1]: first\n\n    second paragraph\n');

    expect(next).toContain('Body next line.');
    expect(second).toContain('second paragraph');
    // The second paragraph is markdown-it's own indented code block, as before.
    for (const html of [next, second]) expect(html).not.toContain('placeholder');
    expect(next).not.toContain('<pre>');
  });

  test('a fence indented four spaces right after a quote prints no stray ~~~', async () => {
    const html = await render('> q\n    ```\n    c\n    ```\nafter\n');

    expect(html).not.toContain('~~~');
    expect(html).not.toContain('placeholder');
    expect(html).toContain('after');
  });

  test('a tab-indented block is code, the same as four spaces', async () => {
    const html = await render('para\n\n\t```\n\taaa\n\t```\n');

    expect(html).toContain('<pre><code>```\naaa\n```\n</code></pre>');
    expect(html).not.toContain('placeholder');
  });

  test('CRLF line endings give the same indented block', async () => {
    const html = await render('para\r\n\r\n    ```\r\n    aaa\r\n    ```\r\n');

    expect(html).toContain('<pre><code>```\naaa\n```\n</code></pre>');
    expect(html).not.toContain('placeholder');
  });

  test('an indented line continuing a list item stays in the item, not code', async () => {
    const html = await render('- a\n\n    text\n');

    expect(html).toMatch(/<li>[\s\S]*text[\s\S]*<\/li>/);
    expect(html).not.toContain('<pre>');
    expect(html).not.toContain('placeholder');
  });

  test('brackets do not link across a blank line', async () => {
    const html = await render('[a\n\nb]');

    expect(html).toContain('<p>[a</p>');
    expect(html).toContain('<p>b]</p>');
    expect(html).not.toContain('placeholder');
  });

  test('a footnote with several indented paragraphs renders as one block, as on master', async () => {
    const html = await render('Text[^1] here.\n\n[^1]: first\n\n    second\n\n    third\n\nafter\n');

    expect(html).not.toContain('placeholder');
    expect(html.match(/<pre>/g)).toHaveLength(1);
    expect(html).toContain('second\n\nthird');
  });
});
