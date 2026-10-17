/**
 * Reading and unpacking an add-on's npm tarball safely (#1830), with `tar`.
 *
 * Every entry is checked in a reading pass before a byte reaches the disk:
 *
 * - only regular files and directories; a link (symbolic or hard), device or
 *   FIFO refuses the whole tarball, so nothing can point outside the add-on's
 *   folder;
 * - a path that is absolute, holds `..`, a backslash or NUL, or is empty once
 *   npm's leading `package/` folder is removed, refuses the whole tarball;
 * - the unpacked size is counted as the entries are read and the read is
 *   aborted at the cap, so a tarball that inflates enormously stops there;
 * - tar runs `strict`, so a malformed header is an error, not a warning.
 *
 * Unpacking then runs `tar.x` into a fresh staging folder (with the same type
 * filter, `strip: 1`, no preserved paths, no preserved owners), which is
 * renamed into place only when it is complete.
 *
 * Refusing the whole tarball, not skipping the bad entry, is deliberate: a
 * package that carries one is not the package its author published, and
 * installing the rest of it would be a guess.
 */

import fs from 'fs-extra';
import path from 'path';
import { Parser, extract, type ReadEntry } from 'tar';

/** A file in the package, by its path without npm's leading `package/`. */
export type TarballFiles = Map<string, Buffer>;

const ALLOWED_TYPES = new Set(['File', 'OldFile', 'ContiguousFile', 'Directory']);

/**
 * The path as it will be written, relative to the add-on folder: npm's leading
 * folder (normally `package/`) removed, and refused if it could reach outside.
 */
export function safeEntryPath(raw: string): string {
  if (raw.includes('\0') || raw.includes('\\')) throw new Error(`tarball refused: unsafe path '${raw}'`);
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) throw new Error(`tarball refused: absolute path '${raw}'`);
  const segments = raw.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.includes('..')) throw new Error(`tarball refused: path '${raw}' leaves the package`);
  return segments.slice(1).join('/');
}

function describe(entry: ReadEntry): string {
  if (entry.type === 'SymbolicLink') return 'a symbolic link';
  if (entry.type === 'Link') return 'a hard link';
  return `entry type '${entry.type}'`;
}

/**
 * Read and check every entry of the gzipped tarball. Resolves to its files;
 * rejects on the first thing that is not safe or not understood.
 */
export function readTarball(tgz: Buffer, maxUnpackedBytes: number): Promise<TarballFiles> {
  return new Promise((resolve, reject) => {
    const files: TarballFiles = new Map();
    let total = 0;
    let failure: Error | null = null;
    const parser = new Parser({
      strict: true,
      onReadEntry: (entry: ReadEntry) => {
        try {
          if (failure) { entry.resume(); return; }
          if (!ALLOWED_TYPES.has(entry.type)) throw new Error(`tarball refused: '${entry.path}' is ${describe(entry)}`);
          const rel = safeEntryPath(entry.path);
          total += entry.size;
          if (total > maxUnpackedBytes) throw new Error(`tarball refused: unpacks to more than ${maxUnpackedBytes} bytes`);
          if (entry.type === 'Directory' || rel === '') { entry.resume(); return; }
          const chunks: Buffer[] = [];
          entry.on('data', (c: Buffer) => chunks.push(c));
          entry.on('end', () => files.set(rel, Buffer.concat(chunks)));
        } catch (err) {
          failure = err instanceof Error ? err : new Error(String(err));
          entry.resume();
          parser.abort(failure);
        }
      }
    });
    parser.on('error', (err: Error) => { failure ??= new Error(`tarball refused: ${err.message}`, { cause: err }); });
    parser.on('abort', () => reject(failure ?? new Error('tarball refused')));
    parser.on('end', () => (failure ? reject(failure) : resolve(files)));
    parser.end(tgz);
  });
}

/**
 * Unpack the (already checked) tarball at `tgzPath` into `target`: into a
 * fresh staging folder beside it, then swapped in.
 */
export async function unpackTarball(tgzPath: string, target: string): Promise<void> {
  const parent = path.dirname(target);
  await fs.ensureDir(parent);
  const staging = await fs.mkdtemp(path.join(parent, `.staging-${path.basename(target)}-`));
  try {
    await extract({
      file: tgzPath,
      cwd: staging,
      strip: 1,
      strict: true,
      preservePaths: false,
      preserveOwner: false,
      noMtime: true,
      filter: (_p, entry) => ALLOWED_TYPES.has((entry as ReadEntry).type)
    });
    await fs.remove(target);
    await fs.rename(staging, target);
  } catch (err) {
    await fs.remove(staging).catch(() => {});
    throw err;
  }
}

/** Whether `dir` holds exactly `files`, byte for byte, and nothing else (no links). */
export async function folderMatches(dir: string, files: TarballFiles): Promise<boolean> {
  if (!(await fs.pathExists(dir))) return false;
  let seen = 0;
  const walk = async (rel: string): Promise<boolean> => {
    for (const d of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${d.name}` : d.name;
      if (d.isSymbolicLink()) return false;
      if (d.isDirectory()) { if (!(await walk(p))) return false; continue; }
      const expected = files.get(p);
      if (!expected || !expected.equals(await fs.readFile(path.join(dir, p)))) return false;
      seen++;
    }
    return true;
  };
  return (await walk('')) && seen === files.size;
}
