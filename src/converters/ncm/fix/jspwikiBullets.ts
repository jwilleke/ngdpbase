/**
 * JSPWiki nested bullets → Markdown nested bullets (#1325). Safe on save.
 *
 * JSPWiki writes a second-level bullet as `** item` and a third as `*** item`.
 * That is not Markdown: CommonMark reads `** item` as a paragraph starting
 * with two asterisks, so imported pages show literal stars. Each is rewritten
 * to a hyphen bullet indented 2 spaces per level below the first — the house
 * style — so `** item` becomes `  - item` and sits under the `* parent` above it.
 *
 * Deliberately narrow:
 *   - only lines that START with two or more `*` followed by whitespace;
 *     `**bold** text` has no space after the stars and is left alone;
 *   - single-star `* item` is a valid CommonMark bullet (the bullet-markers
 *     step's business, not this one's);
 *   - never a line the renderer treats as code or HTML.
 *
 * @module converters/ncm/fix/jspwikiBullets
 */

import type { FixStep } from './types.js';
import { buildBlockMap, joinLines } from './blocks.js';

// `[^ \t]`, not `\S`: `\S` rejects a no-break space at the start of the text.
const JSPWIKI_BULLET = /^(\*{2,})[ \t]+([^ \t].*)$/;

export const jspwikiBullets: FixStep = {
  id: 'jspwiki-bullets',
  summary: 'JSPWiki ** bullets became nested - bullets',
  safeOnSave: true,
  apply(body) {
    if (!/^\*{2,}[ \t]/m.test(body)) return { content: body, lines: [] };
    const map = buildBlockMap(body);
    const out = [...map.lines];
    const lines: number[] = [];
    for (let i = 0; i < out.length; i++) {
      if (map.code[i] || map.html[i]) continue;
      const m = JSPWIKI_BULLET.exec(out[i]);
      if (!m) continue;
      out[i] = `${'  '.repeat(m[1].length - 1)}- ${m[2]}`;
      lines.push(i + 1);
    }
    return { content: lines.length ? joinLines(out, map.eols) : body, lines };
  }
};
