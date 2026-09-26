/**
 * JSPWiki's long plugin form → the short one (#1342).
 *
 * JSPWiki accepts `[{INSERT Name WHERE a=1}]`, with `INSERT` and `WHERE`
 * optional, and a plugin named by its class in the default package,
 * `org.apache.wiki.plugin.Name`. Ours reads the first word as the plugin
 * name, so `[{INSERT CurrentTimePlugin …}]` renders nothing (a plugin called
 * INSERT) and `[{org.apache.wiki.plugin.RecentChangesPlugin}]` is "not
 * found". Both become `[{Name a=1}]`. Only the call's head changes; its
 * parameters are left as written.
 *
 * Deliberately narrow:
 *   - only the `org.apache.wiki.plugin.` package, the one JSPWiki searches by
 *     default; any other package names a plugin we do not have;
 *   - an escaped call, `[[{INSERT …}]`, is an example and stays;
 *   - never in code, an HTML block or an inline code span.
 *
 * @module converters/ncm/fix/jspwikiInsert
 */

import type { FixStep } from './types.js';
import { buildBlockMap, joinLines } from './blocks.js';

/** A code span, or a plugin call's head in the long form. */
const TOKEN = /(`+)|(\[{1,2})\{(INSERT[ \t]+)?(org\.apache\.wiki\.plugin\.)?([A-Za-z]\w*)(?![\w.])([ \t]+WHERE\b)?/g;

function rewrite(line: string): string {
  let out = '';
  let pos = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(line); m; m = TOKEN.exec(line)) {
    if (m[1]) {
      const close = line.indexOf(m[1], m.index + m[1].length);
      if (close !== -1) TOKEN.lastIndex = close + m[1].length;
      continue;
    }
    const [head, , brackets, insert, pkg, name, where] = m;
    if (brackets.length === 2 || (!insert && !pkg && !where)) continue;
    out += `${line.slice(pos, m.index)}[{${name}`;
    pos = m.index + head.length;
  }
  return pos ? out + line.slice(pos) : line;
}

export const jspwikiInsert: FixStep = {
  id: 'jspwiki-insert',
  summary: 'JSPWiki [{INSERT Plugin WHERE …}] calls became [{Plugin …}]',
  apply(body) {
    if (!/\[\{(?:INSERT[ \t]|org\.apache\.wiki\.plugin\.)/.test(body)) return { content: body, lines: [] };
    const map = buildBlockMap(body);
    const out = [...map.lines];
    const lines: number[] = [];
    for (let i = 0; i < out.length; i++) {
      if (map.code[i] || map.html[i]) continue;
      const next = rewrite(out[i]);
      if (next === out[i]) continue;
      out[i] = next;
      lines.push(i + 1);
    }
    return { content: lines.length ? joinLines(out, map.eols) : body, lines };
  }
};
