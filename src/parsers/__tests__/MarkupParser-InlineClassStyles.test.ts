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
    parser = new MarkupParser(new MockEngine());
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

  test('multiple DOT-separated classes land on one span', async () => {
    const result = await parser.parse('%%feed-badge.feed-badge--green GREEN/%');
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
      '|| Level || Code ||\n| NORMAL | %%feed-badge.feed-badge--green GREEN/% |'
    );
    expect(result).toContain('<span class="feed-badge feed-badge--green">GREEN</span>');
  });

  test('the full #938 aviation-code table renders every badge', async () => {
    const result = await parser.parse([
      '%%table-fit table-bordered table-striped table-hover sortable',
      '|| Level || Aviation Code || Meaning ||',
      '| NORMAL | %%feed-badge.feed-badge--green GREEN/% | typical background |',
      '| ADVISORY | %%feed-badge.feed-badge--yellow YELLOW/% | elevated unrest |',
      '| WARNING | %%feed-badge.feed-badge--red RED/% | eruption imminent |',
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

  test('the two-opener form does not emit an empty span (#938 review)', async () => {
    // `%%a %%b X/%` is not the multi-class syntax. The second `%%` must not be
    // read as A's closer — that produced `<span class="feed-badge"></span>`
    // followed by stray text. The inner run is a well-formed style of its own,
    // so it renders; the unclosed outer stays literal.
    const result = await parser.parse('x %%feed-badge %%feed-badge--green GREEN/% y');
    expect(result).not.toContain('<span class="feed-badge"></span>');
    expect(result).toContain('<span class="feed-badge--green">GREEN</span>');
  });

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
  // ── #944: content must survive intact ─────────────────────────────────────
  //
  // The #939 form accepted space-separated classes inline and greedily ate the
  // content: `%%lead Hello there/%` produced class="lead Hello" with only
  // "there" as the body. Every fixture in the original suite used SINGLE-WORD
  // content, so nothing caught it. These use multi-word content deliberately.

  describe('multi-word content (#944 regression)', () => {
    test('two-word content stays in the body', async () => {
      const result = await parser.parse('%%lead Hello there/%');
      expect(result).toContain('<span class="lead">Hello there</span>');
    });

    test('four-word content stays in the body', async () => {
      const result = await parser.parse('%%lead one two three four/%');
      expect(result).toContain('<span class="lead">one two three four</span>');
    });

    test('content containing words that look like class names is not absorbed', async () => {
      const result = await parser.parse('%%small this small text/%');
      expect(result).toContain('<span class="small">this small text</span>');
    });

    test('punctuated sentence content survives', async () => {
      const result = await parser.parse('%%tip Use the markup, then reload./%');
      expect(result).toContain('<span class="tip">Use the markup, then reload.</span>');
    });

    test('dotted multi-class with multi-word content', async () => {
      const result = await parser.parse('%%btn.btn-info.btn-xs Click me now/%');
      expect(result).toContain('<span class="btn btn-info btn-xs">Click me now</span>');
    });

    test('space-separated classes are NO LONGER treated as classes inline', async () => {
      // Deliberate behaviour change: only the first token is the class.
      const result = await parser.parse('%%feed-badge feed-badge--green GREEN/%');
      expect(result).toContain('<span class="feed-badge">feed-badge--green GREEN</span>');
    });

    test('block form still takes space-separated classes', async () => {
      // Unambiguous there — the class list is the whole line.
      const result = await parser.parse('%%table-fit table-bordered\n|| A ||\n| 1 |\n/%');
      expect(result).toContain('table-fit');
      expect(result).toContain('table-bordered');
    });

    test('empty content still yields a bare classed span (icon idiom)', async () => {
      const result = await parser.parse('%%icon-user /%');
      expect(result).toContain('<span class="icon-user"></span>');
    });
  });
});

describe('code spans are opaque to style extraction (#940/#944)', () => {
  let p: MarkupParser;
  beforeEach(async () => { p = new MarkupParser(new MockEngine()); await p.initialize(); });
  afterEach(async () => { await p.shutdown(); });

  test('a run does NOT close on a /% that lives inside a code span', async () => {
    // The haddock-styles reproducer. Before the fix the run swallowed into the
    // backticks and closed on the inner `/%`, tearing the span apart; the
    // orphaned backtick then paired with a later one and every downstream
    // extraction leaked an unrestored placeholder.
    const result = await p.parse('you can use %%tip Use the `%~%style../%` markup.');
    expect(result).not.toContain('data-jspwiki-placeholder');
    expect(result).toContain('<code>');
  });

  test('two such lines together produce no leaked placeholders', async () => {
    // Minimal cross-line reproducer — neither line leaked in isolation.
    const result = await p.parse(
      'you can use %%tip-a Use the `%~%style../%` markup. \\\n' +
      'And even add or %%tip-b overwriting .header , .footer, etc. /% styles with `%~%add-css`.'
    );
    expect(result).not.toContain('data-jspwiki-placeholder');
  });

  test('a complete style run inside backticks stays literal', async () => {
    const result = await p.parse('x `%%strike Some text here /%` y');
    expect(result).not.toContain('data-jspwiki-placeholder');
    expect(result).toContain('%%strike Some text here /%');
  });

  test('percent signs inside code spans survive verbatim', async () => {
    const result = await p.parse('`100% of %% and /%` done');
    expect(result).toContain('100% of %% and /%');
  });

  test('a real style OUTSIDE backticks still renders alongside one inside', async () => {
    const result = await p.parse('`%%lead nope/%` and %%lead yes please/%');
    expect(result).toContain('<span class="lead">yes please</span>');
    expect(result).toContain('%%lead nope/%');
  });

  // The masking sentinel must never reach the output. The first cut of this fix
  // un-masked only the working buffer, not the text the extractors had already
  // MOVED into ExtractedElement fields, so the live page rendered perfectly —
  // 0 leaks, every code span intact — while emitting 40 raw NUL bytes. Every
  // existing assertion above passed, because a NUL is invisible to `toContain`.
  const SENTINEL = '\u0000';

  test.each([
    ['single-line reproducer', 'you can use %%tip Use the `%~%style../%` markup.'],
    ['cross-line reproducer',
      'you can use %%tip-a Use the `%~%style../%` markup. \\\n' +
      'And even add or %%tip-b overwriting .header , .footer, etc. /% styles with `%~%add-css`.'],
    ['style run wholly inside backticks', 'x `%%strike Some text here /%` y'],
    ['bare percents in a code span', '`100% of %% and /%` done'],
    ['style inside and outside backticks', '`%%lead nope/%` and %%lead yes please/%'],
    ['code span inside a table cell', '| a | `%%lead x/%` | %%lead y here/% |']
  ])('emits no masking sentinel: %s', async (_name, input) => {
    expect(await p.parse(input)).not.toContain(SENTINEL);
  });

  test('percent inside a code span carried into a style body is restored', async () => {
    // The exact path that leaked: the `%` is masked, then the inline-style
    // extractor moves the whole body into an element, so un-masking `sanitized`
    // alone never touches it.
    const result = await p.parse('%%lead see the `50%` rate/%');
    expect(result).not.toContain(SENTINEL);
    expect(result).toContain('50%');
  });
});
