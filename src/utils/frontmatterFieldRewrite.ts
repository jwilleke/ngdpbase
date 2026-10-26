/**
 * Change a few top-level text fields of a page file's frontmatter, and some
 * entries of its access lists, leaving every other byte of the file as it was
 * (#2097).
 *
 * The start-up conversion of page authorship rewrites `author` and `editor`
 * from a username to an identity @id, and the user entries of `audience` and
 * `access[action]` the same way. A save would re-serialise the whole
 * frontmatter (quoting, dates and key order could change) and stamp a new
 * `lastModified`; this replaces only the lines (or list items) that change,
 * so the body, every other field and the modified date are byte-identical.
 *
 * Only a field written on one line (`author: jim`, `author: "jim"`) whose
 * value reads back as the expected text is rewritten; a list entry is
 * rewritten as a block item (`  - jim`) or inside a one-line flow list
 * (`audience: [jim, editor]`). Anything else (a field missing, written over
 * several lines, a flow mapping, a comment on a flow list) makes the whole
 * rewrite refuse, returning null, so the caller leaves the file alone and
 * counts it. The result is checked by reading it back: the body, and every
 * field but the ones changed, must be exactly as before.
 */
import yaml from 'js-yaml';
import { parsePageFrontmatter } from './pageFrontmatter.js';

/** A value safe to write as a plain YAML scalar: no `: `, no `#`, no leading indicator. */
const PLAIN_SCALAR = /^[A-Za-z0-9][A-Za-z0-9._@-]*(?::[A-Za-z0-9._@-]+)*$/;

/** The frontmatter lists whose entries name principals (#2097): `audience`, and each action of `access`. */
const LIST_FIELDS = ['audience', 'access'] as const;

function yamlText(value: string): string {
  return PLAIN_SCALAR.test(value) && !/^(true|false|null|yes|no|on|off|~)$/i.test(value) && Number.isNaN(Number(value))
    ? value
    : JSON.stringify(value);
}

function readScalar(text: string): unknown {
  return (yaml.load(`v: ${text}`) as { v?: unknown } | undefined)?.v;
}

/** A one-line flow list with its entries mapped, or null when it cannot be rewritten that way. */
function mapFlowList(text: string, entries: ReadonlyMap<string, string>): string | null {
  if (text.includes('#')) return null;
  const parsed = readScalar(text);
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string')) return null;
  return `[${(parsed as string[]).map((v) => yamlText(entries.get(v) ?? v)).join(', ')}]`;
}

function mapEntries(value: unknown, entries: ReadonlyMap<string, string>): unknown {
  return Array.isArray(value) ? (value as unknown[]).map((v): unknown => (typeof v === 'string' ? entries.get(v) ?? v : v)) : value;
}

/**
 * @param input - The page file as stored: `---`, YAML, `---`, body (a UTF-8 byte-order mark is kept)
 * @param changes - field → `{ from, to }`: the text the field holds now and what it becomes
 * @param entries - access-list entry → what it becomes, for `audience` and every `access[action]`
 * @returns The file with only those lines changed, or null when any change cannot be made that way
 */
export function rewriteFrontmatterFields(
  input: string,
  changes: Record<string, { from: string; to: string }>,
  entries: ReadonlyMap<string, string> = new Map()
): string | null {
  // A file saved with a UTF-8 byte-order mark: rewritten without it, and given it back.
  const bom = input.startsWith('﻿') ? '﻿' : '';
  const raw = bom ? input.slice(1) : input;
  const open = /^---\r?\n/.exec(raw);
  if (!open) return null;
  const closeAt = raw.slice(open[0].length).search(/^---[ \t]*(\r?\n|$)/m);
  if (closeAt < 0) return null;
  const blockStart = open[0].length;
  const blockEnd = blockStart + closeAt;
  const lines = raw.slice(blockStart, blockEnd).split('\n');

  const pending = new Map(Object.entries(changes));
  const mapsEntries = entries.size > 0;
  let top: string | null = null;
  try {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const topKey = /^([A-Za-z0-9_-]+):([ \t]*)(.*?)(\r?)$/.exec(line);
      if (topKey) {
        top = topKey[1];
        const change = pending.get(top);
        if (change) {
          if (readScalar(topKey[3]) !== change.from) return null;
          lines[i] = `${top}: ${yamlText(change.to)}${topKey[4]}`;
          pending.delete(top);
          continue;
        }
        if (mapsEntries && top === 'audience' && topKey[3].startsWith('[')) {
          const mapped = mapFlowList(topKey[3], entries);
          if (mapped === null) return null;
          lines[i] = `${top}: ${mapped}${topKey[4]}`;
        } else if (mapsEntries && top === 'access' && topKey[3].trim() && !topKey[3].trim().startsWith('#')) {
          return null; // a flow mapping: not rewritten line by line
        }
        continue;
      }
      if (!mapsEntries || (top !== 'audience' && top !== 'access')) continue;
      const item = /^(\s+-\s+)(.*?)(\r?)$/.exec(line);
      if (item) {
        const value = readScalar(item[2]);
        if (typeof value === 'string' && entries.has(value)) lines[i] = `${item[1]}${yamlText(entries.get(value) as string)}${item[3]}`;
        continue;
      }
      const action = /^(\s+)([A-Za-z0-9_-]+):([ \t]*)(.*?)(\r?)$/.exec(line);
      if (action && top === 'access' && action[4].startsWith('[')) {
        const mapped = mapFlowList(action[4], entries);
        if (mapped === null) return null;
        lines[i] = `${action[1]}${action[2]}: ${mapped}${action[5]}`;
      }
    }
  } catch {
    return null;
  }
  if (pending.size > 0) return null;

  const rewritten = raw.slice(0, blockStart) + lines.join('\n') + raw.slice(blockEnd);
  // The check that nothing else moved: the body is the same text, and every
  // field reads back as it was, but for the ones changed, which read back as
  // their new values.
  const before = parsePageFrontmatter(raw);
  const after = parsePageFrontmatter(rewritten);
  if (after.content !== before.content) return null;
  const expected: Record<string, unknown> = { ...before.data };
  for (const [field, change] of Object.entries(changes)) expected[field] = change.to;
  if (mapsEntries) {
    for (const field of LIST_FIELDS) {
      if (field === 'audience') expected.audience = mapEntries(expected.audience, entries);
      else if (expected.access && typeof expected.access === 'object' && !Array.isArray(expected.access)) {
        expected.access = Object.fromEntries(Object.entries(expected.access as Record<string, unknown>).map(([k, v]) => [k, mapEntries(v, entries)]));
      }
    }
  }
  if (JSON.stringify(after.data) !== JSON.stringify(expected)) return null;
  return bom + rewritten;
}
