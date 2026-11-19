/**
 * External links through the whole parser (#1492).
 *
 * `[text](https://…)` (CommonMark, the house form) and `[text|https://…|target="_blank"]`
 * (the stored JSPWiki form) must give a link with the same class, target and
 * rel; and a stored pipe-form link must render exactly as it did before #1492.
 * Uses the real `page` markdown profile.
 */

import MarkupParser from '../MarkupParser';
import { createMarkdownConverter } from '../../rendering/markdownConverter';
import { normalizeExistingPageToNcm } from '../../converters/ncm/index';

const engine = {
  getManager: (name: string) => {
    if (name === 'ConfigurationManager') return { getProperty: (_key: string, defaultValue: unknown) => defaultValue };
    if (name === 'PageManager') return { getAllPages: async () => ['HomePage'] };
    if (name === 'RenderingManager') return { converter: createMarkdownConverter('page') };
    return null;
  }
};

async function render(content: string): Promise<string> {
  const parser = new MarkupParser(engine);
  await parser.initialize();
  try {
    return await parser.parse(content, { pageName: 'HomePage' });
  } finally {
    await parser.shutdown();
  }
}

/** The attributes of the one `<a>` in `html`, by name. */
function attrsOf(html: string): Record<string, string> {
  const tag = html.match(/<a\b([^>]*)>/);
  if (!tag) throw new Error(`no <a> in ${html}`);
  return Object.fromEntries([...tag[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

describe('external links through the parser (#1492)', () => {
  const url = 'https://example.com/a/b?x=1';

  test('CommonMark and the pipe form give the same href, class, target and rel', async () => {
    const commonmark = attrsOf(await render(`[Ext](${url})`));
    const pipe = attrsOf(await render(`[Ext|${url}|target="_blank"]`));

    for (const name of ['href', 'class', 'target', 'rel']) {
      expect(commonmark[name], name).toBe(pipe[name]);
    }
    expect(commonmark.class).toBe('wiki-link external-link');
    expect(commonmark.target).toBe('_blank');
    expect(commonmark.rel).toBe('noopener noreferrer');
  });

  test('a stored pipe-form link renders exactly as it did before', async () => {
    expect(await render('[t|https://x.com/a?b=1|target="_blank"]')).toBe(
      '<p><a data-target="https://x.com/a?b=1" data-link-type="external" rel="noopener noreferrer" ' +
      'target="_blank" href="https://x.com/a?b=1" class="wiki-link external-link">t</a></p>\n'
    );
    expect(await render('[t|https://x.com]')).toBe(
      '<p><a data-target="https://x.com" data-link-type="external" rel="noopener noreferrer" ' +
      'target="_blank" href="https://x.com" class="wiki-link external-link">t</a></p>\n'
    );
  });

  test('an internal wiki link and a CommonMark relative link are not external', async () => {
    const wiki = attrsOf(await render('[Home|HomePage]'));
    expect(wiki.target).toBeUndefined();
    expect(wiki.class).toContain('wikipage');
    expect(await render('[r](/view/HomePage)')).toBe('<p><a href="/view/HomePage">r</a></p>\n');
  });
});

// A GFM table is converted to the JSPWiki `||`/`|` form on import. Its cells are
// resolved by appendWikiNodes, not by markdown-it, so a CommonMark link kept as
// written must still become a link there.
describe('external links in an imported table (#1492)', () => {
  const external = 'class="wiki-link external-link" target="_blank" rel="noopener noreferrer"';
  const cell = (html: string, n: number): string => html.match(/<td\b[^>]*>([\s\S]*?)<\/td>/g)?.[n] ?? '';

  test('a cell holding only a CommonMark link renders a link', async () => {
    const converted = normalizeExistingPageToNcm('| Name | Link |\n|---|---|\n| A | [site](https://x.com) |\n').content;
    expect(converted).toContain('[site](https://x.com)');
    const html = await render(converted);
    expect(cell(html, 1)).toContain(`<a href="https://x.com" ${external}>site</a>`);
    expect(html).not.toContain('[site](https://x.com)');
  });

  test('a cell with bold text and a link renders both', async () => {
    const html = await render('%%table-striped\n|| A ||\n|**b** [s](https://x.com)|\n/%');
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain(`<a href="https://x.com" ${external}>s</a>`);
  });

  test('a cell with a link and a wiki link renders both', async () => {
    const html = await render('%%table-striped\n|| A ||\n|[s](https://x.com) [HomePage]|\n/%');
    expect(html).toContain(`<a href="https://x.com" ${external}>s</a>`);
    expect(html).toContain('HomePage');
  });
});
