/**
 * MarkupParser inline class styles — issue #938
 *
 * `%%class-name content /%` written INLINE (same line) now renders a
 * `<span class="…">`, matching what the block form already did on its own line.
 *
 * Before #938 the inline extractor (#907) recognised only `%%(css)`, `%%sup`,
 * `%%sub` and `%%strike`; bare class names fell through to the block extractor,
 * which is anchored to a whole line, so an inline run rendered as literal text
 * — everywhere, not just in tables. Table cells were where it was unavoidable,
 * since a cell cannot contain a multi-line block.
 *
 * The block form MUST keep working: the inline extractor runs before
 * extractStyleBlocksWithStack, so these tests guard against an inline match
 * swallowing a block opener's closing `/%`.
 */

import MarkupParser from '../MarkupParser';

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
            'ngdpbase.markup.handlers.attachment.enabled': false,
            'ngdpbase.markup.handlers.linkparser.enabled': false,
            'ngdpbase.markup.filters.enabled': true,
            'ngdpbase.markup.filters.security.enabled': false,
            'ngdpbase.markup.filters.spam.enabled': false,
            'ngdpbase.markup.filters.validation.enabled': false
          };
          return cfg[key] ?? defaultValue;
        },
        isInitialized: () => true
      }],
      ['CacheManager', {
        isInitialized: () => true,
        region: () => ({ get: async () => null, set: async () => {} })
      }],
      ['RenderingManager', { converter: { makeHtml: (s: string) => s } }]
    ]);
  }
  getManager(name: string) { return this.managers.get(name) || null; }
}

describe('MarkupParser inline class styles (#938)', () => {
  let parser: MarkupParser;

  beforeEach(async () => {
    parser = new MarkupParser(new MockEngine() as never);
    await parser.initialize();
  });

  afterEach(async () => {
    await parser.shutdown();
  });

  // ── inline form, outside tables ───────────────────────────────────────────

  test('single class inline renders a classed span', async () => {
    const result = await parser.parse('Some %%feed-badge GREEN/% text');
    expect(result).toContain('<span class="feed-badge">GREEN</span>');
  });

  test('multiple space-separated classes land on one span', async () => {
    const result = await parser.parse('%%feed-badge feed-badge--green GREEN/%');
    expect(result).toContain('<span class="feed-badge feed-badge--green">GREEN</span>');
  });

  test('inline run alone on a line still renders a span, not literal text', async () => {
    const result = await parser.parse('%%feed-badge GREEN/%');
    expect(result).toContain('<span class="feed-badge">GREEN</span>');
    expect(result).not.toContain('%%feed-badge');
  });

  test('%% closer is accepted as well as /%', async () => {
    const result = await parser.parse('x %%feed-badge GREEN%% y');
    expect(result).toContain('<span class="feed-badge">GREEN</span>');
  });

  // ── inline form, inside table cells (the #938 report) ──────────────────────

  test('class span renders inside a table cell', async () => {
    const result = await parser.parse('|| Level || Code ||\n| NORMAL | %%feed-badge GREEN/% |');
    expect(result).toContain('<span class="feed-badge">GREEN</span>');
  });

  test('multi-class span renders inside a table cell', async () => {
    const result = await parser.parse(
      '|| Level || Code ||\n| NORMAL | %%feed-badge feed-badge--green GREEN/% |'
    );
    expect(result).toContain('<span class="feed-badge feed-badge--green">GREEN</span>');
  });

  test('the full #938 aviation-code table renders every badge', async () => {
    const result = await parser.parse([
      '%%table-fit table-bordered table-striped table-hover sortable',
      '|| Level || Aviation Code || Meaning ||',
      '| NORMAL | %%feed-badge feed-badge--green GREEN/% | typical background |',
      '| ADVISORY | %%feed-badge feed-badge--yellow YELLOW/% | elevated unrest |',
      '| WARNING | %%feed-badge feed-badge--red RED/% | eruption imminent |',
      '/%'
    ].join('\n'));
    expect(result).toContain('<span class="feed-badge feed-badge--green">GREEN</span>');
    expect(result).toContain('<span class="feed-badge feed-badge--yellow">YELLOW</span>');
    expect(result).toContain('<span class="feed-badge feed-badge--red">RED</span>');
    // the wrapper classes still reach the table
    expect(result).toContain('table-bordered');
    expect(result).toContain('sortable');
    expect(result).not.toContain('%%feed-badge');
  });

  // ── block form must not regress (the swallow risk) ─────────────────────────

  test('block form on its own lines still renders a classed span', async () => {
    const result = await parser.parse('%%feed-badge\nGREEN\n/%');
    expect(result).toContain('<span class="feed-badge">GREEN</span>');
  });

  test('block opener is not swallowed by the inline extractor', async () => {
    const result = await parser.parse('%%mybox\nline one\nline two\n/%');
    expect(result).toContain('mybox');
    // the closing /% was consumed as the block's close, not left as text
    expect(result).not.toContain('/%');
  });

  test('multi-class block wrapper around a table keeps all classes', async () => {
    const result = await parser.parse([
      '%%table-fit table-bordered',
      '|| A || B ||',
      '| 1 | 2 |',
      '/%'
    ].join('\n'));
    expect(result).toContain('table-fit');
    expect(result).toContain('table-bordered');
    expect(result).not.toContain('%%table-fit');
  });

  test('nested block wrappers still nest', async () => {
    const result = await parser.parse('%%outer\n%%inner\ntext\n/%\n/%');
    expect(result).toContain('outer');
    expect(result).toContain('inner');
    expect(result).not.toContain('%%outer');
  });

  // ── the other inline variants must not regress ─────────────────────────────

  test('%%sup still renders sup, not a class span', async () => {
    const result = await parser.parse('x%%sup 2/%');
    expect(result).toContain('<sup>2</sup>');
    expect(result).not.toContain('<span class="sup"');
  });

  test('%%sub and %%strike still render their own tags', async () => {
    expect(await parser.parse('x%%sub 3/%')).toContain('<sub>3</sub>');
    expect(await parser.parse('%%strike gone/%')).toContain('<del>gone</del>');
  });

  test('%%(css) is still treated as CSS, not as a class name', async () => {
    const result = await parser.parse('%%(color:green) GREEN/%');
    expect(result).toContain('<span');
    expect(result).not.toContain('class="(color:green)"');
  });

  test('%%sup inside a table cell still works alongside class spans', async () => {
    const result = await parser.parse('|| A ||\n| x%%sup 2/% and %%feed-badge Y/% |');
    expect(result).toContain('<sup>2</sup>');
    expect(result).toContain('<span class="feed-badge">Y</span>');
  });

  // ── malformed / edge cases stay inert ─────────────────────────────────────

  test('an unclosed inline run is left as literal text', async () => {
    const result = await parser.parse('Some %%feed-badge GREEN with no close');
    expect(result).toContain('%%feed-badge');
  });

  test('class names cannot inject an attribute or tag', async () => {
    // `"` is outside the [A-Za-z][\w-]* charset, so this cannot match the class
    // pattern at all. The run stays literal text — `onload=` appears as body
    // text, never as an attribute — so assert no element was emitted rather
    // than merely that the substring is absent.
    const result = await parser.parse('%%bad"onload=x GREEN/%');
    expect(result).not.toContain('<span');
    expect(result).not.toContain('class="bad');
  });

  test('a class run cannot carry an event-handler attribute even when well-formed', async () => {
    // `=` is not in the class charset either, so `onload=x` can never become
    // part of the emitted class list.
    const result = await parser.parse('%%feed-badge onload=x GREEN/%');
    expect(result).not.toMatch(/<span[^>]*onload/);
  });
});
