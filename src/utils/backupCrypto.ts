/**
 * Encrypted backup files (#1561, #1876): the backup document, every file
 * archive beside it, and the credentials store, under `NGDPBASE_BACKUP_KEY`.
 * The database files are encrypted by SQLCipher itself (`sqliteBackup.ts`);
 * everything else a backup writes goes through here.
 *
 * Format, version 1:
 *
 * - `NGDPBK01` (8 bytes), then a big-endian u32 length and that many bytes of
 *   JSON header: the cipher, the key derivation (scrypt, its cost and a fresh
 *   random salt), the backup key's fingerprint (`backupKeyFingerprint`, never
 *   the key), an 8-byte random nonce prefix and the chunk size.
 * - Then records: u32 plaintext length, one byte (1 on the last record, else
 *   0), the ciphertext, and its 16-byte AES-256-GCM tag. Each record's nonce
 *   is the prefix and its u32 index; its additional data is the SHA-256 of
 *   the header, the index and the last-record byte. So a record moved,
 *   dropped, swapped from another file or cut off at the end fails, and so
 *   does any change to the header.
 *
 * Streamed both ways, a chunk at a time: a file's size never becomes memory.
 * Decrypting checks the fingerprint first, so a backup made under another key
 * is refused by name ({@link BackupKeyMismatchError}) before any work is done.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, type ScryptOptions } from 'node:crypto';
import { Readable, Transform, Writable, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { backupKeyFingerprint, BACKUP_KEY_ENV } from './backupKey.js';
import { open } from 'node:fs/promises';

/** The first bytes of every encrypted backup file. */
export const BACKUP_FILE_MAGIC = Buffer.from('NGDPBK01', 'ascii');
/** What an encrypted backup file's name ends with. */
export const ENCRYPTED_SUFFIX = '.enc';

/** The key derivation's cost, written into each file's header so a reader uses the file's own. A format constant, not a tunable: changing it changes no file already written. */
const KDF = { N: 16384, r: 8, p: 1 } as const;
const CHUNK_BYTES = 64 * 1024;
const SALT_BYTES = 16;
const NONCE_PREFIX_BYTES = 8;
const TAG_BYTES = 16;
const RECORD_HEAD = 5;
/** The largest header a reader accepts: a header is a few hundred bytes. */
const MAX_HEADER = 4096;

interface Header {
  format: 1;
  cipher: 'aes-256-gcm';
  kdf: { alg: 'scrypt'; N: number; r: number; p: number; salt: string };
  keyFingerprint: string;
  noncePrefix: string;
  chunkBytes: number;
}

/** A backup file made under a different backup key than the one set now. */
export class BackupKeyMismatchError extends Error {
  constructor(readonly fileFingerprint: string, readonly keyFingerprint: string) {
    super(`it was made with a different backup key (fingerprint ${fileFingerprint}; ${BACKUP_KEY_ENV} now has ${keyFingerprint}). Set ${BACKUP_KEY_ENV} to the key it was made with`);
    this.name = 'BackupKeyMismatchError';
  }
}

function deriveKey(backupKey: string, salt: Buffer, kdf: { N: number; r: number; p: number }): Promise<Buffer> {
  const options: ScryptOptions = { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * kdf.N * kdf.r };
  return new Promise((resolve, reject) => scrypt(backupKey, salt, 32, options, (err, key) => (err ? reject(err) : resolve(key))));
}

function nonceFor(prefix: Buffer, index: number): Buffer {
  const nonce = Buffer.alloc(12);
  prefix.copy(nonce, 0, 0, 8);
  nonce.writeUInt32BE(index, 8);
  return nonce;
}

function aadFor(headerHash: Buffer, index: number, last: boolean): Buffer {
  const tail = Buffer.alloc(5);
  tail.writeUInt32BE(index, 0);
  tail.writeUInt8(last ? 1 : 0, 4);
  return Buffer.concat([headerHash, tail]);
}

function requireKey(backupKey: string): void {
  if (!backupKey.trim()) throw new Error(`a backup key is required: ${BACKUP_KEY_ENV} is not set`);
}

/** Whether these bytes (a file's first) are an encrypted backup file. */
export function isEncryptedBackup(head: Buffer): boolean {
  return head.length >= BACKUP_FILE_MAGIC.length && head.subarray(0, BACKUP_FILE_MAGIC.length).equals(BACKUP_FILE_MAGIC);
}

/** Whether the file on disk is an encrypted backup file, read from its first bytes only. */
export async function fileIsEncrypted(file: string): Promise<boolean> {
  const handle = await open(file, 'r');
  try {
    const head = Buffer.alloc(BACKUP_FILE_MAGIC.length);
    const { bytesRead } = await handle.read(head, 0, head.length, 0);
    return isEncryptedBackup(head.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

/** A stream that encrypts what is written to it under `backupKey`. */
export function encryptStream(backupKey: string): Transform {
  requireKey(backupKey);
  let key: Buffer | null = null;
  let headerHash: Buffer;
  let prefix: Buffer;
  let index = 0;
  let pending: Buffer = Buffer.alloc(0);

  const record = (plain: Buffer, last: boolean): Buffer => {
    const cipher = createCipheriv('aes-256-gcm', key!, nonceFor(prefix, index));
    cipher.setAAD(aadFor(headerHash, index, last));
    const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
    const head = Buffer.alloc(RECORD_HEAD);
    head.writeUInt32BE(plain.length, 0);
    head.writeUInt8(last ? 1 : 0, 4);
    index++;
    return Buffer.concat([head, ct, cipher.getAuthTag()]);
  };

  const start = async (stream: Transform): Promise<void> => {
    if (key) return;
    const salt = randomBytes(SALT_BYTES);
    prefix = randomBytes(NONCE_PREFIX_BYTES);
    const header: Header = {
      format: 1,
      cipher: 'aes-256-gcm',
      kdf: { alg: 'scrypt', ...KDF, salt: salt.toString('base64') },
      keyFingerprint: backupKeyFingerprint(backupKey),
      noncePrefix: prefix.toString('base64'),
      chunkBytes: CHUNK_BYTES
    };
    const json = Buffer.from(JSON.stringify(header), 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(json.length, 0);
    const headerBytes = Buffer.concat([BACKUP_FILE_MAGIC, len, json]);
    headerHash = createHash('sha256').update(headerBytes).digest();
    key = await deriveKey(backupKey, salt, KDF);
    stream.push(headerBytes);
  };

  return new Transform({
    transform(chunk: Buffer, _enc, done: TransformCallback) {
      start(this).then(() => {
        pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
        // The last record is written at the end, so a full chunk is held back
        // until more follows: the last-record byte is then always right.
        while (pending.length > CHUNK_BYTES) {
          this.push(record(pending.subarray(0, CHUNK_BYTES), false));
          pending = pending.subarray(CHUNK_BYTES);
        }
        done();
      }, done);
    },
    flush(done: TransformCallback) {
      start(this).then(() => {
        this.push(record(pending, true));
        done();
      }, done);
    }
  });
}

/**
 * A stream that decrypts an encrypted backup file written to it. Fails —
 * naming why — on a file that is not one, a different backup key
 * ({@link BackupKeyMismatchError}), any record that does not verify, and a
 * file cut short or with bytes after its last record.
 */
export function decryptStream(backupKey: string): Transform {
  requireKey(backupKey);
  let buffer: Buffer = Buffer.alloc(0);
  let header: Header | null = null;
  let headerHash: Buffer;
  let prefix: Buffer;
  let key: Buffer;
  let index = 0;
  let ended = false;

  const parseHeader = async (): Promise<boolean> => {
    if (buffer.length < BACKUP_FILE_MAGIC.length + 4) return false;
    if (!isEncryptedBackup(buffer)) throw new Error('not an encrypted backup file');
    const len = buffer.readUInt32BE(BACKUP_FILE_MAGIC.length);
    if (len === 0 || len > MAX_HEADER) throw new Error('the encrypted backup file has a damaged header');
    const total = BACKUP_FILE_MAGIC.length + 4 + len;
    if (buffer.length < total) return false;
    const headerBytes = buffer.subarray(0, total);
    let parsed: Header;
    try {
      parsed = JSON.parse(headerBytes.subarray(BACKUP_FILE_MAGIC.length + 4).toString('utf8')) as Header;
    } catch {
      throw new Error('the encrypted backup file has a damaged header');
    }
    // The header is not authenticated until the first record verifies, so
    // nothing in it may set the cost of the work before that: format 1 has
    // one key derivation cost, and a header asking for another is refused
    // (a crafted file must not make the server run a huge scrypt).
    const salt = typeof parsed.kdf?.salt === 'string' ? Buffer.from(parsed.kdf.salt, 'base64') : Buffer.alloc(0);
    const noncePrefix = typeof parsed.noncePrefix === 'string' ? Buffer.from(parsed.noncePrefix, 'base64') : Buffer.alloc(0);
    if (parsed.format !== 1 || parsed.cipher !== 'aes-256-gcm' || parsed.kdf?.alg !== 'scrypt'
      || parsed.kdf.N !== KDF.N || parsed.kdf.r !== KDF.r || parsed.kdf.p !== KDF.p
      || salt.length !== SALT_BYTES || noncePrefix.length !== NONCE_PREFIX_BYTES
      || !(parsed.chunkBytes > 0 && parsed.chunkBytes <= 16 * CHUNK_BYTES)) {
      throw new Error('the encrypted backup file is in a format this build does not read');
    }
    const fingerprint = backupKeyFingerprint(backupKey);
    if (parsed.keyFingerprint !== fingerprint) throw new BackupKeyMismatchError(String(parsed.keyFingerprint), fingerprint);
    headerHash = createHash('sha256').update(headerBytes).digest();
    prefix = noncePrefix;
    key = await deriveKey(backupKey, salt, KDF);
    header = parsed;
    buffer = buffer.subarray(total);
    return true;
  };

  const drain = (stream: Transform): void => {
    while (buffer.length >= RECORD_HEAD) {
      if (ended) throw new Error('the encrypted backup file has bytes after its last record');
      const len = buffer.readUInt32BE(0);
      const last = buffer.readUInt8(4);
      if (len > header!.chunkBytes || last > 1) throw new Error('the encrypted backup file is damaged');
      const size = RECORD_HEAD + len + TAG_BYTES;
      if (buffer.length < size) return;
      const decipher = createDecipheriv('aes-256-gcm', key, nonceFor(prefix, index));
      decipher.setAAD(aadFor(headerHash, index, last === 1));
      decipher.setAuthTag(buffer.subarray(RECORD_HEAD + len, size));
      let plain: Buffer;
      try {
        plain = Buffer.concat([decipher.update(buffer.subarray(RECORD_HEAD, RECORD_HEAD + len)), decipher.final()]);
      } catch {
        throw new Error('the encrypted backup file does not verify: it is damaged or was changed');
      }
      index++;
      buffer = buffer.subarray(size);
      if (last === 1) ended = true;
      if (plain.length > 0) stream.push(plain);
    }
  };

  return new Transform({
    transform(chunk: Buffer, _enc, done: TransformCallback) {
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
      (header ? Promise.resolve(true) : parseHeader()).then((ready) => {
        if (ready) drain(this);
        done();
      }).catch(done);
    },
    flush(done: TransformCallback) {
      try {
        if (!header) throw new Error(buffer.length === 0 ? 'the encrypted backup file is empty' : 'the encrypted backup file has a damaged header');
        drain(this);
        if (!ended || buffer.length > 0) throw new Error('the encrypted backup file is cut short');
        done();
      } catch (err) {
        done(err as Error);
      }
    }
  });
}

async function collect(source: Buffer, transform: Transform): Promise<Buffer> {
  const out: Buffer[] = [];
  await pipeline(Readable.from([source]), transform, new Writable({
    write(chunk: Buffer, _enc, done) {
      out.push(chunk);
      done();
    }
  }));
  return Buffer.concat(out);
}

/** Encrypt a whole buffer (the backup document, already in memory). */
export function encryptBuffer(data: Buffer, backupKey: string): Promise<Buffer> {
  return collect(data, encryptStream(backupKey));
}

/** Decrypt a whole buffer. */
export function decryptBuffer(data: Buffer, backupKey: string): Promise<Buffer> {
  return collect(data, decryptStream(backupKey));
}
