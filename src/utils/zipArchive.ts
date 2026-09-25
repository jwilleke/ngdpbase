/**
 * Writing a zip archive from bytes already in hand (#1387).
 *
 * A takeout lands on the owner's laptop or phone, and that decides the format:
 * iOS, iPadOS, Android, Windows and macOS all open a `.zip` by tapping it,
 * while `.tar.gz` needs a third-party app on exactly the devices people carry.
 *
 * This is the only archive the system writes. The instance backup does not use
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

import { deflateRaw as deflateRawCb } from 'zlib';
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
