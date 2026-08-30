/**
 * Line breaks inside table cells — issue #1038
 *
 * A cell supported no line break at all, in any syntax. Both `\\` and a raw
 * `<br>` came out as the visible text `&lt;br&gt;`.
 *
 * That became blocking rather than cosmetic once #1037 shipped: a save whose
 * source contains a raw `<br>` is refused, and the refusal message tells the
 * author to use `\\` — which did not work in a cell either. Four pages could
 * not be saved by any means.
 *
 * Two independent causes, both covered here:
 *
 *   1. populateCell had a `<br>` branch, but only on the fast path for cells
 *      with NO wiki syntax. A cell containing a link went to appendWikiNodes,
 *      which emits leftover content as TEXT nodes — escaped by definition.
 *      Every reported page had links in its cells, which is exactly why the
 *      branch looked correct and never fired.
 *
 *   2. `\\` never became a <br> inside a %%style table at all: style content
 *      is extracted at Step 0.5, before the markup phase performs that rewrite.
 *
 * The fix splits on both syntaxes BEFORE choosing a path — and must not split
 * inside a code span, which the first cut got wrong and regressed a real page.
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
      ['RenderingManager', { converter: { makeHtml: (s: string) => s } }]
    ]);
  }
  getManager(name: string) { return this.managers.get(name) || null; }
}

/** Count real <br> elements, ignoring any that appear as escaped text. */
const breaks = (html: string): number => (html.match(/<br\s*\/?>/gi) || []).length;

describe('table cell line breaks (#1038)', () => {
  let parser: MarkupParser;

  beforeEach(async () => {
    parser = new MarkupParser(new MockEngine());
    await parser.initialize();
  });

  afterEach(async () => {
    await parser.shutdown();
  });

  // ── plain cells ───────────────────────────────────────────────────────────

  test('NCM `\\\\` produces a real break, not literal backslashes', async () => {
    const result = await parser.parse('|| A ||\n| one\\\\two |');

    expect(breaks(result)).toBe(1);
    expect(result).not.toContain('one\\\\two');
  });

  test('a raw <br> produces a real break, not escaped text', async () => {
    // Reading an existing page must keep working: no-raw-br is enforced at
    // save, so pages written before #1037 still contain these.
    const result = await parser.parse('|| A ||\n| one<br>two |');

    expect(breaks(result)).toBe(1);
    expect(result).not.toContain('&lt;br&gt;');
  });

  // ── cells containing wiki syntax: the actual reported defect ──────────────

  test('a break works in a cell that also contains a link', async () => {
    // THE bug. The <br> branch existed but only ran on the no-wiki-syntax
    // path, and every affected page had links in its cells.
    const result = await parser.parse('|| A ||\n| [Welcome]\\\\second line |');

    expect(breaks(result)).toBe(1);
    expect(result).not.toContain('&lt;br&gt;');
  });

  test('a break works in a cell that also contains a code span', async () => {
    const result = await parser.parse('|| A ||\n| `code`\\\\second line |');

    expect(breaks(result)).toBe(1);
  });

  // ── inside a %%style block: the second, independent cause ─────────────────

  test('`\\\\` works inside a %%style table, where it never had', async () => {
    // Style content is extracted before the markup phase rewrites `\\`, so the
    // cell used to receive literal backslashes and render them.
    const result = await parser.parse('%%table-striped\n|| A ||\n| one\\\\two |\n/%');

    expect(breaks(result)).toBe(1);
    expect(result).not.toContain('one\\\\two');
  });

  test('a raw <br> works inside a %%style table too', async () => {
    const result = await parser.parse('%%table-striped\n|| A ||\n| one<br>two |\n/%');

    expect(breaks(result)).toBe(1);
    expect(result).not.toContain('&lt;br&gt;');
  });

  // ── code spans are literals, even here ────────────────────────────────────
  //
  // These MUST use %%style tables. A plain markdown table reaches
  // JSPWikiPreprocessor, where inline code is placeholder-extracted upstream
  // and never arrives at populateCell as backticks — so a plain-table version
  // of these passes no matter what populateCell does, and proves nothing. A
  // probe written that way reported the protection as redundant; the reported
  // page then rendered literal backticks around a break.

  test('`\\\\` inside backticks is shown as code, not turned into a break', async () => {
    // Regression guard. `Using Current Time Plugin` documents SimpleDateFormat,
    // and its "escape for text" row carries `\\` as the example value.
    const result = await parser.parse('%%table-striped\n|| A || B ||\n| escape | `\\\\` |\n/%');

    expect(breaks(result)).toBe(0);
    expect(result).toContain('<code>');
  });

  test('a <br> inside backticks is shown as code, not turned into a break', async () => {
    const result = await parser.parse('%%table-striped\n|| A || B ||\n| tag | `<br>` |\n/%');

    expect(breaks(result)).toBe(0);
    expect(result).toContain('<code>');
  });

  test('the span survives WHOLE, so it is still a code span downstream', async () => {
    // Splitting `\\` out of `` `\\` `` leaves two lone backticks, which are no
    // longer a span by the time the wiki/plain decision runs — the cell then
    // renders literal backticks AROUND a break, worse than not fixing it.
    const result = await parser.parse('%%table-striped\n|| A || B ||\n| escape | `\\\\` |\n/%');

    expect(result).not.toContain('`');
  });

  test('a break OUTSIDE the span still splits when the cell also has a span', async () => {
    // Protecting code must not disable the feature for the rest of the cell.
    const result = await parser.parse('%%table-striped\n|| A ||\n| `\\\\` is an escape\\\\next line |\n/%');

    expect(breaks(result)).toBe(1);
  });

  // ── cells stay inert ──────────────────────────────────────────────────────

  test('splitting a cell does not let markup through', async () => {
    // The fix inserts real <br> elements; it must not make a cell a place
    // where other tags start working.
    const result = await parser.parse('|| A ||\n| one\\\\<script>alert(1)</script> |');

    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  test('angle brackets in a cell still escape', async () => {
    const result = await parser.parse('|| A ||\n| a < b > c |');

    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });
});
