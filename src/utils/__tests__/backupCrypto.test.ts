/**
 * #1561, #1876 slice 2 — every part of a backup but the databases (SQLCipher)
 * is encrypted under NGDPBASE_BACKUP_KEY through backupCrypto: unreadable
 * without the key, refused under another key by its fingerprint, and any
 * change, truncation or reordering fails. Each test works in its own temp
 * directory and removes only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { BackupKeyMismatchError, decryptBuffer, encryptBuffer, isEncryptedBackup } from '../backupCrypto';
import { extractTreeArchive, listTreeArchive, writeTreeArchive } from '../treeArchive';

const KEY = `backup-${randomBytes(8).toString('hex')}`;
const OTHER = `other-${randomBytes(8).toString('hex')}`;

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-backup-crypto-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('backupCrypto (#1561)', () => {
  test('a buffer round-trips, and the plaintext is not in the ciphertext', async () => {
    const plain = Buffer.from('{"password":"hunter2-secret-value"}');
    const sealed = await encryptBuffer(plain, KEY);
    expect(isEncryptedBackup(sealed)).toBe(true);
    expect(sealed.includes(Buffer.from('hunter2-secret-value'))).toBe(false);
    expect((await decryptBuffer(sealed, KEY)).equals(plain)).toBe(true);
  });

  test('more than one chunk, and an empty input, round-trip', async () => {
    const big = randomBytes(200 * 1024 + 7);
    expect((await decryptBuffer(await encryptBuffer(big, KEY), KEY)).equals(big)).toBe(true);
    expect((await decryptBuffer(await encryptBuffer(Buffer.alloc(0), KEY), KEY)).length).toBe(0);
  });

  test('another key is refused by its fingerprint, before any byte is decrypted', async () => {
    const sealed = await encryptBuffer(Buffer.from('x'), KEY);
    await expect(decryptBuffer(sealed, OTHER)).rejects.toBeInstanceOf(BackupKeyMismatchError);
    await expect(decryptBuffer(sealed, OTHER)).rejects.toThrow(/different backup key/);
  });

  test('a changed byte, a cut-off end and a dropped record all fail', async () => {
    const big = randomBytes(150 * 1024);
    const sealed = await encryptBuffer(big, KEY);
    const flipped = Buffer.from(sealed);
    flipped[flipped.length - 40] ^= 0x01;
    await expect(decryptBuffer(flipped, KEY)).rejects.toThrow(/does not verify/);
    await expect(decryptBuffer(sealed.subarray(0, sealed.length - 10), KEY)).rejects.toThrow(/cut short/);
    // Cut exactly after a whole non-final record: the last record is gone.
    const headerLen = 8 + 4 + sealed.readUInt32BE(8);
    const firstRecord = 5 + sealed.readUInt32BE(headerLen) + 16;
    await expect(decryptBuffer(sealed.subarray(0, headerLen + firstRecord), KEY)).rejects.toThrow(/cut short/);
  });

  test('no key is refused outright', async () => {
    expect(() => encryptBuffer(Buffer.from('x'), '')).toThrow(/NGDPBASE_BACKUP_KEY is not set/);
  });
});

describe('treeArchive under the backup key (#1876)', () => {
  function folder(): string {
    const src = path.join(dir, 'src');
    fs.mkdirSync(path.join(src, 'a'), { recursive: true });
    fs.writeFileSync(path.join(src, 'a', 'secret.json'), '{"note":"plain-text-marker"}');
    fs.writeFileSync(path.join(src, 'big.bin'), randomBytes(300 * 1024));
    return src;
  }

  test('an encrypted archive round-trips streamed, and holds no plaintext', async () => {
    const src = folder();
    const archive = path.join(dir, 'out.tar.enc');
    await writeTreeArchive(archive, src, { backupKey: KEY });
    const raw = fs.readFileSync(archive);
    expect(isEncryptedBackup(raw)).toBe(true);
    expect(raw.includes(Buffer.from('plain-text-marker'))).toBe(false);
    const dest = path.join(dir, 'dest');
    expect((await extractTreeArchive(archive, dest, { backupKey: KEY })).files).toBe(2);
    expect(fs.readFileSync(path.join(dest, 'big.bin')).equals(fs.readFileSync(path.join(src, 'big.bin')))).toBe(true);
    const seen: string[] = [];
    await listTreeArchive(archive, (e) => seen.push(e.path), { backupKey: KEY });
    expect(seen).toContain('a/secret.json');
  });

  test('an encrypted archive is not read without the key, nor under another key, and nothing is extracted', async () => {
    const archive = path.join(dir, 'out.tar.enc');
    await writeTreeArchive(archive, folder(), { backupKey: KEY });
    const dest = path.join(dir, 'dest');
    await expect(extractTreeArchive(archive, dest)).rejects.toThrow(/encrypted under a backup key, and none was given/);
    await expect(extractTreeArchive(archive, dest, { backupKey: OTHER })).rejects.toThrow(/different backup key/);
    expect(fs.existsSync(dest)).toBe(false);
  });

  test('given the key, a plain archive in place of the encrypted one is refused', async () => {
    const archive = path.join(dir, 'out.tar.enc');
    await writeTreeArchive(archive, folder());
    await expect(extractTreeArchive(archive, path.join(dir, 'dest'), { backupKey: KEY })).rejects.toThrow(/is not encrypted, but the backup says it is/);
  });

  test('a small encrypted archive (one file) and an empty one round-trip', async () => {
    const src = path.join(dir, 'one');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'credentials.json'), '{"version":1,"rows":[]}');
    const archive = path.join(dir, 'one.tar.enc');
    await writeTreeArchive(archive, src, { backupKey: KEY, entries: ['credentials.json'] });
    expect((await extractTreeArchive(archive, path.join(dir, 'd1'), { backupKey: KEY })).files).toBe(1);
    const empty = path.join(dir, 'empty.tar.enc');
    await writeTreeArchive(empty, path.join(dir, 'missing'), { backupKey: KEY });
    expect(await extractTreeArchive(empty, path.join(dir, 'd2'), { backupKey: KEY })).toEqual({ files: 0, bytes: 0 });
  });

  test('a damaged large archive fails, and leaves no half-extracted folder', async () => {
    const archive = path.join(dir, 'out.tar.enc');
    await writeTreeArchive(archive, folder(), { backupKey: KEY });
    const bytes = fs.readFileSync(archive);
    bytes[bytes.length - 100] ^= 0xff;
    fs.writeFileSync(archive, bytes);
    const dest = path.join(dir, 'dest');
    await expect(extractTreeArchive(archive, dest, { backupKey: KEY })).rejects.toThrow(/does not verify/);
    expect(fs.existsSync(dest)).toBe(false);
  });
});
