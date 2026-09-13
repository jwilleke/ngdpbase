/**
 * NCM's `\\` line break — issue #1370
 *
 * `\\` is NCM (the renderer owns it), so the JSPWiki import now leaves it as
 * typed. Two renderer gaps showed once it did:
 *
 *   1. `\\` at the end of a line gave TWO breaks. Step 0.6 wrote `<br>`, and
 *      the page profile's `breaks: true` made the newline a second one — on
 *      186 stored jimstest pages. JSPWiki gives one.
 *   2. `\\` inside a one-line `%%` run stayed literal: inline runs are lifted
 *      out before Step 0.6 rewrites the document.
 *
 * Uses the real `page` markdown profile: the double break only exists with
 * `breaks: true`.
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

const breaks = (html: string): number => (html.match(/<br\b[^>]*>/gi) || []).length;

describe('NCM \\\\ line breaks (#1370)', () => {
  let parser: MarkupParser;

  beforeEach(async () => {
    parser = new MarkupParser(new MockEngine());
    await parser.initialize();
  });

  afterEach(async () => {
    await parser.shutdown();
  });

  test('mid-line `\\\\` is one break', async () => {
    const html = await parser.parse('Line one\\\\Line two');
    expect(breaks(html)).toBe(1);
    expect(html).not.toContain('\\');
  });

  test('`\\\\` ending a line is one break, not two', async () => {
    const html = await parser.parse('Line one\\\\\nLine two');
    expect(breaks(html)).toBe(1);
    expect(html).toContain('Line one');
    expect(html).toContain('Line two');
    expect(html).not.toContain('\\');
  });

  test('trailing spaces after `\\\\` do not bring the second break back', async () => {
    expect(breaks(await parser.parse('Line one\\\\  \nLine two'))).toBe(1);
  });

  test('`\\\\\\` still breaks and clears floats', async () => {
    const html = await parser.parse('Line one \\\\\\ after flush');
    expect(html).toContain('<br class="wiki-clearfix">');
  });

  test('`\\\\` inside a one-line %% run is a break, not literal text', async () => {
    const html = await parser.parse('use %%tip-x Use the markup. \\\\These are classes /% :');
    expect(html).toMatch(/<span class="tip-x">Use the markup\. <br>These are classes<\/span>/);
    expect(html).not.toContain('\\\\');
  });

  test('`\\\\` inside inline code stays code', async () => {
    const html = await parser.parse('Use `a\\\\b` here');
    expect(html).toContain('<code>a\\\\b</code>');
    expect(breaks(html)).toBe(0);
  });

  test('`\\\\` ending a line inside a %% block is one break', async () => {
    const html = await parser.parse('%%information\nLine one\\\\\nLine two\n/%');
    expect(breaks(html)).toBe(1);
  });
});
