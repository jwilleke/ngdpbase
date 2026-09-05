/**
 * MarkupParser inline style tests — issue #592
 *
 * Verifies that %%sup/sub/strike%% inline styles render correctly inside
 * JSPWiki table cells, where they previously were destroyed by escapeHtml()
 * because Step 0.55 ran before JSPWikiPreprocessor (Phase 2.5).
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
            'ngdpbase.markup.handlers.linkparser.enabled': false,
            'ngdpbase.filters.enabled': true,
            'ngdpbase.filters.security.enabled': false,
            'ngdpbase.filters.spam.enabled': false,
            'ngdpbase.filters.validation.enabled': true,
            'ngdpbase.filters.validation.validate-markup': true,
            'ngdpbase.filters.validation.report-errors': true
          };
          return cfg[key] ?? defaultValue;
        },
        isInitialized: () => true
      }],
      ['CacheManager', {
        isInitialized: () => true,
        region: () => ({ get: async () => null, set: async () => {} })
      }],
      ['RenderingManager', {
        converter: { makeHtml: (s: string) => s }
      }]
    ]);
  }
  getManager(name: string) { return this.managers.get(name) || null; }
}

describe('MarkupParser inline styles (#592)', () => {
  let parser: MarkupParser;
  let filterManager: import('../../managers/FilterManager').default;

  beforeEach(async () => {
    // #1117: ValidationFilter (whose warnings some cases assert) registers
    // through FilterManager, the chain's owner.
    const engine = new MockEngine() as any;
    const { default: FilterManager } = await import('../../managers/FilterManager');
    filterManager = new FilterManager(engine);
    await filterManager.initialize();
    engine.managers.set('FilterManager', filterManager);
    parser = new MarkupParser(engine);
    await parser.initialize();
  });

  afterEach(async () => {
    await parser.shutdown();
    await filterManager.shutdown();
  });

  // ── outside tables ────────────────────────────────────────────────────────

  test('%%sup 2%% outside table renders as <sup>2</sup>', async () => {
    const result = await parser.parse('%%sup 2%%');
    expect(result).toContain('<sup>2</sup>');
  });

  test('%%sub 3%% outside table renders as <sub>3</sub>', async () => {
    const result = await parser.parse('%%sub 3%%');
    expect(result).toContain('<sub>3</sub>');
  });

  test('%%strike text%% outside table renders as <del>text</del>', async () => {
    const result = await parser.parse('%%strike text%%');
    expect(result).toContain('<del>text</del>');
  });

  test('%%sup 2 /% (slash-percent closing) outside table renders correctly', async () => {
    const result = await parser.parse('%%sup 2 /%');
    expect(result).toContain('<sup>2</sup>');
  });

  // ── inside table header cells ─────────────────────────────────────────────

  test('%%sup 2%% inside table header cell renders as <sup>2</sup>', async () => {
    const result = await parser.parse('|| Label %%sup 2%% ||');
    expect(result).toContain('<sup>2</sup>');
    expect(result).not.toContain('%%sup');
    expect(result).not.toContain('&lt;sup&gt;');
  });

  test('%%sub 3%% inside table header cell renders as <sub>3</sub>', async () => {
    const result = await parser.parse('|| Col %%sub 3%% ||');
    expect(result).toContain('<sub>3</sub>');
    expect(result).not.toContain('%%sub');
  });

  test('%%strike text%% inside table header cell renders as <del>text</del>', async () => {
    const result = await parser.parse('|| %%strike deprecated%% ||');
    expect(result).toContain('<del>deprecated</del>');
    expect(result).not.toContain('%%strike');
  });

  test('%%sup 2%% inside table body cell renders as <sup>2</sup>', async () => {
    const result = await parser.parse('| value %%sup 2%% |');
    expect(result).toContain('<sup>2</sup>');
    expect(result).not.toContain('%%sup');
  });

  // ── malformed syntax warning ──────────────────────────────────────────────

  test('%%sup2%% (no space) emits VALIDATION WARNING comment', async () => {
    const result = await parser.parse('%%sup2%%');
    // Migrated from inline check to ValidationFilter rule (#596).
    expect(result).toContain('<!-- VALIDATION WARNING [malformedInlineStyle]');
  });

  test('%%sub3%% (no space) emits VALIDATION WARNING comment', async () => {
    const result = await parser.parse('some text %%sub3%%');
    expect(result).toContain('<!-- VALIDATION WARNING [malformedInlineStyle]');
  });

  test('%%sup 2%% (correct syntax) does NOT emit VALIDATION WARNING', async () => {
    const result = await parser.parse('%%sup 2%%');
    expect(result).not.toContain('VALIDATION WARNING');
  });
});
