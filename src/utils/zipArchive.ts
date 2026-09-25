/**
 * Writing a zip archive from bytes already in hand (#1387).
 *
 * A takeout lands on the owner's laptop or phone, and that decides the format:
 * iOS, iPadOS, Android, Windows and macOS all open a `.zip` by tapping it,
 * while `.tar.gz` needs a third-party app on exactly the devices people carry.
 *
 * This is the only archive the system writes, and `readZip` below is the only
 * one it reads: a takeout handed back for import (#1472). The instance backup does not use
 * one: it carries private files as base64 inside the backup document (#1387),
 * so there is nothing to unpack on restore.
 *
 * Bytes in, one Buffer out: a takeout is decrypted, and nothing decrypted may
 * be staged on the server's disk, so there is no file for a packer to read.
 *
 * Written here rather than taken from a library because the zip container is
 * small and completely specified, while every candidate library wants to read
 * from or write to the filesystem. The tests extract each archive with an
 * independent implementation and compare the bytes, so this is checked against
 * a real reader rather than against its own assumptions.
 *
 * Deliberately NOT implemented: zip64. An archive over 4 GiB, a member over
 * 4 GiB, or more than 65,535 members is refused with a clear error rather than
 * written as something an extractor would mis-read. A store that large wants
 * streaming and zip64 together, which is its own piece of work.
 */

import { deflateRaw as deflateRawCb, inflateRawSync } from 'zlib';
import { promisify } from 'util';

const deflateRaw = promisify(deflateRawCb);

/** One file to put in the archive. */
export type ZipEntry = {
  /** Path inside the archive, `/`-separated, no leading slash. */
  path: string;
  bytes: Buffer;
  /** Defaults to now. Zip stores 2-second resolution, and nothing before 1980. */
  mtime?: Date;
};

const MAX_UINT32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;

/** CRC-32 (IEEE), which every zip entry carries so an extractor can verify it. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** MS-DOS date and time, which is what a zip header stores. */
function dosDateTime(date: Date): { time: number; date: number } {
  // The format cannot express anything before 1980-01-01, and the fields below
  // are read in LOCAL time — so the floor has to be built in local time too.
  // `Date.UTC(1980, 0, 1)` is 1979 in any negative offset, which writes a
  // negative year field and throws.
  const d = date.getFullYear() < 1980 ? new Date(1980, 0, 1, 0, 0, 0) : date;
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

type Prepared = {
  name: Buffer;
  bytes: Buffer;
  stored: Buffer;
  method: 0 | 8;
  crc: number;
  time: number;
  date: number;
  offset: number;
};

/**
 * A zip archive of the given entries, as one Buffer.
 *
 * Entries are deflated when that makes them smaller — markdown compresses well,
 * and a phone on mobile data is the expected destination — and stored as-is
 * when it does not, which is the usual outcome for photos and other media.
 */
export async function packZip(entries: readonly ZipEntry[]): Promise<Buffer> {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`zipArchive: ${entries.length} files exceeds the ${MAX_ENTRIES} this writer supports (zip64 is not implemented)`);
  }

  const prepared: Prepared[] = [];
  const localChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const clean = entry.path.replace(/^\/+/, '');
    if (!clean) throw new Error('zipArchive: an entry needs a path');

    const name = Buffer.from(clean, 'utf8');
    if (entry.bytes.length > MAX_UINT32) {
      throw new Error(`zipArchive: "${clean}" is too large for a zip without zip64`);
    }

    const deflated = await deflateRaw(entry.bytes);
    const useDeflate = deflated.length < entry.bytes.length;
    const stored = useDeflate ? deflated : entry.bytes;
    const { time, date } = dosDateTime(entry.mtime ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);      // local file header signature
    local.writeUInt16LE(20, 4);              // version needed: 2.0
    local.writeUInt16LE(0x0800, 6);          // flags: bit 11, the name is UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc32(entry.bytes), 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);              // no extra field

    prepared.push({
      name,
      bytes: entry.bytes,
      stored,
      method: useDeflate ? 8 : 0,
      crc: crc32(entry.bytes),
      time,
      date,
      offset
    });

    localChunks.push(local, name, stored);
    offset += local.length + name.length + stored.length;
    if (offset > MAX_UINT32) {
      throw new Error('zipArchive: the archive exceeds 4 GiB (zip64 is not implemented)');
    }
  }

  // Central directory: one record per entry, then the end record.
  const centralChunks: Buffer[] = [];
  for (const p of prepared) {
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);    // central file header signature
    central.writeUInt16LE(20, 4);            // version made by
    central.writeUInt16LE(20, 6);            // version needed
    central.writeUInt16LE(0x0800, 8);        // flags: UTF-8 name
    central.writeUInt16LE(p.method, 10);
    central.writeUInt16LE(p.time, 12);
    central.writeUInt16LE(p.date, 14);
    central.writeUInt32LE(p.crc, 16);
    central.writeUInt32LE(p.stored.length, 20);
    central.writeUInt32LE(p.bytes.length, 24);
    central.writeUInt16LE(p.name.length, 28);
    central.writeUInt16LE(0, 30);            // extra length
    central.writeUInt16LE(0, 32);            // comment length
    central.writeUInt16LE(0, 34);            // disk number
    central.writeUInt16LE(0, 36);            // internal attributes
    // External attributes: a regular file, 0644, in the high 16 bits. `>>> 0`
    // because JavaScript's shift is signed and this value overflows into
    // negative without it.
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(p.offset, 42);
    centralChunks.push(central, p.name);
  }

  const centralSize = centralChunks.reduce((n, c) => n + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);          // end of central directory
  end.writeUInt16LE(0, 4);                   // this disk
  end.writeUInt16LE(0, 6);                   // disk with the central directory
  end.writeUInt16LE(prepared.length, 8);
  end.writeUInt16LE(prepared.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);             // where the central directory starts
  end.writeUInt16LE(0, 20);                  // no archive comment

  return Buffer.concat([...localChunks, ...centralChunks, end]);
}

/** Limits on what `readZip` will unpack, so an upload cannot exhaust memory. */
export type ZipReadLimits = {
  /** Most members accepted. */
  maxEntries: number;
  /** Most bytes accepted once everything is inflated. */
  maxTotalBytes: number;
};

/**
 * The files in a zip archive, as bytes in memory (#1472).
 *
 * Read from the central directory, which is the archive's own table of
 * contents, so a member written with a data descriptor — what a streaming
 * writer, or an OS re-zipping a folder, produces — is read the same as any
 * other. Directory entries are dropped, and so is what macOS adds when it
 * zips a folder (`__MACOSX/`, `.DS_Store`): they are not anyone's data.
 *
 * Refused, with an error naming why, rather than read as something else:
 *
 *   - a path that would climb out of wherever it is extracted — absolute, or
 *     holding a `..` segment, with `\` read as the separator it is on Windows;
 *   - encryption, zip64, split archives, and any method but stored and deflate;
 *   - a member whose inflated bytes do not match the size or CRC the archive
 *     declares for it;
 *   - more members, or more inflated bytes, than `limits` allow. Inflating is
 *     capped per member at what is left of the budget, so a small archive
 *     that expands enormously stops at the budget, not at the machine's memory.
 */
export function readZip(archive: Buffer, limits: ZipReadLimits): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(archive);
  if (eocd < 0) throw new Error('zipArchive: not a zip archive');

  if (archive.readUInt16LE(eocd + 4) !== 0 || archive.readUInt16LE(eocd + 6) !== 0) {
    throw new Error('zipArchive: split archives are not supported');
  }
  const count = archive.readUInt16LE(eocd + 10);
  const centralSize = archive.readUInt32LE(eocd + 12);
  const centralOffset = archive.readUInt32LE(eocd + 16);
  if (count === MAX_ENTRIES || centralSize === MAX_UINT32 || centralOffset === MAX_UINT32) {
    throw new Error('zipArchive: zip64 archives are not supported');
  }
  if (count > limits.maxEntries) {
    throw new Error(`zipArchive: ${count} members exceeds the ${limits.maxEntries} allowed`);
  }
  if (centralOffset + centralSize > eocd) throw new Error('zipArchive: the central directory is truncated');

  const entries: ZipEntry[] = [];
  let budget = limits.maxTotalBytes;
  let at = centralOffset;

  for (let i = 0; i < count; i++) {
    if (at + 46 > eocd || archive.readUInt32LE(at) !== 0x02014b50) {
      throw new Error('zipArchive: the central directory is corrupt');
    }
    const flags = archive.readUInt16LE(at + 8);
    const method = archive.readUInt16LE(at + 10);
    const date = archive.readUInt16LE(at + 14);
    const time = archive.readUInt16LE(at + 12);
    const crc = archive.readUInt32LE(at + 16);
    const storedSize = archive.readUInt32LE(at + 20);
    const size = archive.readUInt32LE(at + 24);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const localOffset = archive.readUInt32LE(at + 42);
    const rawName = archive.subarray(at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;

    // Bit 11 says UTF-8. Without it the name is CP437 by the spec, which
    // agrees with UTF-8 for ASCII — and a name outside ASCII from a writer
    // that old is rare enough to read as UTF-8 rather than carry a code page.
    const name = rawName.toString('utf8');

    if (flags & 0x0001) throw new Error(`zipArchive: "${name}" is encrypted`);
    if (storedSize === MAX_UINT32 || size === MAX_UINT32 || localOffset === MAX_UINT32) {
      throw new Error('zipArchive: zip64 archives are not supported');
    }

    const clean = safeMemberPath(name);
    if (clean === null) continue;       // a directory, or macOS's folder litter

    if (method !== 0 && method !== 8) {
      throw new Error(`zipArchive: "${clean}" uses compression method ${method}; only stored and deflate are supported`);
    }
    if (size > budget) {
      throw new Error(`zipArchive: the archive unpacks to more than the ${limits.maxTotalBytes} bytes allowed`);
    }

    // The local header repeats the name and may carry a different extra
    // field, so the data starts where IT says, not where the central record
    // would suggest.
    if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`zipArchive: "${clean}" has no local header`);
    }
    const dataStart = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    if (dataStart + storedSize > archive.length) throw new Error(`zipArchive: "${clean}" is truncated`);
    const stored = archive.subarray(dataStart, dataStart + storedSize);

    let bytes: Buffer;
    if (method === 0) {
      bytes = Buffer.from(stored);
    } else {
      try {
        // One byte over the declared size, so an entry that lies about its
        // size is caught as a mismatch rather than silently truncated.
        bytes = inflateRawSync(stored, { maxOutputLength: Math.min(budget, size) + 1 });
      } catch {
        throw new Error(`zipArchive: "${clean}" could not be inflated, or unpacks to more than it declares`);
      }
    }
    if (bytes.length !== size) throw new Error(`zipArchive: "${clean}" does not match its declared size`);
    if (crc32(bytes) !== crc) throw new Error(`zipArchive: "${clean}" fails its CRC check`);

    budget -= bytes.length;
    entries.push({ path: clean, bytes, mtime: fromDosDateTime(date, time) });
  }

  return entries;
}

/** Where the end-of-central-directory record starts, or -1. */
function findEndOfCentralDirectory(archive: Buffer): number {
  // 22 bytes of record, preceded by nothing; followed by a comment of at most
  // 65,535 bytes. Scanned from the end, since the comment could itself hold
  // the signature.
  const floor = Math.max(0, archive.length - 22 - 0xffff);
  for (let i = archive.length - 22; i >= floor; i--) {
    if (archive.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/**
 * A member's name as a safe relative path, `null` for one to skip, or a throw
 * for one that would escape.
 */
function safeMemberPath(name: string): string | null {
  const unified = name.replace(/\\/g, '/');
  if (unified.endsWith('/')) return null;
  if (unified.startsWith('/') || /^[A-Za-z]:/.test(unified)) {
    throw new Error(`zipArchive: "${name}" is an absolute path`);
  }
  const parts = unified.split('/').filter(part => part && part !== '.');
  if (parts.includes('..')) throw new Error(`zipArchive: "${name}" climbs out of the archive`);
  if (parts.length === 0) return null;
  if (parts[0] === '__MACOSX' || parts[parts.length - 1] === '.DS_Store') return null;
  return parts.join('/');
}

/** The inverse of `dosDateTime`, in local time as the format stores it. */
function fromDosDateTime(date: number, time: number): Date {
  return new Date(
    ((date >> 9) & 0x7f) + 1980,
    ((date >> 5) & 0x0f) - 1,
    date & 0x1f,
    (time >> 11) & 0x1f,
    (time >> 5) & 0x3f,
    (time & 0x1f) * 2
  );
}
