/**
 * Read an npm package tarball (.tgz) into memory, refusing anything unsafe
 * (#1830).
 *
 * The runtime image has no npm and no `tar` package (#956), and the format an
 * npm tarball uses is small: gzip around ustar, with pax or GNU long-name
 * headers for long paths. So it is read here with node's zlib and nothing
 * else, and every entry is checked before a byte reaches the disk:
 *
 * - only regular files and directories; a link (symbolic or hard), device or
 *   FIFO refuses the whole tarball, so nothing can point outside the add-on's
 *   folder;
 * - a path that is absolute, holds `..`, a backslash or NUL, or is empty once
 *   npm's leading `package/` folder is removed, refuses the whole tarball;
 * - the unpacked size is capped while gunzipping (`maxOutputLength`), so a
 *   small tarball that inflates enormously stops at the cap instead of filling
 *   memory;
 * - every header's checksum is checked.
 *
 * Refusing the whole tarball, not skipping the bad entry, is deliberate: a
 * package that carries one is not the package its author published through
 * npm, and installing the rest of it would be a guess.
 */

import path from 'path';
import { gunzipSync } from 'zlib';

export interface TarEntry {
  /** POSIX path inside the package, without npm's leading `package/`. */
  path: string;
  /** Present for a file; a directory has none. */
  data?: Buffer;
  /** Whether any execute bit is set (kept so a bin script stays runnable). */
  executable: boolean;
}

const BLOCK = 512;

function readString(buf: Buffer, start: number, length: number): string {
  const slice = buf.subarray(start, start + length);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul === -1 ? slice.length : nul).toString('utf8');
}

function readOctal(buf: Buffer, start: number, length: number, what: string): number {
  if (buf[start] & 0x80) throw new Error(`tarball refused: base-256 ${what} is not supported`);
  const text = readString(buf, start, length).trim();
  if (text === '') return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error(`tarball refused: ${what} '${text}' is not octal`);
  return parseInt(text, 8);
}

function checksumOk(header: Buffer): boolean {
  const stored = readOctal(header, 148, 8, 'checksum');
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i];
  return sum === stored;
}

/** The `path` record of a pax extended header, if it has one. */
function paxPath(data: Buffer): string | undefined {
  let offset = 0;
  let found: string | undefined;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = parseInt(data.subarray(offset, space).toString('utf8'), 10);
    if (!Number.isFinite(length) || length <= 0) throw new Error('tarball refused: malformed pax header');
    const record = data.subarray(space + 1, offset + length - 1).toString('utf8');
    const eq = record.indexOf('=');
    if (eq > 0 && record.slice(0, eq) === 'path') found = record.slice(eq + 1);
    offset += length;
  }
  return found;
}

/**
 * The path as it will be written, relative to the add-on folder: npm's leading
 * folder (normally `package/`) removed, normalised, and refused if it could
 * reach outside.
 */
export function safeEntryPath(raw: string): string {
  if (raw.includes('\0') || raw.includes('\\')) throw new Error(`tarball refused: unsafe path '${raw}'`);
  if (raw.startsWith('/')) throw new Error(`tarball refused: absolute path '${raw}'`);
  const segments = raw.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.includes('..')) throw new Error(`tarball refused: path '${raw}' leaves the package`);
  const rest = segments.slice(1);
  if (rest.length === 0) return '';
  const joined = rest.join('/');
  const normalised = path.posix.normalize(joined);
  if (normalised.startsWith('..') || path.posix.isAbsolute(normalised)) {
    throw new Error(`tarball refused: path '${raw}' leaves the package`);
  }
  return normalised;
}

/**
 * Every entry of the gzipped tarball, checked, in order. Throws on the first
 * thing that is not safe or not understood.
 */
export function readTarGz(tgz: Buffer, maxUnpackedBytes: number): TarEntry[] {
  let tar: Buffer;
  try {
    tar = gunzipSync(tgz, { maxOutputLength: maxUnpackedBytes });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_BUFFER_TOO_LARGE' || /buffer|too large|maxOutputLength/i.test(String(err))) {
      throw new Error(`tarball refused: unpacks to more than ${maxUnpackedBytes} bytes`, { cause: err });
    }
    throw new Error(`tarball refused: not gzip (${err instanceof Error ? err.message : String(err)})`, { cause: err });
  }

  const entries: TarEntry[] = [];
  let offset = 0;
  let longName: string | undefined;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((b) => b === 0)) break; // end of archive
    if (!checksumOk(header)) throw new Error('tarball refused: header checksum mismatch');

    const size = readOctal(header, 124, 12, 'size');
    const type = String.fromCharCode(header[156] || 0x30);
    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error('tarball refused: truncated');
    const data = tar.subarray(dataStart, dataEnd);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    if (type === 'x') { longName = paxPath(data) ?? longName; continue; }
    if (type === 'g') continue; // global pax header: nothing this reader uses
    if (type === 'L') { longName = readString(data, 0, data.length); continue; }

    const prefix = readString(header, 345, 155);
    const name = readString(header, 0, 100);
    const rawPath = longName ?? (prefix ? `${prefix}/${name}` : name);
    longName = undefined;

    if (type !== '0' && type !== '5' && type !== '7') {
      const kind = type === '1' ? 'a hard link' : type === '2' ? 'a symbolic link' : `entry type '${type}'`;
      throw new Error(`tarball refused: '${rawPath}' is ${kind}`);
    }
    const entryPath = safeEntryPath(rawPath);
    if (entryPath === '') continue; // the package/ folder itself
    const mode = readOctal(header, 100, 8, 'mode');
    entries.push(type === '5'
      ? { path: entryPath, executable: false }
      : { path: entryPath, data: Buffer.from(data), executable: (mode & 0o111) !== 0 });
  }
  return entries;
}
