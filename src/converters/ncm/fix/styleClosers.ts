/**
 * Bare `%%` style closers → `/%` (#1346).
 *
 * JSPWiki closes a `%%` style block with `/%` or with a bare `%%`. NCM writes
 * only `/%` (operator decision, 2026-09-12); the renderer still tolerates a
 * bare `%%`, so this changes the text, not what the page shows. A `%%` is a
 * closer under Apache's rule (`JSPWikiMarkupParser.handleDiv`): not followed
 * by a letter or `(`, with a block open. That covers a line that is only
 * `%%` and the inline form `%%sub text%%`.
 *
 * Openers are counted to know whether a block is open: `%%` followed by a
 * letter or `(` opens one, `/%` or a bare `%%` closes the innermost. An
 * inline opener (text after it on the line) that is never closed ends with
 * its paragraph, as in Apache, so a blank line drops the inline ones still
 * open; a block-form opener (alone on its line) stays open until closed.
 *
 * Deliberately narrow:
 *   - a `%%` with no block open is left alone, for review; Apache drops it;
 *   - never a line the renderer treats as code or HTML, and never inside an
 *     inline code span.
 *
 * @module converters/ncm/fix/styleClosers
 */

import type { FixStep } from './types.js';
import { buildBlockMap, isBlank, joinLines } from './blocks.js';
import { STYLE_BLOCK_OPENER } from '../../../parsers/styleBlockSyntax.js';

/** `%%` then what decides its meaning, `/%`, or a backtick run (a code span starts). */
const TOKEN = /%%(?=([A-Za-z(])?)|\/%|`+/g;

/** A line that is only a block-form opener: `%%information`, `%%(color:red)`. */
function isBlockOpenerLine(line: string): boolean {
  return STYLE_BLOCK_OPENER.test(line) || /^\s*%%\([^)]*\)[ \t]*$/.test(line);
}

export const styleClosers: FixStep = {
  id: 'style-closers',
  summary: 'Bare %% style closers became /%',
  apply(body) {
    if (!body.includes('%%')) return { content: body, lines: [] };
    const map = buildBlockMap(body);
    const out = [...map.lines];
    const lines: number[] = [];
    // Innermost last; true for an inline opener, which its paragraph ends.
    const open: boolean[] = [];

    for (let i = 0; i < out.length; i++) {
      if (map.code[i] || map.html[i]) continue;
      const line = out[i];
      if (isBlank(line)) {
        while (open.length && open[open.length - 1]) open.pop();
        continue;
      }
      let rewritten = '';
      let pos = 0;
      TOKEN.lastIndex = 0;
      for (let m = TOKEN.exec(line); m; m = TOKEN.exec(line)) {
        const tok = m[0];
        if (tok[0] === '`') {
          // Skip the code span it opens, if it is closed on this line.
          const close = line.indexOf(tok, m.index + tok.length);
          if (close !== -1) TOKEN.lastIndex = close + tok.length;
          continue;
        }
        if (tok === '/%') {
          open.pop();
          continue;
        }
        if (m[1]) {
          open.push(!isBlockOpenerLine(line));
          continue;
        }
        if (!open.length) continue;
        open.pop();
        rewritten += line.slice(pos, m.index) + '/%';
        pos = m.index + 2;
      }
      if (pos > 0) {
        out[i] = rewritten + line.slice(pos);
        lines.push(i + 1);
      }
    }
    return { content: lines.length ? joinLines(out, map.eols) : body, lines };
  }
};
