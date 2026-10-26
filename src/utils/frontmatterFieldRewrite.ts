/**
 * Change a few top-level text fields of a page file's frontmatter, leaving
 * every other byte of the file as it was (#2097).
 *
 * The start-up conversion of page authorship rewrites `author` and `editor`
 * from a username to an identity @id. A save would re-serialise the whole
 * frontmatter (quoting, dates and key order could change) and stamp a new
 * `lastModified`; this replaces only the line of each named field, so the
 * body, every other field and the modified date are byte-identical.
 *
 * Only a field written on one line (`author: jim`, `author: "jim"`) whose
 * value reads back as the expected text is rewritten. Anything else (a
 * field missing, written over several lines, or holding something other
 * than `from`) makes the whole rewrite refuse, returning null, so the caller
 * leaves the file alone and counts it.
 */
import yaml from 'js-yaml';
import { parsePageFrontmatter } from './pageFrontmatter.js';

/** A value safe to write as a plain YAML scalar: no `: `, no `#`, no leading indicator. */
const PLAIN_SCALAR = /^[A-Za-z0-9][A-Za-z0-9._@-]*(?::[A-Za-z0-9._@-]+)*$/;

function yamlText(value: string): string {
  return PLAIN_SCALAR.test(value) && !/^(true|false|null|yes|no|on|off|~)$/i.test(value) && Number.isNaN(Number(value))
    ? value
    : JSON.stringify(value);
}

/**
 * @param raw - The page file as stored: `---`, YAML, `---`, body
 * @param changes - field → `{ from, to }`: the text the field holds now and what it becomes
 * @returns The file with only those lines changed, or null when any field cannot be rewritten that way
 */
export function rewriteFrontmatterFields(raw: string, changes: Record<string, { from: string; to: string }>): string | null {
  const open = /^---\r?\n/.exec(raw);
  if (!open) return null;
  const closeAt = raw.slice(open[0].length).search(/^---[ \t]*(\r?\n|$)/m);
  if (closeAt < 0) return null;
  const blockStart = open[0].length;
  const blockEnd = blockStart + closeAt;
  const lines = raw.slice(blockStart, blockEnd).split('\n');

  const pending = new Map(Object.entries(changes));
  for (let i = 0; i < lines.length && pending.size > 0; i++) {
    const match = /^([A-Za-z0-9_-]+):([ \t]*)(.*?)(\r?)$/.exec(lines[i]);
    if (!match) continue;
    const change = pending.get(match[1]);
    if (!change) continue;
    let current: unknown;
    try {
      current = (yaml.load(`v: ${match[3]}`) as { v?: unknown } | undefined)?.v;
    } catch {
      return null;
    }
    if (current !== change.from) return null;
    lines[i] = `${match[1]}: ${yamlText(change.to)}${match[4]}`;
    pending.delete(match[1]);
  }
  if (pending.size > 0) return null;

  const rewritten = raw.slice(0, blockStart) + lines.join('\n') + raw.slice(blockEnd);
  // The check that nothing else moved: the body is the same text, and each
  // field reads back as its new value.
  const before = parsePageFrontmatter(raw);
  const after = parsePageFrontmatter(rewritten);
  if (after.content !== before.content) return null;
  for (const [field, change] of Object.entries(changes)) {
    if (after.data[field] !== change.to) return null;
  }
  return rewritten;
}
