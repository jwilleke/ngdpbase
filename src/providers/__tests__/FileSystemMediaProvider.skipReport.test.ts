/**
 * #1056 — the scanner records WHICH files it passed over, not just how many.
 *
 * #814 reported media as "often not discovered". Triage found zero indexing
 * bugs: every missing file was correctly skipped, by one of six rules, four of
 * which counted nothing at all. A file could therefore be absent for six
 * reasons while the scan summary read `excluded=0`, which is worse than no
 * report — it says "nothing was dropped" while a directory-level ignore
 * silently removed a whole tree.
 *
 * These tests use a REAL temporary directory rather than a mocked `fs-extra`.
 * The behaviour under test is the classification of real dirents — dotfiles,
 * extensions, directory recursion, depth — and a mocked filesystem would only
 * prove that the mock returns what the test told it to.
 */

vi.unmock('../FileSystemMediaProvider');

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';

vi.mock('exiftool-vendored', () => ({
  ExifTool: class MockExifTool {
    async read(_path: string) { return {}; }
    async end() {}
  },
  ExifDateTime: class ExifDateTime {}
}));

vi.mock('sharp', () => ({ default: () => ({}) }));

import FileSystemMediaProvider from '../FileSystemMediaProvider';
import type { SkippedEntry, MediaSkipReport } from '../../utils/explainMediaPath';

type ProviderInternals = {
  collectFilePaths: (dir: string, depth: number) => Promise<{
    files: string[];
    skipped: SkippedEntry[];
    dirErrors: number;
  }>;
};

/**
 * A real scratch tree per test. Created under the OS temp dir and removed in
 * `afterEach` by its own absolute path — never a `data/` or project directory,
 * per the repo's teardown rule.
 */
let root: string;
let provider: FileSystemMediaProvider;

const internals = () => provider as unknown as ProviderInternals;

function makeProvider(overrides: Record<string, unknown> = {}): FileSystemMediaProvider {
  return new FileSystemMediaProvider({
    folders: [path.join(root, 'store')],
    ignoreDirs: ['@eaDir'],
    maxDepth: 5,
    indexFile: path.join(root, 'index', 'media-index.json'),
    thumbnailDir: path.join(root, 'thumbs'),
    thumbnailSizes: '300x300',
    metadataPriority: ['EXIF', 'IPTC', 'XMP'],
    readonly: true,
    extensions: new Set(['jpg']),
    ...overrides
  });
}

/** Reason for `name`, or undefined when it was not skipped. */
function reasonFor(skipped: SkippedEntry[], name: string): string | undefined {
  return skipped.find(s => path.basename(s.path) === name)?.reason;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngdpbase-skip-'));
  await fs.ensureDir(path.join(root, 'store'));
  provider = makeProvider();
});

afterEach(async () => {
  await fs.remove(root);
});

describe('#1056 — one skip reason per rule', () => {
  it('records an unsupported extension, naming the extension that lost', async () => {
    const store = path.join(root, 'store');
    await fs.writeFile(path.join(store, 'keep.jpg'), 'x');
    await fs.writeFile(path.join(store, 'notes.txt'), 'x');

    const { files, skipped } = await internals().collectFilePaths(store, 0);

    expect(files.map(f => path.basename(f))).toEqual(['keep.jpg']);
    expect(reasonFor(skipped, 'notes.txt')).toBe('extension');
    expect(skipped.find(s => path.basename(s.path) === 'notes.txt')?.matched).toBe('txt');
  });

  it('records a file with no extension at all', async () => {
    const store = path.join(root, 'store');
    await fs.writeFile(path.join(store, 'README'), 'x');

    const { skipped } = await internals().collectFilePaths(store, 0);

    const entry = skipped.find(s => path.basename(s.path) === 'README');
    expect(entry?.reason).toBe('extension');
    // '(none)' rather than an empty string, so the report never renders a blank
    // cell that reads as missing data.
    expect(entry?.matched).toBe('(none)');
  });

  it('records a dotfile', async () => {
    const store = path.join(root, 'store');
    await fs.writeFile(path.join(store, '.DS_Store'), 'x');

    const { skipped } = await internals().collectFilePaths(store, 0);

    expect(reasonFor(skipped, '.DS_Store')).toBe('dotfile');
  });

  it('does NOT report .ngdpbaseignore itself — it is machinery, not a dropped file', async () => {
    const store = path.join(root, 'store');
    await fs.writeFile(path.join(store, '.ngdpbaseignore'), 'private*\n');

    const { skipped } = await internals().collectFilePaths(store, 0);

    expect(skipped).toEqual([]);
  });

  it('records an ignoreDirs match against the directory, not its contents', async () => {
    const store = path.join(root, 'store');
    const thumbs = path.join(store, '@eaDir');
    await fs.ensureDir(thumbs);
    // Three eligible files inside. The whole point is that they are NOT
    // enumerated: the operator needs to know the directory was skipped, and a
    // report that expands a large ignored tree is unreadable.
    for (const n of ['a.jpg', 'b.jpg', 'c.jpg']) await fs.writeFile(path.join(thumbs, n), 'x');

    const { files, skipped } = await internals().collectFilePaths(store, 0);

    expect(files).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('ignore-dir');
    expect(skipped[0].isDirectory).toBe(true);
    expect(skipped[0].path).toBe(thumbs);
    expect(skipped[0].matched).toBe('@eaDir');
  });

  it('records a .ngdpbaseignore file pattern, naming the pattern', async () => {
    const store = path.join(root, 'store');
    await fs.writeFile(path.join(store, '.ngdpbaseignore'), 'private*\n');
    await fs.writeFile(path.join(store, 'private-shot.jpg'), 'x');
    await fs.writeFile(path.join(store, 'public.jpg'), 'x');

    const { files, skipped } = await internals().collectFilePaths(store, 0);

    expect(files.map(f => path.basename(f))).toEqual(['public.jpg']);
    const entry = skipped.find(s => path.basename(s.path) === 'private-shot.jpg');
    expect(entry?.reason).toBe('ignore-pattern');
    expect(entry?.matched).toBe('private*');
  });

  it('records a .ngdpbaseignore directory pattern once, not per contained file', async () => {
    const store = path.join(root, 'store');
    await fs.writeFile(path.join(store, '.ngdpbaseignore'), 'raw\n');
    const raw = path.join(store, 'raw');
    await fs.ensureDir(raw);
    for (const n of ['a.jpg', 'b.jpg']) await fs.writeFile(path.join(raw, n), 'x');

    const { files, skipped } = await internals().collectFilePaths(store, 0);

    expect(files).toEqual([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('ignore-pattern');
    expect(skipped[0].isDirectory).toBe(true);
    expect(skipped[0].path).toBe(raw);
  });

  it('records a maxDepth cut-off against the directory that was never walked', async () => {
    provider = makeProvider({ maxDepth: 1 });
    const store = path.join(root, 'store');
    const deep = path.join(store, 'a', 'b');
    await fs.ensureDir(deep);
    await fs.writeFile(path.join(store, 'a', 'shallow.jpg'), 'x');
    await fs.writeFile(path.join(deep, 'deep.jpg'), 'x');

    const { files, skipped } = await internals().collectFilePaths(store, 0);

    expect(files.map(f => path.basename(f))).toEqual(['shallow.jpg']);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('max-depth');
    expect(skipped[0].isDirectory).toBe(true);
    expect(skipped[0].path).toBe(deep);
  });

  it('reports the reason the scanner actually reached, when several rules match', async () => {
    // A dotfile with an unsupported extension is a dotfile: that is the test
    // the scanner reaches first. Reporting `extension` here would send the
    // operator to change the extension list, which would not help.
    const store = path.join(root, 'store');
    await fs.writeFile(path.join(store, '.notes.txt'), 'x');

    const { skipped } = await internals().collectFilePaths(store, 0);

    expect(skipped[0].reason).toBe('dotfile');
  });
});

describe('#1056 — the persisted report', () => {
  it('writes totalSkipped, the list, and truncated=false after a scan', async () => {
    const store = path.join(root, 'store');
    await fs.writeFile(path.join(store, 'notes.txt'), 'x');
    await fs.writeFile(path.join(store, '.DS_Store'), 'x');

    const result = await provider.scan();

    // The integration invariant from the issue: the summary count and the
    // retained list cannot disagree, which is exactly what `excluded` did.
    expect(result.excluded).toBe(2);
    expect(result.skipped).toHaveLength(2);
    expect(result.skippedTruncated).toBe(false);

    const report = (await provider.getSkipReport()) as MediaSkipReport;
    expect(report.totalSkipped).toBe(2);
    expect(report.truncated).toBe(false);
    expect(report.skipped.map(s => s.reason).sort()).toEqual(['dotfile', 'extension']);
    expect(report.scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('counts by reason and by matched value', async () => {
    const store = path.join(root, 'store');
    await fs.writeFile(path.join(store, 'a.txt'), 'x');
    await fs.writeFile(path.join(store, 'b.txt'), 'x');
    await fs.writeFile(path.join(store, 'c.xmp'), 'x');
    await fs.writeFile(path.join(store, '.DS_Store'), 'x');

    await provider.scan();
    const report = (await provider.getSkipReport()) as MediaSkipReport;

    expect(report.byReason).toEqual({ extension: 3, dotfile: 1 });
    // Keyed by reason so an extension named like a directory cannot collide.
    expect(report.byMatched['extension:txt']).toBe(2);
    expect(report.byMatched['extension:xmp']).toBe(1);
    // Dotfiles carry no `matched`, so they contribute no key rather than an
    // empty-string one.
    expect(Object.keys(report.byMatched)).toEqual(['extension:txt', 'extension:xmp']);
  });

  it('caps the list but keeps the count exact, and says so', async () => {
    const store = path.join(root, 'store');
    const many: SkippedEntry[] = Array.from({ length: 1500 }, (_, i) => ({
      path: path.join(store, `file-${i}.txt`),
      reason: 'extension' as const,
      matched: 'txt'
    }));
    internals().collectFilePaths = async () => ({ files: [], skipped: many, dirErrors: 0 });

    const result = await provider.scan();

    // A capped list that reported a capped count would understate the problem
    // by 500 files while looking internally consistent.
    expect(result.excluded).toBe(1500);
    expect(result.skipped).toHaveLength(1000);
    expect(result.skippedTruncated).toBe(true);

    const report = (await provider.getSkipReport()) as MediaSkipReport;
    expect(report.totalSkipped).toBe(1500);
    expect(report.skipped).toHaveLength(1000);
    expect(report.truncated).toBe(true);
    // Counts are tallied BEFORE the cap. Tallying after would report 1000 here
    // and quietly lose 500 files — the exact failure `excluded` already had.
    expect(report.byReason.extension).toBe(1500);
    expect(report.byMatched['extension:txt']).toBe(1500);
  });

  it('returns null before any scan has run, rather than an empty report', async () => {
    // An empty report is indistinguishable from "nothing was skipped", which is
    // the false-reassurance this whole issue exists to remove.
    expect(await provider.getSkipReport()).toBeNull();
  });

  it('overwrites the previous report rather than accumulating history', async () => {
    const store = path.join(root, 'store');
    const stray = path.join(store, 'notes.txt');
    await fs.writeFile(stray, 'x');
    await provider.scan();
    expect((await provider.getSkipReport())?.totalSkipped).toBe(1);

    // The operator fixes the cause. The next scan must not still list it.
    await fs.remove(stray);
    await provider.scan();

    const report = (await provider.getSkipReport()) as MediaSkipReport;
    expect(report.totalSkipped).toBe(0);
    expect(report.skipped).toEqual([]);
    expect(report.byReason).toEqual({});
  });
});
