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
 * own), a dev dependency. Rendered with the `page` markdown profile, the one
 * real pages use: without a RenderingManager the parser falls back to the
 * `fallback` profile, which is not what a reader sees. Comparison ignores what
 * is serialisation rather than meaning: `<hr />` against `<hr>`, whitespace
 * between tags, and the `id` our heading anchors add (R2). The spec writes a
 * tab as `→`; it is turned back into a tab, as the spec's own runner does.
 */

import MarkupParser from '../MarkupParser';
import DOMVariableHandler from '../dom/handlers/DOMVariableHandler';
import DOMPluginHandler from '../dom/handlers/DOMPluginHandler';
import DOMLinkHandler from '../dom/handlers/DOMLinkHandler';
import { createMarkdownConverter } from '../../rendering/markdownConverter';
const spec = require('commonmark-spec') as { tests: Array<{ markdown: string; html: string; section: string; number: number }> };

// The page profile, with no HTML policy configured.
const pageConverter = createMarkdownConverter('page');

// The engine the parser needs for a page with no variables, plugins or pages.
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

/** Why an example does not render as the spec says. */
const REASONS = {
  'html-policy': 'Raw HTML in the page goes through the HTML policy (#1623). These run with no policy configured, so author HTML is dropped; CommonMark passes it through.',
  'soft-line-break': 'A new line is a new line (R4 in the #1271 decision log, `breaks: true`); CommonMark renders a soft break as a space.',
  'reference-definition-narrowed': 'A reference definition counts only on its own line, with a link-like destination on the same line (#1491), so `[Term]: value` wiki lines keep rendering. Multi-line definitions, plain-word destinations and definitions inside other blocks are not recognised.',
  'bug-code-extraction': 'KNOWN BUG #1726: the parser protects code spans and fences with its own pattern before markdown-it parses blocks, and disagrees with CommonMark: the internal placeholder printed into the page, a span across list items, spaces kept in multi-line spans, a fence after a quote inside a list item.',
  'wiki-link': '`[text]` is an NCM wiki link when the page defines no such reference label; in CommonMark it is literal text.',
  'fence-class-as-written': 'The code-fence class follows showdown (`showdownFenceClasses`): the bare language name beside `language-…`, and the info string as written; CommonMark decodes escapes and entities and adds only `language-…`.',
  'ncm-escape': '`[[` is NCM\'s escape for a literal `[` (kept, J1 in the #1271 decision log).',
  'ncm-line-break': '`\\\\` (two backslashes) is NCM\'s line break, kept from JSPWiki (#1370); CommonMark reads it as an escaped backslash.'
} as const;

const EXCEPTIONS: Record<number, keyof typeof REASONS> = Object.fromEntries(([
  ['html-policy', [
    21, 31, 148, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 161,
    162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175,
    176, 177, 178, 179, 180, 181, 183, 184, 185, 186, 187, 188, 189, 308,
    309, 344, 475, 476, 477, 491, 494, 524, 536, 613, 614, 615, 616, 617,
    623, 625, 626, 627, 628, 630, 631, 642, 643
  ]],
  ['soft-line-break', [
    25, 28, 37, 46, 49, 70, 81, 82, 87, 88, 93, 95, 104, 105,
    106, 113, 138, 145, 213, 216, 217, 220, 222, 223, 224, 228, 229, 230,
    232, 233, 238, 243, 247, 250, 251, 253, 254, 285, 286, 287, 288, 290,
    291, 292, 293, 304, 312, 334, 367, 384, 394, 405, 423, 432, 490, 505,
    552, 556, 587, 621, 648, 649
  ]],
  ['reference-definition-narrowed', [
    193, 194, 195, 196, 197, 198, 199, 201, 202, 203, 204, 208, 209, 212,
    218, 528, 529, 533, 540, 541, 542, 543, 545, 546, 547, 549, 569, 571,
    573, 576, 577
  ]],
  ['bug-code-extraction', [
    14, 42, 91, 121, 123, 124, 134, 211, 318, 321, 324, 333, 335, 336,
    343, 346, 537
  ]],
  ['wiki-link', [
    182, 511, 513, 523, 629
  ]],
  ['fence-class-as-written', [
    24, 34, 143, 146
  ]],
  ['ncm-escape', [
    548, 559, 560, 590
  ]],
  ['ncm-line-break', [
    12, 15, 550
  ]]
] as Array<[keyof typeof REASONS, number[]]>).flatMap(([reason, numbers]) => numbers.map((n) => [n, reason])));

const tabs = (s: string): string => s.replace(/\u2192/g, '\t');
const normalise = (html: string): string => html
  .replace(/(<h[1-6])\s+id="[^"]*"/g, '$1')
  .replace(/\s*\/>/g, '>')
  .replace(/>\s+</g, '><')
  .replace(/\s+/g, ' ')
  .trim();

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
