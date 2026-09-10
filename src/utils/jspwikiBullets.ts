/**
 * JSPWiki nested bullets → Markdown nested bullets (#1325).
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
 *   - single-star `* item` is a valid CommonMark bullet and is not touched;
 *   - nothing inside a fenced code block, using the same fence rule as
 *     MarkupParser's Step 0 (#1335): an optionally indented run of three or
 *     more backticks, closed by the same run indented no further than the
 *     opener or 3 spaces.
 *
 * Pure and idempotent: converted lines no longer start with `**`. Line
 * endings are preserved, so a CRLF page stays CRLF.
 *
 * @module utils/jspwikiBullets
 */

export interface JspwikiBulletResult {
  /** The converted text. Identical to the input when nothing matched. */
  content: string;
  /** How many lines were rewritten. */
  changed: number;
  /** 1-based line numbers that were rewritten, in order. */
  lines: number[];
}

const OPEN_FENCE = /^([ \t]*)(`{3,})[ \t]*[^\s`]*[^`]*$/;
const JSPWIKI_BULLET = /^(\*{2,})[ \t]+(\S.*)$/;

export function convertJspwikiBullets(markdown: string): JspwikiBulletResult {
  const parts = markdown.split('\n');
  const lines: number[] = [];
  let closeFence: RegExp | null = null;

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    const cr = raw.endsWith('\r') ? '\r' : '';
    const line = cr ? raw.slice(0, -1) : raw;

    if (closeFence) {
      if (closeFence.test(line)) closeFence = null;
      continue;
    }
    const open = OPEN_FENCE.exec(line);
    if (open) {
      closeFence = new RegExp(`^[ \\t]{0,${Math.max(3, open[1].length)}}${open[2]}\\s*$`);
      continue;
    }

    const m = JSPWIKI_BULLET.exec(line);
    if (!m) continue;
    parts[i] = `${'  '.repeat(m[1].length - 1)}- ${m[2]}${cr}`;
    lines.push(i + 1);
  }

  return { content: lines.length ? parts.join('\n') : markdown, changed: lines.length, lines };
}
