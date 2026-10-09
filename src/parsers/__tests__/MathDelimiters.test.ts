/**
 * LaTeX math delimiters in a page (#1742).
 *
 * Pages do not typeset math: no markdown-it math plugin is configured and
 * KaTeX is not a runtime dependency (the `katex` entry in package.json is an
 * override for a dev tool's copy). These tests pin what each delimiter renders
 * to today, so adding math rendering is a deliberate change that has to update
 * them, and so a dollar amount in ordinary text can never silently turn into
 * math.
 *
 * Rendered through the real parser with the `page` profile, the one pages and
 * the editor preview use (the RenderingManager mock carries the page
 * converter, as in CommonMarkSpec.test.ts), and once more with no
 * RenderingManager, which is the `fallback` profile.
 */

import MarkupParser from '../MarkupParser';
import DOMVariableHandler from '../dom/handlers/DOMVariableHandler';
import DOMPluginHandler from '../dom/handlers/DOMPluginHandler';
import DOMLinkHandler from '../dom/handlers/DOMLinkHandler';
import { createMarkdownConverter } from '../../rendering/markdownConverter';

const pageConverter = createMarkdownConverter('page');

const createMockEngine = (withRenderingManager: boolean) => ({
  getManager: vi.fn((name: string) => {
    if (name === 'VariableManager') return { variableHandlers: new Map() };
    if (name === 'PluginManager') return { execute: vi.fn(async () => '') };
    if (name === 'ConfigurationManager') return { getProperty: (_key: string, fallback: unknown) => fallback };
    if (name === 'PageManager') return { getAllPages: async () => [] };
    if (name === 'RenderingManager') return withRenderingManager ? { converter: pageConverter } : null;
    return null;
  })
});

async function createParser(withRenderingManager: boolean): Promise<MarkupParser> {
  const engine = createMockEngine(withRenderingManager);
  const parser = new MarkupParser(engine);
  parser.domVariableHandler = new DOMVariableHandler(engine);
  await parser.domVariableHandler.initialize();
  parser.domPluginHandler = new DOMPluginHandler(engine);
  await parser.domPluginHandler.initialize();
  parser.domLinkHandler = new DOMLinkHandler(engine);
  await parser.domLinkHandler.initialize();
  return parser;
}

describe('LaTeX math delimiters (#1742): not typeset', () => {
  let page: MarkupParser;
  let fallback: MarkupParser;

  beforeAll(async () => {
    page = await createParser(true);
    fallback = await createParser(false);
  });

  const renderPage = (s: string): Promise<string> => page.parseWithDOMExtraction(s, { pageName: 'TestPage' });
  const renderFallback = (s: string): Promise<string> => fallback.parseWithDOMExtraction(s, { pageName: 'TestPage' });

  // Same output on both profiles: [source, rendered].
  const bothProfiles: Array<[string, string, string]> = [
    ['inline $…$ stays as text', 'Inline $x^2 + y^2 = z^2$ here.', '<p>Inline $x^2 + y^2 = z^2$ here.</p>\n'],
    ['inline \\(…\\) loses its backslashes', 'Inline \\(x^2 + y^2\\) here.', '<p>Inline (x^2 + y^2) here.</p>\n'],
    ['display $$…$$ on one line stays as text', '$$E = mc^2$$', '<p>$$E = mc^2$$</p>\n'],
    ['display \\[…\\] on one line loses its backslashes', '\\[x\\]', '<p>[x]</p>\n'],
    ['invalid TeX is plain text, not an error', '$\\frac{1}{$', '<p>$\\frac{1}{$</p>\n'],
    ['dollar amounts are ordinary text', 'It cost $5 and $10.', '<p>It cost $5 and $10.</p>\n'],
    ['escaped \\$ is a literal dollar', 'Price \\$5 and \\$10.', '<p>Price $5 and $10.</p>\n'],
    ['a code span keeps TeX verbatim', '`$x^2$` in code', '<p><code>$x^2$</code> in code</p>\n']
  ];

  test.each(bothProfiles)('%s', async (_name, source, expected) => {
    expect(await renderPage(source)).toBe(expected);
    expect(await renderFallback(source)).toBe(expected);
  });

  test('display $$…$$ over several lines: line breaks on the page profile, text on both', async () => {
    const source = '$$\nE = mc^2\n$$';
    expect(await renderPage(source)).toBe('<p>$$<br>\nE = mc^2<br>\n$$</p>\n');
    expect(await renderFallback(source)).toBe('<p>$$\nE = mc^2\n$$</p>\n');
  });

  test('display \\[…\\] over several lines: the backslashes go, TeX commands stay', async () => {
    const source = '\\[\n\\int_0^1 x\\,dx\n\\]';
    expect(await renderPage(source)).toBe('<p>[<br>\n\\int_0^1 x,dx<br>\n]</p>\n');
    expect(await renderFallback(source)).toBe('<p>[\n\\int_0^1 x,dx\n]</p>\n');
  });

  test('a page renders no KaTeX markup', async () => {
    const html = await renderPage('$a$ and $$b$$ and \\(c\\) and \\[d\\]');
    expect(html).not.toMatch(/katex|<math/i);
  });
});
