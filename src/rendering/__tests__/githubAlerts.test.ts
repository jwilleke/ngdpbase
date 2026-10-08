/**
 * GitHub alerts render in GitHub's own shape (#1493), through the whole page
 * pipeline: the wiki link scanner must step aside for the marker, or it
 * becomes a red link to a page named "!NOTE".
 */

import MarkupParser from '../../parsers/MarkupParser';
import DOMVariableHandler from '../../parsers/dom/handlers/DOMVariableHandler';
import DOMPluginHandler from '../../parsers/dom/handlers/DOMPluginHandler';
import DOMLinkHandler from '../../parsers/dom/handlers/DOMLinkHandler';
import { wikiLinkPattern } from '../../parsers/LinkParser';
import { createMarkdownConverter } from '../markdownConverter';

// The page profile, with no HTML policy configured.
const pageConverter = createMarkdownConverter('page');

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

describe('GitHub alerts (#1493)', () => {
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

  test.each([
    ['NOTE', 'note', 'Note', 'octicon-info'],
    ['TIP', 'tip', 'Tip', 'octicon-light-bulb'],
    ['IMPORTANT', 'important', 'Important', 'octicon-report'],
    ['WARNING', 'warning', 'Warning', 'octicon-alert'],
    ['CAUTION', 'caution', 'Caution', 'octicon-stop']
  ])('> [!%s] renders as a %s alert with its title and icon', async (marker, kind, title, icon) => {
    const html = await render(`> [!${marker}]\n> Read this first.`);

    expect(html).toContain(`<div class="markdown-alert markdown-alert-${kind}">`);
    expect(html).toMatch(new RegExp(`<p class="markdown-alert-title"><svg class="octicon ${icon}"[^>]*>.*</svg>${title}</p>`));
    expect(html).toContain('Read this first.');
    expect(html).not.toContain('wiki-link');
    expect(html).not.toContain('<blockquote>');
  });

  test('the text may follow in a later paragraph of the quote', async () => {
    const html = await render('> [!TIP]\n>\n> A later paragraph.');

    expect(html).toContain('<div class="markdown-alert markdown-alert-tip">');
    expect(html).toContain('<p>A later paragraph.</p>');
    expect(html).not.toContain('<p></p>');
  });

  test('a marker with text after it on the same line is not an alert (GitHub\'s rule)', async () => {
    expect(await render('> [!NOTE] Text on the same line')).not.toContain('markdown-alert');
  });

  test('same-line text is never written into the page as HTML', async () => {
    const html = await render('> [!NOTE] <img src=x onerror=alert(1)>\n> body');

    expect(html).not.toContain('markdown-alert');
    expect(html).not.toContain('onerror');
  });

  test('a marker outside a quote is not an alert', async () => {
    expect(await render('[!NOTE]\nText')).not.toContain('markdown-alert');
  });

  test('a lowercase marker is not an alert, and renders as it always has', async () => {
    const html = await render('> [!note]\n> Text');

    expect(html).not.toContain('markdown-alert');
    expect(html).toContain('<blockquote>');
  });

  test('the shared link pattern does not see the marker as a link (link graph, rename)', () => {
    const targets = (text: string) => [...text.matchAll(wikiLinkPattern())].map((m) => m[1]);

    expect(targets('> [!WARNING]\n> careful')).toEqual([]);
    expect(targets('> [!WARNING] same line')).toEqual(['!WARNING']);
    expect(targets('see [Main]')).toEqual(['Main']);
  });
});
