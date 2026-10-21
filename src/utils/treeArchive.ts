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
 * - __Encrypted under the backup key__ when one is given (#1561, #1876): the
 *   archive is streamed through `backupCrypto.ts` as it is written, and an
 *   extract or a listing given the key decrypts it as it reads. One that is
 *   encrypted is never read without the key, one made under another key is
 *   refused by its fingerprint, and given a key a plain archive is refused:
 *   it is not the one the backup wrote.
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { create as createTar, extract as extractTar, list as listTar, type ReadEntry } from 'tar';
import type { Stats } from 'node:fs';
import { decryptBuffer, decryptStream, encryptBuffer, encryptStream, fileIsEncrypted } from './backupCrypto.js';
import { BACKUP_KEY_ENV } from './backupKey.js';

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
  options: { entries?: string[]; exclude?: (relative: string) => boolean; backupKey?: string } = {}
): Promise<TreeArchiveOutcome> {
  if (existsSync(target)) throw new Error(`${path.basename(target)} already exists; a backup never overwrites one`);
  const outcome: TreeArchiveOutcome = { files: 0, bytes: 0, skipped: [] };
  const entries = (options.entries ?? (existsSync(root) ? readdirSync(root) : []))
    .filter((e) => existsSync(path.join(root, e)))
    .filter((e) => !options.exclude?.(toPosix(e)))
    .sort();
  if (entries.length === 0) {
    writeFileSync(target, options.backupKey ? await encryptBuffer(EMPTY_TAR, options.backupKey) : EMPTY_TAR, { mode: 0o600, flag: 'wx' });
    return outcome;
  }
  try {
    const tarOptions = {
      cwd: root,
      portable: true,
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
    };
    if (options.backupKey) {
      const pack = createTar(tarOptions, entries) as unknown as Readable;
      await pipeline(pack, encryptStream(options.backupKey), createWriteStream(target, { flags: 'wx', mode: 0o600 }));
    } else {
      await createTar({ ...tarOptions, file: target, mode: 0o600 }, entries);
    }
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
  options: { select?: (relative: string) => boolean; strip?: number; backupKey?: string } = {}
): Promise<{ files: number; bytes: number }> {
  if (!existsSync(archive) || !statSync(archive).isFile()) throw new Error(`${path.basename(archive)} is missing`);
  const source = await openArchive(archive, options.backupKey);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  // An archive of an empty folder is only its end blocks, which a strict read refuses.
  if (source.empty) return { files: 0, bytes: 0 };
  const refused: string[] = [];
  let files = 0;
  let bytes = 0;
  try {
    const unpackOptions = {
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
    };
    if (source.into) await source.into(extractTar(unpackOptions) as unknown as Writable);
    else await extractTar({ ...unpackOptions, file: archive });
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

/** An encrypted archive this small is decrypted whole, to recognise an empty one; anything larger streams. */
const SMALL_ENCRYPTED = 64 * 1024;

/**
 * How to read an archive: plain (`stream` absent, tar reads the file), or
 * decrypted as a stream. `empty` when it holds no entry at all. Throws for an
 * encrypted archive with no key or another key, before anything is written.
 */
async function openArchive(archive: string, backupKey: string | undefined): Promise<{ empty: boolean; into?: (sink: Writable) => Promise<void> }> {
  const name = path.basename(archive);
  if (!(await fileIsEncrypted(archive))) {
    // A backup that says its archive is encrypted never takes a plain one in its place.
    if (backupKey) throw new Error(`${name} is not encrypted, but the backup says it is: it was replaced or damaged`);
    const empty = statSync(archive).size === EMPTY_TAR.length && (await readHead(archive, EMPTY_TAR.length)).equals(EMPTY_TAR);
    return { empty };
  }
  if (!backupKey) throw new Error(`${name} is encrypted under a backup key, and none was given to read it (${BACKUP_KEY_ENV} is not set, or the backup does not say the archive is encrypted)`);
  if (statSync(archive).size <= SMALL_ENCRYPTED) {
    let plain: Buffer;
    try {
      plain = await decryptBuffer(await readHead(archive, SMALL_ENCRYPTED), backupKey);
    } catch (err) {
      throw new Error(`${name} could not be read: ${(err as Error).message}`, { cause: err });
    }
    if (plain.length === EMPTY_TAR.length && plain.equals(EMPTY_TAR)) return { empty: true };
    return { empty: false, into: (sink) => pipeline(Readable.from([plain]), sink) };
  }
  // The decrypting stream checks the header (a wrong key is refused) before it passes on any byte.
  return { empty: false, into: (sink) => pipeline(createReadStream(archive), decryptStream(backupKey), sink) };
}

/**
 * Every entry in an archive, plain or encrypted, read as a stream: what a
 * caller checks before extracting. `onEntry` gets each entry's path and type.
 */
export async function listTreeArchive(archive: string, onEntry: (entry: { path: string; type: string }) => void, options: { backupKey?: string } = {}): Promise<void> {
  if (!existsSync(archive) || !statSync(archive).isFile()) throw new Error(`${path.basename(archive)} is missing`);
  const source = await openArchive(archive, options.backupKey);
  if (source.empty) return;
  const listOptions = { onReadEntry: (e: ReadEntry) => onEntry({ path: e.path, type: e.type }) };
  if (source.into) await source.into(listTar(listOptions) as unknown as Writable);
  else await listTar({ ...listOptions, file: archive });
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
