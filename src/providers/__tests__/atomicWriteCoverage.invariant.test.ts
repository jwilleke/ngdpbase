/**
 * #1062 — every page-content write must go through `writeFileAtomic`.
 *
 * Six writes on the page path truncated the live file in place. They were
 * replaced, but nothing stops the next one being added the same way: a raw
 * `fs.writeFile` is the obvious thing to reach for, it works perfectly in
 * development, and the defect only appears when a process dies inside the
 * write. That is not a failure any test of the new code would notice.
 *
 * So this scans the source instead, in the style of #1000's showdown guard and
 * #1058's permission-registry check. It is the same shape of problem: a rule
 * that holds today, enforced only by everyone remembering it.
 *
 * Scoped to the two providers that own page and version files. Other writes —
 * thumbnails, caches, exports, logs — are regenerable, and demanding fsync for
 * a thumbnail would be cost with no benefit.
 */

import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const PROVIDERS = path.resolve(__dirname, '..');

/**
 * Files whose writes are durability-relevant: they hold page content, version
 * snapshots, or the indexes that make either findable.
 */
const GUARDED = ['FileSystemProvider.ts', 'VersioningFileProvider.ts'];

/** Raw write calls that replace a file in place. */
const RAW_WRITE = /\bfs\.(writeFile|writeJson|outputFile|outputJson)\s*\(/g;

function read(file: string): string {
  return fs.readFileSync(path.join(PROVIDERS, file), 'utf8');
}

describe('#1062 — no raw file writes on the page path', () => {
  // Without this, a rename of either file makes every assertion below pass by
  // scanning nothing — the vacuous-green failure #1058 documents.
  test('the guarded files exist and are non-trivial', () => {
    for (const file of GUARDED) {
      const text = read(file);
      expect(text.length, `${file} looks empty`).toBeGreaterThan(1000);
    }
  });

  test('the scan can actually detect a raw write', () => {
    // Proves the regex matches the thing it is meant to catch, so a green run
    // means "none present" rather than "pattern never matched anything".
    const sample = "await fs.writeFile(filePath, data, 'utf8');";
    expect(sample.match(RAW_WRITE)).not.toBeNull();
  });

  test.each(GUARDED)('%s writes only through writeFileAtomic', (file) => {
    const text = read(file);
    const offenders: string[] = [];

    RAW_WRITE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RAW_WRITE.exec(text)) !== null) {
      const line = text.slice(0, match.index).split('\n').length;
      offenders.push(`${file}:${line} — ${match[0]}`);
    }

    expect(
      offenders,
      'Page content and version snapshots must be written with writeFileAtomic ' +
      '(src/utils/atomicWrite.ts). A raw write truncates the live file, so a kill ' +
      'mid-write leaves it neither old nor new (#1062).\n  ' + offenders.join('\n  ')
    ).toEqual([]);
  });

  test.each(GUARDED)('%s imports the helper it is required to use', (file) => {
    // Catches the reverse mistake: someone removes the last call and the import
    // with it, leaving the file passing the scan above while writing nothing
    // atomically at all.
    expect(read(file)).toContain('writeFileAtomic');
  });
});
