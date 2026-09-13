/**
 * %% block form — issue #1368
 *
 * A class alone on its line opens a <div> in JSPWiki, whatever the content.
 * The renderer chose span or div from the content, so a one-line block was a
 * <span>; and every block wrapper (div, table — and fenced code) landed inside
 * a <p>, because its placeholder sat alone on a line that markdown-it made a
 * paragraph. Uses the real `page` markdown profile: the wrapping comes from it.
 */

import MarkupParser from '../MarkupParser';
import { createMarkdownConverter } from '../../rendering/markdownConverter';

class MockEngine {
  managers: Map<string, unknown>;
  constructor() {
    this.managers = new Map([
      ['ConfigurationManager', {
        getProperty: (key: string, defaultValue: unknown) => {
          const cfg: Record<string, unknown> = {
            'ngdpbase.markup.enabled': true,
            'ngdpbase.markup.caching': false,
            'ngdpbase.markup.handlers.plugin.enabled': false,
            'ngdpbase.markup.handlers.wikitag.enabled': false,
            'ngdpbase.markup.handlers.form.enabled': false,
            'ngdpbase.markup.handlers.interwiki.enabled': false,
            'ngdpbase.markup.handlers.linkparser.enabled': false,
            'ngdpbase.filters.enabled': true,
            'ngdpbase.filters.security.enabled': false,
            'ngdpbase.filters.spam.enabled': false,
            'ngdpbase.filters.validation.enabled': false
          };
          return cfg[key] ?? defaultValue;
        },
        isInitialized: () => true
      }],
      ['CacheManager', {
        isInitialized: () => true,
        region: () => ({ get: async () => null, set: async () => {} })
      }],
      ['RenderingManager', { converter: createMarkdownConverter('page') }]
    ]);
  }
  getManager(name: string) { return this.managers.get(name) || null; }
}

const wrapped = /<p>\s*<(div|table|pre)\b/;

describe('%% block form (#1368)', () => {
  let parser: MarkupParser;

  beforeEach(async () => {
    parser = new MarkupParser(new MockEngine());
    await parser.initialize();
  });

  afterEach(async () => {
    await parser.shutdown();
  });

  test('one line of content is a div, with no paragraph inside', async () => {
    const html = await parser.parse('%%warning\nBlock text.\n/%');
    expect(html).toContain('<div class="warning">Block text.</div>');
    expect(html).not.toMatch(wrapped);
  });

  test('text-center on one line is a div, so the alignment applies', async () => {
    expect(await parser.parse('%%text-center\nCentered.\n/%')).toContain('<div class="text-center">Centered.</div>');
  });

  test('markdown on the one line still renders', async () => {
    expect(await parser.parse('%%warning\n**Bold** text\n/%')).toContain('<div class="warning"><strong>Bold</strong> text</div>');
  });

  test('several lines keep their paragraph, and the div is not inside one', async () => {
    const html = await parser.parse('%%warning\nLine one.\nLine two.\n/%');
    expect(html).toMatch(/<div class="warning"><p>Line one\.<br>\s*Line two\.<\/p>\s*<\/div>/);
    expect(html).not.toMatch(wrapped);
  });

  test('a styled table is not inside a paragraph', async () => {
    const html = await parser.parse('%%table-striped\n|| a || b\n| 1 | 2\n/%');
    expect(html).toContain('<table class="table table-striped">');
    expect(html).not.toMatch(wrapped);
  });

  test('paragraphs around a block stay paragraphs', async () => {
    const html = await parser.parse('Before.\n\n%%warning\nBlock text.\n/%\n\nAfter.');
    expect(html).toMatch(/<p>Before\.<\/p>\s*<div class="warning">Block text\.<\/div>\s*<p>After\.<\/p>/);
  });

  test('a block right under a line of text ends that paragraph', async () => {
    const html = await parser.parse('Before.\n%%warning\nBlock text.\n/%\nAfter.');
    expect(html).toMatch(/<p>Before\.<\/p>\s*<div class="warning">Block text\.<\/div>\s*<p>After\.<\/p>/);
    expect(html).not.toMatch(wrapped);
  });

  test('nested blocks are sibling divs, not spans joined by <br>', async () => {
    const html = await parser.parse('%%columns\n%%warning\nOne.\n/%\n%%information\nTwo.\n/%\n/%');
    expect(html).toMatch(/<div class="columns warning">One\.<\/div>\s*<div class="columns information">Two\.<\/div>/);
    expect(html).not.toMatch(wrapped);
  });

  test('inline form stays a span', async () => {
    expect(await parser.parse('text %%warning inline/% text')).toContain('<p>text <span class="warning">inline</span> text</p>');
  });

  test('a fenced code block is not inside a paragraph', async () => {
    const html = await parser.parse('```\ncode\n```');
    expect(html).toContain('<pre>');
    expect(html).not.toMatch(wrapped);
  });

  test('$ sequences in page text are not read as replacement patterns', async () => {
    expect(await parser.parse('%%warning\nPrice $& and $1 and $`\n/%')).toContain('Price $&amp; and $1 and $`');
  });
});
