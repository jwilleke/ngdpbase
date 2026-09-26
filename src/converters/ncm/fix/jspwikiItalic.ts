/**
 * JSPWiki `''italic''` → Markdown `*italic*` (#1342).
 *
 * Each `''` toggles italic, as in Apache's parser (`handleApostrophe`). An
 * italic run does not stop at a paragraph break: `startBlockLevel` closes it
 * at the end of the block and reopens it at the start of the next, so a
 * quotation of several paragraphs (or with a list inside) is italic
 * throughout. Markdown emphasis cannot cross a block, so the run is closed
 * with `*` on the last line of each block and reopened on the first line of
 * the next — after its list marker, heading marks or quote marker.
 *
 * A `''` that is the whole line (a closer written on its own line) is
 * dropped and its `*` goes on the neighbouring text line instead: a line
 * that is only `*` would be read as an empty list item.
 *
 * Deliberately narrow:
 *   - never inside code, an HTML block, an inline code span or a
 *     `[{Plugin …}]` call (`caption=''` is an empty argument, not italic);
 *   - a page whose `''` count is odd is left alone, for review: which one is
 *     stray cannot be told;
 *   - the `*` goes before a line's closing `\` or `\\` break, never after it.
 *
 * The JSPWiki file converter calls this step too, so import and the NCM
 * funnel read `''` one way.
 *
 * @module converters/ncm/fix/jspwikiItalic
 */

import type { FixStep } from './types.js';
import { buildBlockMap, isBlank, joinLines } from './blocks.js';

/** A code span, a plugin or variable call, or the `''` itself. */
const TOKEN = /(`+)|\[\{[^}\n]*\}\]|''/g;
/** What starts a new block on a line with no blank line before it. */
const BLOCK_PREFIX = /^([ \t]*(?:[-*+][ \t]+|\d{1,9}[.)][ \t]+|#{1,6}[ \t]+|>[ \t]?))/;
/** A line's closing break: `\\` (JSPWiki) or `\` (Markdown), then any spaces. */
const TRAILING_BREAK = /(\\{1,2})?[ \t\u00a0]*$/;

/** Stand-ins for an opening and a closing `*` while a line is rewritten. */
const OPEN = '\uE000';
const CLOSE = '\uE001';
const MARKS = /[\uE000\uE001]/g;
const OPEN_BEFORE_SPACE = /\uE000([ \t\u00a0]+)/g;
const SPACE_BEFORE_CLOSE = /([ \t\u00a0]+)\uE001/g;
const EMPTY_OR_JOINED = /\uE000\uE001|\uE001\uE000/g;
const OPEN_AT_END = /\uE000((?:\\{1,2})?[ \t\u00a0]*)$/;

/** Each `''` position in a line, outside code spans and plugin calls. */
function quotePairs(line: string): number[] {
  const at: number[] = [];
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(line); m; m = TOKEN.exec(line)) {
    if (m[1]) {
      const close = line.indexOf(m[1], m.index + m[1].length);
      if (close !== -1) TOKEN.lastIndex = close + m[1].length;
      continue;
    }
    if (m[0] === "''") at.push(m.index);
  }
  return at;
}

function closeAtEnd(line: string): string {
  const tail = TRAILING_BREAK.exec(line);
  const cut = tail ? tail.index : line.length;
  return `${line.slice(0, cut)}*${line.slice(cut)}`;
}

/** Where a reopened run's `*` goes: after a list marker, heading marks or quote marker. */
function blockPrefixLength(line: string): number {
  return (BLOCK_PREFIX.exec(line)?.[1] ?? /^[ \t]*/.exec(line)?.[0] ?? '').length;
}

export const jspwikiItalic: FixStep = {
  id: 'jspwiki-italic',
  summary: "JSPWiki ''italic'' became *italic*",
  apply(body) {
    if (!body.includes("''")) return { content: body, lines: [] };
    const map = buildBlockMap(body);
    const text = (i: number): boolean => !map.code[i] && !map.html[i];
    const quotes = map.lines.map((l, i) => (text(i) ? quotePairs(l) : []));
    const total = quotes.reduce((n, q) => n + q.length, 0);
    if (total === 0 || total % 2) return { content: body, lines: [] };

    const out = [...map.lines];
    const changed = new Set<number>();
    const dropped = new Set<number>();
    let italic = false;
    let reopen = false;
    let lastText = -1;

    const closeBlock = (): void => {
      if (!italic || lastText < 0) return;
      out[lastText] = closeAtEnd(out[lastText]);
      changed.add(lastText);
      italic = false;
      reopen = true;
    };

    for (let i = 0; i < out.length; i++) {
      if (!text(i) || isBlank(out[i])) {
        closeBlock();
        continue;
      }
      if (BLOCK_PREFIX.test(out[i]) && lastText === i - 1) closeBlock();

      // Each `''` becomes an open or a close mark by the run's state; `''''`
      // toggles twice and is nothing. The marks are then moved to where
      // Markdown reads them as emphasis.
      const line = out[i];
      const prefix = blockPrefixLength(line);
      let state: boolean = italic || reopen;
      let marked = line.slice(0, prefix) + (reopen ? OPEN : '');
      let pos = prefix;
      const at = quotes[i];
      for (let k = 0; k < at.length; k++) {
        marked += line.slice(pos, at[k]);
        pos = at[k] + 2;
        if (at[k + 1] === at[k] + 2) { pos += 2; k++; continue; }
        marked += state ? CLOSE : OPEN;
        state = !state;
      }
      marked += line.slice(pos);
      reopen = false;

      // An open mark before a space, or a close mark after one, is not
      // emphasis: the space (a no-break space too) moves outside. An empty run, or a close then an
      // open, writes nothing.
      marked = marked
        .replace(OPEN_BEFORE_SPACE, `$1${OPEN}`)
        .replace(SPACE_BEFORE_CLOSE, `${CLOSE}$1`)
        .replace(EMPTY_OR_JOINED, '');
      // A close before any text on the line closes the line before it.
      const body0 = marked.slice(prefix);
      const lead = /^[ \t\u00a0]*/.exec(body0)?.[0] ?? '';
      if (body0.startsWith(CLOSE, lead.length)) {
        marked = marked.slice(0, prefix) + lead + body0.slice(lead.length + 1);
        if (lastText >= 0) { out[lastText] = closeAtEnd(out[lastText]); changed.add(lastText); }
      }
      // An open after all the text on the line opens the next line instead.
      const tail = OPEN_AT_END.exec(marked);
      if (tail) {
        marked = marked.slice(0, tail.index) + tail[1];
        state = false;
        reopen = true;
      }
      italic = state;

      const result = marked.replace(MARKS, '*');
      if (result.slice(prefix).trim() === '') {
        // Nothing but the marks: the line goes.
        if (result.trim() === '') dropped.add(i);
        continue;
      }
      if (result !== line) { out[i] = result; changed.add(i); }
      lastText = i;
      // A heading is a block of its own.
      if (/^[ \t]*#{1,6}[ \t]/.test(result)) closeBlock();
    }
    closeBlock();

    if (!changed.size && !dropped.size) return { content: body, lines: [] };
    const keptLines: string[] = [];
    const keptEols: string[] = [];
    out.forEach((line, k) => {
      if (dropped.has(k)) return;
      keptLines.push(line);
      keptEols.push(map.eols[k]);
    });
    const lines = [...new Set([...changed, ...dropped])].sort((a, b) => a - b).map((k) => k + 1);
    return { content: joinLines(keptLines, keptEols), lines };
  }
};
