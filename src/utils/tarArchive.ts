/**
 * Writing a tar archive from bytes already in hand (#1387).
 *
 * Both things that package a private store need this: a user's takeout, and an
 * instance backup's copy of the private tree.
 *
 * ## Why this is written here rather than taken from a library
 *
 * `node-tar` builds an archive by reading FILES: `Pack.add(path)` takes a path,
 * and there is no entry-from-memory API. Using it would mean writing a store's
 * decrypted pages to a temporary directory first — plaintext at rest on the one
 * machine whose job is to keep them sealed, and a partial failure would leave
 * it there. A takeout is built in memory and streamed, so the packer has to
 * accept bytes.
 *
 * The format is ustar (POSIX.1-1988), which every `tar` and every archive tool
 * reads. It is a 512-byte header per entry, the data padded to 512, and two
 * zero blocks at the end. The tests verify the output by extracting it with the
 * system `tar`, so this is checked against a real implementation rather than
 * against its own assumptions.
 *
 * Paths longer than the header's 100-byte name field are handled the way GNU
 * and bsdtar do: split across `prefix` + `name` when a directory boundary
 * allows, and otherwise carried in a PAX extended header. Page titles are real
 * titles in a takeout, so long paths are ordinary here, not an edge case.
 */

import { gzip as gzipCb } from 'zlib';
import { promisify } from 'util';

const gzip = promisify(gzipCb);

const BLOCK = 512;

/** One file to put in the archive. */
export type TarEntry = {
  /** Path inside the archive, `/`-separated, no leading slash. */
  path: string;
  bytes: Buffer;
  /** Defaults to now. Stored with second resolution, as tar does. */
  mtime?: Date;
  /** Defaults to 0o644. */
  mode?: number;
};

/** Left-aligned NUL-padded string field. */
function writeString(block: Buffer, value: string, offset: number, length: number): void {
  block.write(value, offset, length - 1, 'utf8');
}

/** Octal numeric field: zero-padded, NUL-terminated, as ustar specifies. */
function writeOctal(block: Buffer, value: number, offset: number, length: number): void {
  const digits = Math.max(0, Math.trunc(value)).toString(8);
  block.write(digits.padStart(length - 1, '0') + '\0', offset, length, 'ascii');
}

/**
 * Split a path into ustar's `prefix` (155) and `name` (100) fields.
 * Null when it cannot be split at a `/` such that both halves fit — the caller
 * then writes a PAX header instead.
 */
function splitPath(p: string): { name: string; prefix: string } | null {
  const bytes = Buffer.byteLength(p, 'utf8');
  if (bytes <= 100) return { name: p, prefix: '' };

  // The split must fall on a separator, and both halves must fit.
  for (let i = p.indexOf('/'); i !== -1; i = p.indexOf('/', i + 1)) {
    const prefix = p.slice(0, i);
    const name = p.slice(i + 1);
    if (Buffer.byteLength(prefix, 'utf8') <= 155 && Buffer.byteLength(name, 'utf8') <= 100) {
      return { name, prefix };
    }
  }
  return null;
}

/** One 512-byte ustar header, with its checksum filled in. */
function header(args: {
  path: string;
  prefix: string;
  size: number;
  mtime: Date;
  mode: number;
  typeflag: '0' | 'x';
}): Buffer {
  const block = Buffer.alloc(BLOCK);

  writeString(block, args.path, 0, 100);
  writeOctal(block, args.mode & 0o7777, 100, 8);
  writeOctal(block, 0, 108, 8);                                  // uid: nobody in particular
  writeOctal(block, 0, 116, 8);                                  // gid
  writeOctal(block, args.size, 124, 12);
  writeOctal(block, Math.floor(args.mtime.getTime() / 1000), 136, 12);
  block.write('        ', 148, 8, 'ascii');                      // checksum placeholder: spaces
  block.write(args.typeflag, 156, 1, 'ascii');
  // 157–256 linkname stays zero.
  block.write('ustar\0', 257, 6, 'ascii');
  block.write('00', 263, 2, 'ascii');
  // uname/gname are left empty: a takeout carries no account names from the
  // server, and an extracted file should belong to whoever extracts it.
  writeOctal(block, 0, 329, 8);                                  // devmajor
  writeOctal(block, 0, 337, 8);                                  // devminor
  writeString(block, args.prefix, 345, 155);

  // The checksum is the unsigned sum of every byte, with the field read as spaces.
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');

  return block;
}

/** Pad `bytes` up to the next 512-byte boundary. */
function padding(size: number): Buffer {
  const remainder = size % BLOCK;
  return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - remainder);
}

/** A PAX extended header carrying the real path, for a path no field can hold. */
function paxRecords(path: string, mtime: Date): Buffer {
  // Each record is "<len> <key>=<value>\n", where <len> counts ITSELF. That is
  // circular — adding a digit to the length can push the length to another
  // digit — so it is solved by iterating until the written length agrees with
  // the number of digits it takes to write.
  const record = (key: string, value: string): string => {
    const body = ` ${key}=${value}\n`;
    const bodyLength = Buffer.byteLength(body, 'utf8');
    let digits = 1;
    for (;;) {
      const total = digits + bodyLength;
      if (String(total).length === digits) return `${total}${body}`;
      digits = String(total).length;
    }
  };

  const data = Buffer.from(record('path', path), 'utf8');
  const head = header({
    // The name of a PAX header is conventional and ignored by extractors.
    path: '././@PaxHeader',
    prefix: '',
    size: data.length,
    mtime,
    mode: 0o644,
    typeflag: 'x'
  });
  return Buffer.concat([head, data, padding(data.length)]);
}

/**
 * A tar archive of the given entries, as one Buffer.
 *
 * Entry order is preserved. Directories are not written: every mainstream
 * extractor creates the parents a file needs, and a takeout has no empty ones.
 */
export function packTar(entries: readonly TarEntry[]): Buffer {
  const chunks: Buffer[] = [];

  for (const entry of entries) {
    const clean = entry.path.replace(/^\/+/, '');
    if (!clean) throw new Error('tarArchive: an entry needs a path');

    const mtime = entry.mtime ?? new Date();
    const mode = entry.mode ?? 0o644;
    const split = splitPath(clean);

    if (split) {
      chunks.push(header({
        path: split.name, prefix: split.prefix,
        size: entry.bytes.length, mtime, mode, typeflag: '0'
      }));
    } else {
      // Too long for name+prefix: PAX carries the path, and the ustar header
      // holds a truncated one for extractors that ignore PAX.
      chunks.push(paxRecords(clean, mtime));
      chunks.push(header({
        path: clean.slice(-99), prefix: '',
        size: entry.bytes.length, mtime, mode, typeflag: '0'
      }));
    }

    chunks.push(entry.bytes, padding(entry.bytes.length));
  }

  // Two zero blocks end the archive.
  chunks.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(chunks);
}

/** The same archive, gzipped — a `.tar.gz`. */
export async function packTarGz(entries: readonly TarEntry[]): Promise<Buffer> {
  return gzip(packTar(entries));
}
