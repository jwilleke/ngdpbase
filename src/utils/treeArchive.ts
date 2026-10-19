/**
 * A folder of a site's files as one `.tar` beside a backup document, and back
 * (#1876).
 *
 * The backup document is JSON built in memory, so file contents never go in
 * it: a manager whose data is files (attachments, role and person records,
 * footnotes, comments) writes them here instead, as `<stem>.<part>.tar`
 * beside the document, the way DatabaseManager writes `<stem>.<name>.db`.
 * BackupManager prunes and downloads these with the document.
 *
 * - __Streamed__ both ways: each file is read from disk as the archive is
 *   written, and written to disk as it is read, so a file's size never
 *   becomes memory.
 * - __Bytes as stored__: nothing is decoded, so a sealed vault file stays the
 *   sealed bytes it is on disk.
 * - __Only files and folders__: a symbolic link or any other kind of entry is
 *   left out of a backup, and named; one in an archive refuses the extract.
 * - __Paths are data__: an extract refuses an entry that is absolute or
 *   climbs out of its folder (`strict`), never writing outside `dest`.
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { create as createTar, extract as extractTar, type ReadEntry } from 'tar';
import type { Stats } from 'node:fs';

export interface TreeArchiveOutcome {
  /** Regular files written. */
  files: number;
  /** Their bytes. */
  bytes: number;
  /** Entries left out because they are not a file or a folder (a symbolic link), relative to the root. */
  skipped: string[];
}

/** Two 512-byte zero blocks: a tar with no entries. */
const EMPTY_TAR = Buffer.alloc(1024);

/**
 * Write `entries` (paths relative to `root`; default: everything in it) into
 * `target`, streamed. `exclude` leaves out a path relative to `root`, in
 * posix form. A missing `root` writes an empty archive. Never overwrites.
 */
export async function writeTreeArchive(
  target: string,
  root: string,
  options: { entries?: string[]; exclude?: (relative: string) => boolean } = {}
): Promise<TreeArchiveOutcome> {
  if (existsSync(target)) throw new Error(`${path.basename(target)} already exists; a backup never overwrites one`);
  const outcome: TreeArchiveOutcome = { files: 0, bytes: 0, skipped: [] };
  const entries = (options.entries ?? (existsSync(root) ? readdirSync(root) : []))
    .filter((e) => existsSync(path.join(root, e)))
    .filter((e) => !options.exclude?.(toPosix(e)))
    .sort();
  if (entries.length === 0) {
    writeFileSync(target, EMPTY_TAR, { mode: 0o600, flag: 'wx' });
    return outcome;
  }
  try {
    await createTar({
      file: target,
      cwd: root,
      portable: true,
      mode: 0o600,
      filter: (p: string, stat: Stats | ReadEntry) => {
        const relative = toPosix(path.normalize(p));
        if (options.exclude?.(relative)) return false;
        const s = stat as Stats;
        if (s.isDirectory()) return true;
        if (!s.isFile()) {
          outcome.skipped.push(relative);
          return false;
        }
        outcome.files++;
        outcome.bytes += s.size;
        return true;
      }
    }, entries);
  } catch (err) {
    rmSync(target, { force: true });
    throw err;
  }
  return outcome;
}

/**
 * Extract `archive` into `dest`, which is emptied first, streamed.
 * `select(relative)` picks the entries to extract (default: all). Refuses —
 * removing `dest` — an entry that is not a file or a folder, an absolute
 * path, or one that climbs out (`..`).
 */
export async function extractTreeArchive(
  archive: string,
  dest: string,
  options: { select?: (relative: string) => boolean; strip?: number } = {}
): Promise<{ files: number; bytes: number }> {
  if (!existsSync(archive) || !statSync(archive).isFile()) throw new Error(`${path.basename(archive)} is missing`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  // An archive of an empty folder is only its end blocks, which a strict read refuses.
  if (statSync(archive).size === EMPTY_TAR.length && (await readHead(archive, EMPTY_TAR.length)).equals(EMPTY_TAR)) return { files: 0, bytes: 0 };
  const refused: string[] = [];
  let files = 0;
  let bytes = 0;
  try {
    await extractTar({
      file: archive,
      cwd: dest,
      strict: true,
      preservePaths: false,
      preserveOwner: false,
      ...(options.strip ? { strip: options.strip } : {}),
      filter: (p: string, entry: Stats | ReadEntry) => {
        const e = entry as ReadEntry;
        const relative = toPosix(p).replace(/^\.\//, '');
        if (options.select && !options.select(relative)) return false;
        if (!['File', 'OldFile', 'ContiguousFile', 'Directory'].includes(e.type)) {
          refused.push(`${relative} (${e.type})`);
          return false;
        }
        if (e.type !== 'Directory') {
          files++;
          bytes += e.size ?? 0;
        }
        return true;
      }
    });
  } catch (err) {
    rmSync(dest, { recursive: true, force: true });
    throw new Error(`${path.basename(archive)} could not be read: ${(err as Error).message}`, { cause: err });
  }
  if (refused.length > 0) {
    rmSync(dest, { recursive: true, force: true });
    throw new Error(`${path.basename(archive)} holds entries that are not files or folders: ${refused.slice(0, 5).join(', ')}`);
  }
  return { files, bytes };
}

/** The first `n` bytes of a file, read without reading the rest. */
export async function readHead(file: string, n: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  if (n <= 0) return Buffer.alloc(0);
  for await (const chunk of createReadStream(file, { start: 0, end: n - 1 })) {
    chunks.push(chunk as Buffer);
    total += (chunk as Buffer).length;
  }
  return Buffer.concat(chunks, total);
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
