/**
 * @file showdownGuard.ts
 * @description Mitigation for the showdown ReDoS, CVE-2024-1899 / GHSA-rmmh-p597-ppvv (#599).
 *
 * `showdown@2.1.0` is the latest release and no patch exists — the advisory
 * reports `first_patched_version: null`, and the registry has not been touched
 * since 2023-07-31. The package is effectively abandoned, so "wait for
 * upstream" is not a strategy.
 *
 * ## What actually triggers it
 *
 * Measured against our own converter options rather than taken from the report:
 *
 * ```text
 * '[]('.repeat(500)    ->     40 ms
 * '[]('.repeat(2000)   ->   2067 ms
 * '[]('.repeat(4000)   ->  16331 ms      <- 12 KB of input, 16 s of blocked event loop
 *
 * '[]()'.repeat(2000)  ->      4 ms      (closed — fine)
 * '[a](b)'.repeat(2000)->     24 ms      (real links — fine)
 * ```
 *
 * The trigger is specifically an **unclosed link opener** — a `](` with no
 * closing `)` after it. Closed and legitimate links are unaffected.
 *
 * This also rules out the input-length cap that #599 proposed as mitigation 2:
 * 12 KB is already catastrophic, and no useful page-size limit sits below that.
 *
 * ## Why escaping is safe
 *
 * An unclosed opener never becomes an anchor — showdown emits it verbatim:
 *
 * ```text
 * '[]('            -> '<p>[](</p>'
 * 'text [x]( more' -> '<p>text [x]( more</p>'
 * ```
 *
 * So replacing the `(` with `&#40;` produces identical rendered output: the
 * browser shows `](` either way. This changes nothing a reader can see, which
 * is the property that makes it safe to apply unconditionally.
 *
 * A `](` with any `)` after it on the same line is left completely alone, so
 * every real link — including ones with nested parens in the URL — is
 * untouched.
 */

/** Entity for `(` — renders identically, but showdown will not try to parse a link. */
const ESCAPED_PAREN = '&#40;';

/**
 * Neutralise unclosed markdown link openers so showdown cannot backtrack on them.
 *
 * Linear in the length of the input: one pass per line, using the position of
 * the last `)` on that line rather than a lookahead. A regex with a negative
 * lookahead (`\]\((?![^)\n]*\))`) would have reintroduced the quadratic scan
 * this exists to prevent — the fix would have carried the bug.
 *
 * @param content - Markdown about to be handed to showdown
 * @returns The same markdown with unclosed `](` openers escaped
 */
export function guardShowdownInput(content: string): string {
  // Fast path: nothing that could open a link.
  if (!content.includes('](')) return content;

  const lines = content.split('\n');
  let changed = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lastClose = line.lastIndexOf(')');
    let out = '';
    let cursor = 0;
    let idx = line.indexOf('](');

    while (idx !== -1) {
      // Closed if any ')' appears after this opener on the line. Conservative
      // by design: when in doubt we leave the text exactly as it was.
      if (lastClose > idx + 1) {
        idx = line.indexOf('](', idx + 2);
        continue;
      }
      out += line.slice(cursor, idx) + ']' + ESCAPED_PAREN;
      cursor = idx + 2;
      changed = true;
      idx = line.indexOf('](', cursor);
    }

    if (cursor > 0) lines[li] = out + line.slice(cursor);
  }

  return changed ? lines.join('\n') : content;
}

/**
 * Count unclosed link openers — used for logging and tests, not for the fix.
 *
 * @param content - Markdown to inspect
 * @returns How many `](` openers have no closing `)` after them on their line
 */
export function countUnclosedLinkOpeners(content: string): number {
  if (!content.includes('](')) return 0;
  let total = 0;
  for (const line of content.split('\n')) {
    const lastClose = line.lastIndexOf(')');
    let idx = line.indexOf('](');
    while (idx !== -1) {
      if (!(lastClose > idx + 1)) total++;
      idx = line.indexOf('](', idx + 2);
    }
  }
  return total;
}
