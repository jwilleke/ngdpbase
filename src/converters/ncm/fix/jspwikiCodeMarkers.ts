/**
 * JSPWiki `{{{ }}}` code markers → Markdown code (#1332). Safe on save.
 *
 * JSPWiki marks preformatted text with `{{{` and `}}}`. That is not Markdown:
 * the renderer shows the braces and reads the text inside as page markup, so
 * `** item` in an example becomes a bullet and `[{Plugin}]` runs. Rewritten:
 *
 *   - a `{{{` at the start of a line (up to 3 spaces in) opens a block, closed
 *     by the first `}}}` after it — or by a ``` line, where an author mixed
 *     the two. Both become ``` fences at the opener's indent; text after the
 *     `{{{`, and text before or after the `}}}` (`}}} /%`), moves onto a line
 *     of its own. Lines in between are code and are not changed;
 *   - `{{{text}}}` on one line becomes an inline code span.
 *
 * Deliberately narrow:
 *   - never a `{{{` inside code, an inline code span or an HTML block;
 *   - a `}}}` with no `{{{` before it is left alone (`{\boldsymbol {\tau }}}`);
 *   - a `{{{` that opens mid-line and closes on a later line is left alone:
 *     it is inline text across a line break, and a fence there would split
 *     the sentence (or list item) it sits in;
 *   - a block opened by ``` and closed by `}}}` is left alone: those lines are
 *     code to the parser;
 *   - if any `{{{` block is never closed, nothing is changed.
 *
 * Runs first, so the steps after it see the example text as code.
 *
 * @module converters/ncm/fix/jspwikiCodeMarkers
 */

import type { FixStep } from './types.js';
import { buildBlockMap, isBlank, joinLines } from './blocks.js';

const BLOCK_OPEN = /^( {0,3})\{\{\{(.*)$/;
// Fences as MarkupParser's Step 0 (backticks) and markdown-it (tildes) open them.
const FENCE_OPEN = /^([ \t]*)(`{3,}|~{3,})/;

function fenceCloser(indent: string, run: string): RegExp {
  return new RegExp(`^[ \\t]{0,${Math.max(3, indent.length)}}${run[0] === '`' ? '`' : '~'}{${run.length},}\\s*$`);
}

/** An inline code span holding `code`, with a backtick run longer than any inside it. */
function codeSpan(code: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((r) => r.length));
  const ticks = '`'.repeat(longest + 1);
  const pad = code.startsWith('`') || code.endsWith('`') ? ' ' : '';
  return `${ticks}${pad}${code}${pad}${ticks}`;
}

/**
 * Rewrite each one-line `{{{text}}}` that is not inside a backtick code span.
 * Left to right, whichever opens first wins: backticks inside `{{{ }}}` are
 * code text, and `{{{` inside backticks is left alone.
 */
function convertInline(line: string): string {
  if (!line.includes('{{{')) return line;
  const ticks = /`+/y;
  const brace = /\{\{\{(.*?)\}\}\}/y;
  let out = '';
  let pos = 0;
  while (pos < line.length) {
    ticks.lastIndex = pos;
    const t = ticks.exec(line);
    if (t) {
      const close = line.indexOf(t[0], pos + t[0].length);
      const end = close === -1 ? pos + t[0].length : close + t[0].length;
      out += line.slice(pos, end);
      pos = end;
      continue;
    }
    brace.lastIndex = pos;
    const b = brace.exec(line);
    if (b?.[1].trim()) {
      out += codeSpan(b[1].trim());
      pos += b[0].length;
      continue;
    }
    out += line[pos++];
  }
  return out;
}

export const jspwikiCodeMarkers: FixStep = {
  id: 'jspwiki-code-markers',
  summary: 'JSPWiki {{{ }}} code markers became Markdown code',
  safeOnSave: true,
  apply(body) {
    if (!body.includes('{{{')) return { content: body, lines: [] };
    const map = buildBlockMap(body);
    const out: string[] = [];
    const eols: string[] = [];
    const changed: number[] = [];
    // Output line ranges of the blocks written here, checked after re-parsing.
    const created: [number, number][] = [];
    const push = (text: string, eol: string): void => { out.push(text); eols.push(eol); };

    let fence: RegExp | null = null;
    for (let i = 0; i < map.lines.length; i++) {
      const line = map.lines[i];
      const eol = map.eols[i];

      if (fence) {
        if (fence.test(line)) fence = null;
        push(line, eol);
        continue;
      }
      const f = FENCE_OPEN.exec(line);
      if (f && f[1].length <= 3) {
        fence = fenceCloser(f[1], f[2]);
        push(line, eol);
        continue;
      }
      // HTML blocks and indented code (fences are tracked above).
      if (map.html[i] || (map.code[i] && /^(?: {4}|\t)/.test(line))) {
        push(line, eol);
        continue;
      }

      const open = BLOCK_OPEN.exec(line);
      if (open && !open[2].includes('}}}')) {
        const indent = open[1];
        const start = out.length;
        push(`${indent}\`\`\``, eol);
        if (!isBlank(open[2])) push(`${indent}${open[2]}`, eol);
        changed.push(i + 1);
        // Find the closer: the first `}}}`, or a ``` line.
        let j = i + 1;
        const fenceLine = fenceCloser(indent, '```');
        for (; j < map.lines.length; j++) {
          const at = map.lines[j].indexOf('}}}');
          if (at !== -1) {
            const before = map.lines[j].slice(0, at);
            const after = map.lines[j].slice(at + 3).trimStart();
            if (!isBlank(before)) push(before, map.eols[j]);
            push(`${indent}\`\`\``, map.eols[j]);
            created.push([start, out.length - 1]);
            if (after) push(after, map.eols[j]);
            changed.push(j + 1);
            break;
          }
          if (fenceLine.test(map.lines[j])) {
            push(map.lines[j], map.eols[j]);
            created.push([start, out.length - 1]);
            break;
          }
          push(map.lines[j], map.eols[j]);
        }
        // Never closed: JSPWiki would show the rest of the page as code.
        if (j === map.lines.length) return { content: body, lines: [] };
        i = j;
        continue;
      }

      const converted = convertInline(line);
      if (converted !== line) changed.push(i + 1);
      push(converted, eol);
    }

    if (!changed.length) return { content: body, lines: [] };
    const content = joinLines(out, eols);
    // Safety net: every block written here must be code to the parser, fence to fence.
    const after = buildBlockMap(content);
    for (const [s, e] of created) {
      for (let l = s; l <= e; l++) if (!after.code[l]) return { content: body, lines: [] };
    }
    return { content, lines: changed };
  }
};
