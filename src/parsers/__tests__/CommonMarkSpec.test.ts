/**
 * The CommonMark specification's own examples, run through the page renderer
 * (#1709, epic #1476: NCM is CommonMark plus extensions).
 *
 * Every example either renders as the spec says, or is listed in EXCEPTIONS
 * with a named reason. A listed example must still differ: when a change makes
 * it pass, the test fails until its entry is removed, so the list only shrinks
 * on purpose and never hides a regression.
 *
 * Source: the `commonmark-spec` package (0.31.2, the CommonMark project's
 * own), a dev dependency. Comparison ignores what is serialisation rather than
 * meaning: `<hr />` against `<hr>`, and whitespace between tags. The spec
 * writes a tab as `→`; it is turned back into a tab, as the spec's own runner
 * does.
 */

import MarkupParser from '../MarkupParser';
import DOMVariableHandler from '../dom/handlers/DOMVariableHandler';
import DOMPluginHandler from '../dom/handlers/DOMPluginHandler';
import DOMLinkHandler from '../dom/handlers/DOMLinkHandler';
const spec = require('commonmark-spec') as { tests: Array<{ markdown: string; html: string; section: string; number: number }> };

// The engine the parser needs for a page with no variables, plugins or pages.
const createMockEngine = () => ({
  getManager: vi.fn((name: string) => {
    if (name === 'VariableManager') return { variableHandlers: new Map() };
    if (name === 'PluginManager') return { execute: vi.fn(async () => '') };
    if (name === 'ConfigurationManager') return { getProperty: (_key: string, fallback: unknown) => fallback };
    if (name === 'PageManager') return { getAllPages: async () => [] };
    return null;
  })
});

/** Why an example does not render as the spec says. */
const REASONS = {
  'html-policy': 'Raw HTML in the page goes through the HTML policy (#1623). These run with no policy configured, so author HTML is dropped; CommonMark passes it through.',
  'wiki-link': '`[text]` is an NCM wiki link when the page defines no such reference label; in CommonMark it is literal text.',
  'ncm-escape': "`[[` is NCM's escape for a literal `[` (kept, J1 in the #1271 decision log).",
  'ncm-line-break': '`\\\\` (two backslashes) is NCM\'s line break, kept from JSPWiki (#1370); CommonMark reads it as an escaped backslash.',
  'reference-definition-narrowed': 'A reference definition counts only on its own line, with a link-like destination on the same line (#1491), so `[Term]: value` wiki lines keep rendering. Multi-line definitions, plain-word destinations and definitions inside other blocks are not recognised.',
  'fence-class-as-written': 'The code-fence class keeps the info string as written (showdown parity, `showdownFenceClasses`); CommonMark decodes escapes and entities in it.',
  'bug-code-extraction': 'KNOWN BUG (#1709 comment): the parser protects code spans and fences with its own pattern before markdown-it parses the page, and disagrees with CommonMark \u2014 a fence straight after a paragraph line, a span across list items, a fence inside a quote, spaces in multi-line spans, and the internal placeholder leaking into the page.'
} as const;

const EXCEPTIONS: Record<number, keyof typeof REASONS> = Object.fromEntries(([
  ['html-policy', [
    21, 31, 148, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 161,
    162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175,
    176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189,
    201, 308, 309, 344, 475, 476, 477, 491, 494, 524, 536, 613, 614, 615,
    616, 617, 623, 625, 626, 627, 628, 629, 630, 631, 642, 643
  ]],
  ['wiki-link', [
    511, 513, 523, 543
  ]],
  ['ncm-escape', [
    548, 559, 560, 590
  ]],
  ['ncm-line-break', [
    12, 15, 550
  ]],
  ['reference-definition-narrowed', [
    193, 194, 195, 196, 197, 198, 199, 202, 203, 204, 208, 209, 212, 218,
    528, 529, 533, 540, 541, 542, 545, 546, 547, 549, 569, 571, 573, 576,
    577
  ]],
  ['fence-class-as-written', [
    24, 34
  ]],
  ['bug-code-extraction', [
    14, 42, 91, 121, 123, 124, 134, 140, 211, 237, 318, 321, 324, 333,
    334, 335, 336, 343, 346, 537
  ]]
] as Array<[keyof typeof REASONS, number[]]>).flatMap(([reason, numbers]) => numbers.map((n) => [n, reason])));

const tabs = (s: string): string => s.replace(/\u2192/g, '\t');
const normalise = (html: string): string => html.replace(/\s*\/>/g, '>').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

describe('CommonMark spec examples (#1709)', () => {
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

  const cases = spec.tests.map((t) => [t.number, t.section, t] as const);

  test.each(cases)('example %i (%s)', async (number, _section, example) => {
    const got = normalise(await parser.parseWithDOMExtraction(tabs(example.markdown), { pageName: 'TestPage' }));
    const expected = normalise(tabs(example.html));
    const reason = EXCEPTIONS[number];

    if (reason) {
      // Listed: must still differ. If it now matches, remove it from EXCEPTIONS.
      expect(got, `example ${number} now renders as the spec says; remove it from EXCEPTIONS (${reason}: ${REASONS[reason]})`).not.toBe(expected);
    } else {
      expect(got).toBe(expected);
    }
  });

  test('every exception names a real example', () => {
    const numbers = new Set(spec.tests.map((t) => t.number));
    expect(Object.keys(EXCEPTIONS).map(Number).filter((n) => !numbers.has(n))).toEqual([]);
  });
});
