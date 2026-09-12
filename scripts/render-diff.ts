#!/usr/bin/env tsx
/**
 * Differential rendering harness (#1272) — showdown against markdown-it over a
 * real page corpus, so the #1271 swap decision rests on a number.
 *
 * Only the markdown-to-HTML step is exercised. JSPWiki extraction and the DOM
 * merge are converter-independent and stay out of it, exactly as #1272 says.
 *
 * ## What this harness deliberately does NOT do
 *
 * It does not boot the engine. The faithful input would be the post-extraction
 * markdown `MarkupParser` hands showdown, and producing that means running the
 * real pipeline over every page — which, while #1136 is open, can WRITE:
 * AttachmentHandler creates content from inside the parser. A measurement tool
 * must not mutate the corpus it measures, so this reads page files and feeds
 * both converters the page body after `maskJspwiki` and `guardShowdownInput`.
 *
 * `maskJspwiki` is what stands in for extraction, and it is not a shortcut. The
 * first version of this harness excluded any page containing JSPWiki syntax and
 * could then measure 2.6% of the corpus, because 96.6% of pages carry
 * `[{$pagename}]`. Masking mirrors what the pipeline actually does — lift the
 * construct out to an opaque placeholder before the markdown step — so both
 * converters see the same token and the remaining differences are markdown
 * differences. That is the thing #1272 set out to count.
 *
 * What it still cannot see: constructs whose extraction CHANGES surrounding
 * markdown structure rather than merely replacing a span. A full-pipeline run
 * remains the stronger measurement, and is the follow-up once #1136 is closed.
 *
 * ## Usage
 *
 *   npx tsx scripts/render-diff.ts --data /path/to/SLOW_STORAGE/pages
 *   npx tsx scripts/render-diff.ts --data ... --out private/render-diff --limit 50
 *
 * Per-page diffs land under --out (default `private/render-diff`, gitignored).
 * Nothing is written into the corpus.
 */

import '../src/bootstrap-env.js';
import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import showdown from 'showdown';
import type MarkdownIt from 'markdown-it';
import { buildMarkdownIt as buildPageMarkdownIt } from '../src/rendering/markdownConverter.js';
import { parseHTML } from 'linkedom';
import { guardShowdownInput } from '../src/utils/showdownGuard.js';
import showdownSubSuperscript from '../src/extensions/showdown-sub-superscript.js';
import showdownHeadingIds from '../src/extensions/showdown-heading-ids.js';

// ---------------------------------------------------------------------------
// The two converters
// ---------------------------------------------------------------------------

/**
 * The production converter, option for option.
 *
 * Kept identical to `RenderingManager`'s on purpose — a harness configured even
 * slightly differently measures itself rather than the corpus. If that one
 * changes and this does not, `renderDiffInvariant` in the tests fails.
 */
export function buildShowdown(): showdown.Converter {
  return new showdown.Converter({
    tables: true,
    strikethrough: true,
    tasklists: true,
    simpleLineBreaks: true,
    openLinksInNewWindow: false,
    backslashEscapesHTMLTags: true,
    disableForced4SpacesIndentedSublists: true,
    literalMidWordUnderscores: true,
    ghCodeBlocks: true,
    ghHeaderIds: true,
    extensions: [showdownSubSuperscript, showdownHeadingIds]
  });
}

/**
 * The candidate is production's own page converter (#1273): the harness
 * measures exactly what `src/rendering/markdownConverter.ts` renders, so a
 * change there shows up here. The options and their reasons live there.
 */
export function buildMarkdownIt(): MarkdownIt {
  return buildPageMarkdownIt('page');
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Tags whose text content is significant character-for-character. */
const VERBATIM = new Set(['PRE', 'CODE', 'TEXTAREA']);

/**
 * Block-level tags, whose leading and trailing whitespace is not rendered.
 *
 * The distinction earns its keep. showdown ends a paragraph `text. </p>` where
 * markdown-it ends it `text.</p>`; both render identically and the difference
 * swamped everything else in the first real run. Trimming that at block
 * boundaries is safe. Trimming it at INLINE boundaries is not — `<em>a </em>b`
 * and `<em>a</em>b` are different text — so inline elements are left alone.
 */
const BLOCK = new Set([
  'P', 'DIV', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'TD', 'TH', 'TR', 'TABLE', 'THEAD', 'TBODY', 'SECTION',
  'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD'
]);

/**
 * HTML's whitespace — space, tab, LF, FF, CR — and nothing wider.
 *
 * NOT `\s`, which also matches U+00A0. A no-break space is content: HTML never
 * collapses it, and it is the whole reason to write one. Folding it into an
 * ordinary space would hide a converter that turned one into the other.
 */
const WS = '[ \\t\\n\\f\\r]';
const WS_RUN = new RegExp(`${WS}+`, 'g');
const WS_LEAD = new RegExp(`^${WS}+`);
const WS_TRAIL = new RegExp(`${WS}+$`);
const WS_ONLY = new RegExp(`^${WS}*$`);
const WS_BETWEEN_TAGS = new RegExp(`>${WS}+<`, 'g');

/**
 * Reduce HTML to the shape a reader would call "the same page".
 *
 * Attribute order and inter-tag whitespace are artefacts of whichever converter
 * emitted them, never meaning — so both are removed before comparing, or the
 * harness reports a difference on every page and measures nothing.
 *
 * Whitespace inside `pre`, `code` and `textarea` IS meaning and is left alone.
 */
export function normaliseHtml(html: string): string {
  const { document } = parseHTML(`<div id="__root">${html}</div>`);
  const root = document.getElementById('__root');
  if (!root) return html.trim();

  // linkedom gives every character reference its own text node: `It&nbsp;does`
  // parses to three nodes, the middle one a lone U+00A0, where a browser builds
  // one. The walk below removes whitespace-only nodes as inter-tag noise, and
  // it used to test that with `trim()`, which counts U+00A0 as whitespace — so
  // it deleted the no-break space itself. showdown writes `&nbsp;` and
  // markdown-it the literal character, so only showdown's side lost it: `It
  // does not` became `Itdoes not`. That was the "dropped space" no snippet
  // could reproduce, because snippets were typed with plain spaces. It was 565
  // of 1,636 differing pages on jimstest — three in four of `other`.
  //
  // Merging first, as a browser would, is the fix, and on its own it clears
  // all 565. It also covers the case `WS_ONLY` cannot: one converter writing an
  // entity and the other the character — `&quot; <em>` splits off a lone
  // space the walk deletes, where `" <em>` keeps it (25 of the 565). `WS_ONLY`
  // stays as the second guard, for a no-break space that really is a node of
  // its own, between two elements.
  root.normalize();

  const walk = (node: Element, verbatim: boolean): void => {
    const names = node.getAttributeNames().slice().sort();
    // A declaration list's final `;` is optional CSS: showdown writes
    // `style="text-align:center;"` on a table cell and markdown-it
    // `style="text-align:center"`. Same rule, different punctuation.
    const values = new Map(names.map((n) => {
      const v = node.getAttribute(n) ?? '';
      return [n, n === 'style' ? v.replace(/[\s;]+$/, '') : v];
    }));
    for (const n of names) node.removeAttribute(n);
    for (const n of names) node.setAttribute(n, values.get(n) ?? '');

    const inVerbatim = verbatim || VERBATIM.has(node.tagName);
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 3) {
        if (!inVerbatim) {
          let collapsed = (child.textContent ?? '').replace(WS_RUN, ' ');
          // A break — `<br>` or the edge of a block — is not preceded or
          // followed by rendered space. showdown writes `text, <br>` where
          // markdown-it writes `text,<br>`, and inside a list item showdown
          // writes `include:<ul>` where markdown-it writes `include: <ul>`.
          const breaks = (n: Node | null): boolean =>
            !!n && n.nodeType === 1 && ((n as Element).tagName === 'BR' || BLOCK.has((n as Element).tagName));
          if (breaks(child.nextSibling)) collapsed = collapsed.replace(WS_TRAIL, '');
          if (breaks(child.previousSibling)) collapsed = collapsed.replace(WS_LEAD, '');
          if (WS_ONLY.test(collapsed)) child.remove();
          else child.textContent = collapsed;
        }
      } else if (child.nodeType === 1) {
        walk(child as Element, inVerbatim);
      }
    }

    // Trim only at the edges of a block, where the whitespace is not rendered.
    if (!inVerbatim && BLOCK.has(node.tagName)) {
      const kids = Array.from(node.childNodes);
      const first = kids[0];
      const last = kids[kids.length - 1];
      if (first && first.nodeType === 3) {
        first.textContent = (first.textContent ?? '').replace(WS_LEAD, '');
      }
      if (last && last.nodeType === 3) {
        last.textContent = (last.textContent ?? '').replace(WS_TRAIL, '');
      }
    }
  };

  walk(root as unknown as Element, false);
  return (root.innerHTML ?? '').replace(WS_BETWEEN_TAGS, '><').trim();
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type DiffClass =
  | 'line-breaks'
  | 'list-nesting'
  | 'heading-ids'
  | 'escaped-html'
  | 'tables'
  | 'emphasis'
  | 'code-blocks'
  | 'backslash'
  | 'sub-sup'
  | 'ordered-start'
  | 'list-split'
  | 'blockquote'
  | 'paragraphs'
  | 'other';

const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

/** Every capture of `re`'s first group, in document order. */
function captures(html: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

const differ = (a: string[], b: string[]): boolean => JSON.stringify(a) !== JSON.stringify(b);

/** Every `id=` on a heading, in document order. */
function headingIds(html: string): string[] {
  const out: string[] = [];
  const re = /<h[1-6]\b[^>]*\bid="([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

/**
 * Each emphasis tag with the text it opens on, in document order — nesting and
 * extent, not just how many.
 *
 * The text matters as much as the tag. An underscore run like
 * `Unit_5:_Innate_Immunity/…_` gives both converters one `<em>`, but opened at
 * different underscores, so the tag sequence alone matched and the page fell
 * into `other`.
 */
function emphasisSequence(html: string): string[] {
  return captures(html, /(<(?:em|strong)\b[^>]*>[^<]{0,40})/gi).map((s) => s.toLowerCase());
}

/** Deepest nesting of `ul`/`ol`, which is what a sublist-indent difference moves. */
function maxListDepth(html: string): number {
  let depth = 0;
  let max = 0;
  const re = /<(\/?)(?:ul|ol)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] === '/') depth = Math.max(0, depth - 1);
    else max = Math.max(max, ++depth);
  }
  return max;
}

/**
 * Which constructs account for the difference between two renderings.
 *
 * Returns every class that applies, because one markdown change routinely moves
 * two things at once — a sublist that reflows also changes the `<br>` count.
 * Collapsing that to a single winner would hide half the story. `other` is only
 * used when nothing more specific fires, so a growing `other` bucket is the
 * signal that this function needs another case, not that the corpus is exotic.
 */
export function classifyDifference(showdownHtml: string, markdownItHtml: string): DiffClass[] {
  const classes: DiffClass[] = [];

  if (count(showdownHtml, /<br\s*\/?>/gi) !== count(markdownItHtml, /<br\s*\/?>/gi)) {
    classes.push('line-breaks');
  }
  if (maxListDepth(showdownHtml) !== maxListDepth(markdownItHtml) ||
      count(showdownHtml, /<li\b/gi) !== count(markdownItHtml, /<li\b/gi)) {
    classes.push('list-nesting');
  }
  if (JSON.stringify(headingIds(showdownHtml)) !== JSON.stringify(headingIds(markdownItHtml))) {
    classes.push('heading-ids');
  }
  if (count(showdownHtml, /&lt;|&gt;|&amp;/g) !== count(markdownItHtml, /&lt;|&gt;|&amp;/g)) {
    classes.push('escaped-html');
  }
  if (count(showdownHtml, /<table\b/gi) !== count(markdownItHtml, /<table\b/gi) ||
      count(showdownHtml, /<t[dh]\b/gi) !== count(markdownItHtml, /<t[dh]\b/gi)) {
    classes.push('tables');
  }
  // Ordered, not counted. `***x***` gives showdown `<strong><em>` and
  // markdown-it `<em><strong>` — the same two tags, so a count comparison sees
  // nothing and the page falls into `other` with no explanation.
  if (JSON.stringify(emphasisSequence(showdownHtml)) !== JSON.stringify(emphasisSequence(markdownItHtml))) {
    classes.push('emphasis');
  }

  // showdown renders a line-ending backslash as a literal `\` before the break;
  // in CommonMark the backslash IS the hard break and is consumed.
  if (count(showdownHtml, /\\/g) !== count(markdownItHtml, /\\/g)) {
    classes.push('backslash');
  }
  // Contents as well as counts: showdown expands a tab inside a fenced block to
  // spaces and markdown-it keeps the tab — same block, different bytes.
  const code = (html: string): string[] => captures(html, /<code\b[^>]*>([\s\S]*?)<\/code>/gi);
  if (differ(code(showdownHtml), code(markdownItHtml))) {
    classes.push('code-blocks');
  }

  // The house extension matches `~…~` and `^…^` across spaces; markdown-it-sub
  // and -sup do not. So `(~5%) but relatively numerous (~` — a tilde meaning
  // "about", twice — is a subscript in production today and plain text after
  // the swap.
  if (differ(captures(showdownHtml, /<(su[bp])\b/gi), captures(markdownItHtml, /<(su[bp])\b/gi))) {
    classes.push('sub-sup');
  }
  // An ordered list that follows a bullet list with no paragraph between: both
  // converters honour `2.` as `start="2"` anywhere else, but here showdown
  // drops it and the item renders as `1.`.
  if (differ(captures(showdownHtml, /<ol\b[^>]*\bstart="([^"]*)"/gi),
    captures(markdownItHtml, /<ol\b[^>]*\bstart="([^"]*)"/gi))) {
    classes.push('ordered-start');
  }
  // CommonMark starts a new list when the bullet character changes (`-` then
  // `*`); showdown carries on the same list. Same items, more lists.
  if (count(showdownHtml, /<(?:ul|ol)\b/gi) !== count(markdownItHtml, /<(?:ul|ol)\b/gi)) {
    classes.push('list-split');
  }
  // `> a`, a blank line, `> b`: one quote of two paragraphs to showdown, two
  // quotes to CommonMark.
  if (count(showdownHtml, /<blockquote\b/gi) !== count(markdownItHtml, /<blockquote\b/gi)) {
    classes.push('blockquote');
  }
  // Loose-versus-tight lists (`<li><p>`) and text after a raw HTML block
  // (CommonMark ends the block at a blank line, showdown at the closing tag).
  if (count(showdownHtml, /<p\b/gi) !== count(markdownItHtml, /<p\b/gi)) {
    classes.push('paragraphs');
  }

  if (classes.length === 0) classes.push('other');
  return classes;
}

/**
 * Does this page carry JSPWiki syntax the real pipeline extracts before
 * showdown ever sees it?
 *
 * Only the unambiguous markers. Reported for context; it no longer decides
 * whether a page is measured — see `maskJspwiki` for why.
 */
export function hasJspwikiSyntax(markdown: string): boolean {
  return /\[\{/.test(markdown) ||        // [{Plugin}] and [{$variable}]
    /%%[a-zA-Z(]/.test(markdown) ||      // %%style blocks
    /^!{2,3}\s/m.test(markdown) ||       // !!! headings
    /\[[^\]]+\|[^\]]+\]/.test(markdown); // [Text|Target] links
}

/** An inert token: letters and digits only, so neither converter transforms it. */
const MASK = (n: number): string => `jspwikinode${String(n).padStart(6, '0')}x`;

/**
 * Take code out first, as MarkupParser's Step 0 does, so neither converter
 * ever sees it.
 *
 * Production extracts every fenced code block (`MarkupParser.ts`, the
 * line scanner under "Step 0") and every inline code span into placeholders
 * before any JSPWiki construct is touched and long before the converter runs;
 * the DOM pipeline puts the code back afterwards. The harness used to hand
 * code straight to both converters and mask JSPWiki syntax *inside* it, which
 * measured things production never does: fence and tab handling that only the
 * DOM pipeline performs, and — worse — a `[` inside a code span starting a
 * page-link match that ran across lines and swallowed the next fence, so a
 * well-formed page read as broken under both converters.
 *
 * The fence rule is production's own (#1335): a line of three or more
 * backticks, optionally indented, with an optional language that may follow a
 * space; closed by the same backtick run indented no further than the opening
 * fence or 3 spaces. An unclosed fence runs to the end, as production's
 * scanner does. The placeholder keeps the fence's indent. Inline spans pair
 * backtick runs of equal length, and may cross lines.
 */
function extractCode(markdown: string, token: () => string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^([ \t]*)(`{3,})[ \t]*([^\s`]*)[^`]*$/.exec(lines[i]);
    if (!open) { out.push(lines[i]); continue; }
    const close = new RegExp(`^[ \\t]{0,${Math.max(3, open[1].length)}}${open[2]}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) j++;
    out.push(open[1] + token());
    i = j; // the closing fence, or past the end when unclosed
  }
  return out.join('\n').replace(/(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, () => token());
}

/**
 * Stand JSPWiki constructs down to inert tokens, the way the real pipeline
 * stands them down to UUID placeholders.
 *
 * This exists because the first run of this harness excluded any page
 * containing JSPWiki syntax and could then measure 2.6% of the corpus: 96.6% of
 * pages carry `[{$pagename}]`, a variable that almost every page template
 * includes. Excluding them measured almost nothing and called it a number.
 *
 * Masking is the better answer and the more faithful one. `MarkupParser` lifts
 * these constructs into placeholders before the markdown step, so by the time
 * showdown runs they are already opaque tokens — which is exactly what both
 * converters see here. A construct that is opaque to both cannot manufacture a
 * difference, so the remaining differences are markdown differences, which is
 * what #1272 set out to count.
 *
 * Only the constructs themselves are masked, never the markdown around or
 * inside them: a `%%information` block still has its body measured, because the
 * real pipeline still renders that body as markdown.
 */
export function maskJspwiki(markdown: string): string {
  let n = 0;
  return extractCode(markdown, () => MASK(n++))
    // [{Plugin}] and [{$variable}] — the whole construct is opaque.
    .replace(/\[\{[^}]*\}\]/g, () => MASK(n++))
    // Style-block open and close markers only; the body between them is markdown.
    .replace(/%%[a-zA-Z][\w-]*(?:\([^)]*\))?/g, () => MASK(n++))
    .replace(/(^|\s)\/%/g, (_m, lead: string) => `${lead}${MASK(n++)}`)
    // Page links. This is LinkParserHandler's own pattern, copied deliberately
    // from src/parsers/handlers/LinkParserHandler.ts:79 rather than
    // approximated, because its two negative lookaheads are the whole point:
    // `(?!\^)` leaves footnote references alone and `(?!\()` leaves ordinary
    // markdown links alone. An approximation that dropped either would mask
    // real markdown and under-report differences.
    //
    // Getting this wrong is what produced the second bad run: with bare
    // `[Page Title]` left unmasked, showdown read `[a] (b)` as a link where
    // CommonMark does not, and markdown-it consumed `[label]: value` as a link
    // reference definition and emitted empty list items. Neither converter ever
    // sees those brackets in production — the handler removes them at
    // priority 60, before the markdown step.
    .replace(/\[(?!\^)([^|\]]+)(?:\|([^|\]]+))?(?:\|([^\]]+))?\](?!\()/g, () => MASK(n++))
    // !!! / !! headings become headings before the markdown step.
    .replace(/^!{2,3}\s*(.*)$/gm, (_m, text: string) => `${MASK(n++)} ${text}`)
    // Footnotes belong to the DOM pipeline, not to the converter —
    // MarkupParser extracts definitions at its Step 3.5/3.6 and
    // RenderingManager's converter is built with no footnote extension for
    // exactly that reason. Left in, they reach showdown's sub/superscript
    // extension, which rewrites `weak[^5]` to `weak[<sup>5]`; markdown-it
    // leaves it alone, and the harness reports a difference production never
    // has. Definitions first, so the reference rule cannot eat their label.
    .replace(/^\[\^[^\]]+\]:.*$/gm, () => MASK(n++))
    .replace(/\[\^[^\]]+\]/g, () => MASK(n++));
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

export interface PageResult {
  file: string;
  differs: boolean;
  jspwiki: boolean;
  classes: DiffClass[];
}

export function comparePage(markdown: string): Omit<PageResult, 'file'> {
  const guarded = guardShowdownInput(maskJspwiki(markdown));
  const a = normaliseHtml(buildShowdown().makeHtml(guarded));
  const b = normaliseHtml(buildMarkdownIt().render(guarded));
  const differs = a !== b;
  return {
    differs,
    jspwiki: hasJspwikiSyntax(markdown),
    classes: differs ? classifyDifference(a, b) : []
  };
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // `versions/` holds historical revisions and `deleted/` soft-deleted pages.
      // Both would count old text as current corpus; `private/` is current pages.
      if (entry.name === 'deleted' || entry.name === 'versions') continue;
      await walk(full, out);
    } else if (entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  const dataDir = get('--data');
  if (!dataDir) {
    console.error('✗ --data <page store directory> is required');
    console.error('\nUsage: npx tsx scripts/render-diff.ts --data <dir> [--out dir] [--limit n]');
    process.exit(1);
  }
  const outDir = get('--out') ?? 'private/render-diff';
  const limit = Number(get('--limit') ?? '0');

  if (!(await fs.pathExists(dataDir))) {
    console.error(`✗ ${dataDir} does not exist`);
    process.exit(1);
  }

  let files = await walk(dataDir);
  files.sort();
  if (limit > 0) files = files.slice(0, limit);

  await fs.ensureDir(outDir);

  const results: PageResult[] = [];
  for (const file of files) {
    let markdown: string;
    try {
      markdown = matter(await fs.readFile(file, 'utf8')).content;
    } catch {
      continue; // Unparseable frontmatter is a page problem, not a converter one.
    }
    const cmp = comparePage(markdown);
    results.push({ file, ...cmp });

    if (cmp.differs) {
      // The SAME input the comparison used — masked, then guarded. Writing the
      // raw page here made the first batch of diff files show JSPWiki syntax
      // the comparison had already stood down, which reads as though masking
      // had not happened.
      const guarded = guardShowdownInput(maskJspwiki(markdown));
      const name = path.basename(file, '.md');
      await fs.writeFile(
        path.join(outDir, `${name}.diff.txt`),
        [
          `file: ${file}`,
          `classes: ${cmp.classes.join(', ')}`,
          `jspwiki-unextracted: ${cmp.jspwiki}`,
          '',
          '--- showdown ---',
          normaliseHtml(buildShowdown().makeHtml(guarded)),
          '',
          '--- markdown-it ---',
          normaliseHtml(buildMarkdownIt().render(guarded)),
          ''
        ].join('\n'),
        'utf8'
      );
    }
  }

  // ------------------------------------------------------------------
  // Report
  // ------------------------------------------------------------------
  const differing = results.filter((r) => r.differs);
  const jspwiki = results.filter((r) => r.jspwiki);

  const mdVersion = JSON.parse(
    await fs.readFile(path.join('node_modules', 'markdown-it', 'package.json'), 'utf8')
  ).version as string;
  const sdVersion = JSON.parse(
    await fs.readFile(path.join('node_modules', 'showdown', 'package.json'), 'utf8')
  ).version as string;

  const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);

  console.log('');
  console.log('Differential rendering harness (#1272)');
  console.log(`showdown ${sdVersion} vs markdown-it ${mdVersion}`);
  console.log(`corpus: ${dataDir}`);
  console.log('');
  console.log(`  pages measured                ${results.length}`);
  console.log(`    differ                      ${differing.length}  (${pct(differing.length, results.length)})`);
  console.log(`    identical                   ${results.length - differing.length}  (${pct(results.length - differing.length, results.length)})`);
  console.log(`  carried JSPWiki syntax        ${jspwiki.length}  (${pct(jspwiki.length, results.length)}) — masked, not excluded`);
  console.log('');

  const buckets = new Map<DiffClass, number>();
  for (const r of differing) for (const c of r.classes) buckets.set(c, (buckets.get(c) ?? 0) + 1);

  if (buckets.size > 0) {
    console.log('  Differences by class');
    console.log('  (a page can appear in more than one)');
    console.log('');
    for (const [cls, n] of [...buckets.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cls.padEnd(14)} ${String(n).padStart(5)}  ${pct(n, differing.length)}`);
    }
    console.log('');
  }

  console.log(`  per-page diffs: ${outDir}/`);
  console.log('');
}

if (process.argv[1] && process.argv[1].endsWith('render-diff.ts')) {
  main().catch((err: unknown) => {
    console.error('✗ render-diff failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
