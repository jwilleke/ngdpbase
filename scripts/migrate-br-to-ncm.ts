/**
 * @file scripts/migrate-br-to-ncm.ts
 * @description Replace raw `<br>` in page content with NCM's `\\` (#1037).
 *
 * v4.8.3 refuses a save whose source contains a raw `<br>`: it is embedded
 * HTML, and NCM has its own line break. Existing pages still READ fine — the
 * rule only applies on save — but an author editing one is refused until the
 * tag is converted. This does the conversion ahead of them.
 *
 * `\\` and `<br>` render identically: MarkupParser rewrites `\\` to `<br>` in
 * the markup phase, so this changes source only, never output.
 *
 * SAFETY
 *   - Dry run by default. Nothing is written without --apply.
 *   - Code fences and inline code are left alone. A `<br>` inside backticks is
 *     documentation, renders escaped, and is not what the rule targets.
 *   - Version history under pages/versions/ is never touched; rewriting what
 *     was previously saved would be a lie about the past.
 *   - Writes via temp file + rename, so an interrupted run cannot truncate a
 *     page.
 *   - Frontmatter is not parsed or re-serialised — the body is edited as text,
 *     so key order, quoting and formatting survive untouched.
 *
 * Usage:
 *   node dist/scripts/migrate-br-to-ncm.js <pagesDir>            # dry run
 *   node dist/scripts/migrate-br-to-ncm.js <pagesDir> --apply
 */

import path from 'path';
import { promises as fs } from 'fs';

/** `<br>`, `<br/>`, `<br />`, any case. */
const BR = /<br\s*\/?>/gi;

/**
 * Ranges covered by fenced blocks or inline code, which must not be edited.
 * Returned as [start, end) offsets into the body.
 */
function protectedRanges(body: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const patterns = [
    /^```[\s\S]*?^```/gm,     // fenced blocks
    /^(?: {4}|\t).*$/gm,      // indented code
    /`[^`\n]*`/g              // inline spans
  ];
  for (const pattern of patterns) {
    for (const m of body.matchAll(pattern)) {
      if (m.index !== undefined) ranges.push([m.index, m.index + m[0].length]);
    }
  }
  return ranges;
}

function inProtectedRange(offset: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => offset >= start && offset < end);
}

/** Returns the converted body and how many tags were replaced. */
function convert(body: string): { body: string; count: number } {
  const ranges = protectedRanges(body);
  let count = 0;
  const out = body.replace(BR, (match, offset: number) => {
    if (inProtectedRange(offset, ranges)) return match;
    count++;
    return '\\\\';
  });
  return { body: out, count };
}

async function main(): Promise<void> {
  const [dir, ...flags] = process.argv.slice(2);
  if (!dir) {
    console.error('Usage: node dist/scripts/migrate-br-to-ncm.js <pagesDir> [--apply]');
    process.exit(1);
  }
  const apply = flags.includes('--apply');

  let entries: string[];
  try {
    entries = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'));
  } catch {
    console.error(`Cannot read ${dir}`);
    process.exit(1);
  }

  let changedPages = 0;
  let changedTags = 0;
  const samples: string[] = [];

  for (const entry of entries) {
    const file = path.join(dir, entry);
    const original = await fs.readFile(file, 'utf8');

    // Split frontmatter off by hand rather than parsing it: gray-matter would
    // re-serialise on write and reformat keys that have nothing to do with
    // this migration.
    const match = /^(---\n[\s\S]*?\n---\n)([\s\S]*)$/.exec(original);
    const head = match ? match[1] : '';
    const body = match ? match[2] : original;

    const { body: converted, count } = convert(body);
    if (count === 0) continue;

    changedPages++;
    changedTags += count;
    if (samples.length < 5) {
      const title = /^title:\s*(.+)$/m.exec(head)?.[1] ?? entry;
      samples.push(`   ${title.slice(0, 46).padEnd(46)} ${count} tag(s)`);
    }

    if (apply) {
      const tmp = `${file}.br-migrate-tmp`;
      await fs.writeFile(tmp, head + converted, 'utf8');
      await fs.rename(tmp, file);
    }
  }

  console.log(`${apply ? 'Converted' : 'Would convert'}: ${changedTags} tag(s) across ${changedPages} page(s)`);
  if (samples.length) {
    console.log('Sample:');
    samples.forEach((s) => console.log(s));
  }
  if (!apply && changedPages > 0) {
    console.log('\nDry run — nothing written. Re-run with --apply.');
  }
}

void main().catch((error: unknown) => {
  console.error('Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
