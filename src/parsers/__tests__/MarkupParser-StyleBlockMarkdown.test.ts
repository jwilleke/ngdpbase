/**
 * Markdown inside %%style blocks — issue #1039
 *
 * Style-block content is lifted out at Step 0.5, before Showdown runs on the
 * document, and was then handed to appendWikiNodes — which resolves wiki syntax
 * and emits everything else as text nodes. So markdown inside a block reached
 * the reader as literal source: `## Introduction` showed its own hashes and
 * `**bold**` its own asterisks, while the identical markup one line outside the
 * block rendered normally. 12 pages on jimstest were affected.
 *
 * Raw HTML appeared to work in there, which is why nobody looked: a block
 * containing a NESTED block takes the `innerHTML = content` path, so its markup
 * passes straight through. A plain block escapes the same tag. That accident is
 * how the one raw `<br>` #1038's migration could not convert came to exist.
 *
 * These tests use a REAL Showdown converter configured like RenderingManager's.
 * A stub `makeHtml: s => s` would let every assertion here pass or fail for the
 * wrong reason — it is exactly what made an earlier probe report the markdown
 * path as working when it was not running at all.
 */

import showdown from 'showdown';
import MarkupParser from '../MarkupParser';

const converter = new showdown.Converter({
  tables: true,
  strikethrough: true,
  tasklists: true,
  simpleLineBreaks: true,
  openLinksInNewWindow: false,
  backslashEscapesHTMLTags: true,
  disableForced4SpacesIndentedSublists: true,
  literalMidWordUnderscores: true,
  ghCodeBlocks: true,
  ghHeaderIds: true
});

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
      ['RenderingManager', { converter }]
    ]);
  }
  getManager(name: string) { return this.managers.get(name) || null; }
}

describe('markdown inside %%style blocks (#1039)', () => {
  let parser: MarkupParser;

  beforeEach(async () => {
    parser = new MarkupParser(new MockEngine());
    await parser.initialize();
  });

  afterEach(async () => {
    await parser.shutdown();
  });

  // ── the reported defect ───────────────────────────────────────────────────

  test('a heading inside a block renders as a heading', async () => {
    const result = await parser.parse('%%information\n## Inside heading\n\ntext\n/%');

    expect(result).toMatch(/<h2[^>]*>Inside heading<\/h2>/);
    expect(result).not.toContain('## Inside heading');
  });

  test('bold and emphasis render', async () => {
    const result = await parser.parse('%%information\nSome **bold** and *em* text.\n\nmore\n/%');

    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>em</em>');
  });

  test('a list renders as a list', async () => {
    const result = await parser.parse('%%information\n- one\n- two\n\ntail\n/%');

    expect(result).toContain('<ul>');
    expect(result).toContain('<li>one</li>');
  });

  test('the same markup one line OUTSIDE the block already worked — parity is the point', async () => {
    const inside = await parser.parse('%%information\n## Heading\n\ntext\n/%');
    const outside = await parser.parse('## Heading\n\ntext');

    expect(inside).toMatch(/<h2[^>]*>Heading<\/h2>/);
    expect(outside).toMatch(/<h2[^>]*>Heading<\/h2>/);
  });

  test("NCM's line break works inside a block", async () => {
    const result = await parser.parse('%%information\nline one\\\\line two\n\ntail\n/%');

    expect(result).toMatch(/<br\s*\/?>/);
    expect(result).not.toContain('\\\\');
  });

  // ── what must NOT change ──────────────────────────────────────────────────

  test('wiki links inside a block still resolve to links, not text', async () => {
    // The markdown pass runs over a scaffold in which each wiki match is a slot
    // span; the resolved nodes are swapped back afterwards. If that broke, links
    // inside styled blocks would silently degrade to literal `[Welcome]`.
    const result = await parser.parse('%%information\nSee [Welcome] for more.\n\ntail\n/%');

    expect(result).toContain('<a');
    expect(result).not.toContain('[Welcome]');
  });

  test('a list item containing a link stays ONE list item', async () => {
    // Converting each text run between wiki matches separately would cut the
    // list in half — a one-item list, a stray fragment, then another list.
    const result = await parser.parse('%%information\n- see [Welcome] now\n- second\n\ntail\n/%');

    expect((result.match(/<ul>/g) || []).length).toBe(1);
    expect((result.match(/<li>/g) || []).length).toBe(2);
  });

  test('raw HTML in a block is still inert', async () => {
    // Text is escaped before Showdown sees it, so this grants markdown WITHOUT
    // granting embedded HTML — which is the direction #1037 set.
    const result = await parser.parse('%%information\n<script>alert(1)</script>\n\ntail\n/%');

    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  test('inline (span) blocks are left alone — no <p> inside a span', async () => {
    const result = await parser.parse('Some %%feed-badge GREEN/% text');

    expect(result).toContain('<span class="feed-badge">GREEN</span>');
    expect(result).not.toMatch(/<span class="feed-badge"><p>/);
  });

  // ── nested blocks: markdown WITHOUT tightening ────────────────────────────

  test('markdown works inside a NESTED block too', async () => {
    // `Filtered Tables` — the page that prompted the issue — is exactly this
    // shape: %%tabbedSection wrapping %%tab-* children. That takes the
    // innerHTML path, so fixing only plain blocks left the reported page still
    // showing `## Usage`.
    const result = await parser.parse('%%tabbedSection\n%%tab-Usage\n## Usage\n\ntext\n/%\n/%');

    expect(result).toMatch(/<h2[^>]*>Usage<\/h2>/);
    expect(result).not.toContain('## Usage');
  });

  test('raw HTML in a nested block still passes through', async () => {
    // This path has ALWAYS written content through innerHTML, and 10 pages rely
    // on it — almost all for <sup>/<sub> in chemistry and units notation.
    // Escaping here to match the plain-block path would render `m<sup>2</sup>`
    // as visible tags on those pages, so markdown is added without tightening.
    //
    // The tag sits in the OUTER block, beside the nested child — checked
    // against all 10 pages, and that is where every one of them puts it. A
    // first version of this test put the tag in the INNER block, which takes
    // the escaping path and so failed for a reason no real page has.
    const result = await parser.parse(
      '%%warning\nkg/m<sup>2</sup> and H<sub>2</sub>O\n\n%%note\ninner\n/%\n/%'
    );

    expect(result).toContain('<sup>2</sup>');
    expect(result).toContain('<sub>2</sub>');
  });

  // ── raw code blocks are exempt ────────────────────────────────────────────

  test('CSS in %%add-css is NOT run through markdown', async () => {
    // Showdown reads `/*…*/` as emphasis, so this rendered
    // `/<em>pagination.less</em>/` on nine CSS documentation pages — which exist
    // precisely to show the CSS accurately.
    // No spaces inside the comment markers — that is the form CSSThemeDark
    // actually uses, and the form Showdown reads as emphasis. A spaced
    // `/* like this */` does NOT reproduce it, so a test written that way
    // passes with the guard removed and proves nothing.
    const css = '%%add-css\n/*pagination.less*/\n.pagination { color: red; }\n/%';
    const result = await parser.parse(css);

    expect(result).not.toContain('<em>');
    expect(result).toContain('/*pagination.less*/');
  });

  test('a stylesheet pasted into a differently-named block is also exempt', async () => {
    // The class name is only one of the two signals; a CSS comment anywhere in
    // the content is the other.
    const result = await parser.parse('%%information\n/*theme*/\n.a { color: red; }\n/%');

    expect(result).not.toContain('<em>');
  });

  test('but prose that merely mentions an asterisk still renders markdown', async () => {
    const result = await parser.parse('%%information\n## Heading\n\nuse **bold** here\n/%');

    expect(result).toMatch(/<h2[^>]*>Heading<\/h2>/);
    expect(result).toContain('<strong>bold</strong>');
  });
});
