/**
 * Private-store crypto (#1384, epic #1382).
 *
 * Random user KEK, wrapped by the login password and by a BIP39 12-word
 * phrase. Each encrypted store has its own DEK wrapped by that KEK.
 * Not on PageManager — see docs/private-stores.md.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  timingSafeEqual,
  pbkdf2Sync,
  randomBytes,
  scryptSync
} from 'crypto';
import { BIP39_ENGLISH } from './bip39English.js';

export const mnemonicWordCount = 12;

export interface ScryptKdf {
  N: number;
  r: number;
  p: number;
}

/** Production wrap cost — same ballpark as login hashes. */
export const PRIVATE_STORE_KDF: ScryptKdf = { N: 16384, r: 8, p: 1 };

/** Unit tests only — still a valid scrypt N, cheap enough for the suite. */
export const TEST_PRIVATE_STORE_KDF: ScryptKdf = { N: 16, r: 8, p: 1 };

export interface WrappedBlob {
  iv: string;
  tag: string;
  ct: string;
}

export interface UserKeyEnvelope {
  version: 1;
  kdf: ScryptKdf & { salt: string };
  passwordWrap: WrappedBlob;
  recoveryKdf: { alg: 'bip39-pbkdf2' };
  recoveryWrap: WrappedBlob;
}

export interface EncryptedStoreRecord {
  encrypt: true;
  dekWrap: WrappedBlob;
}

export interface PlainStoreRecord {
  encrypt: false;
}

export type StoreKeyRecord = EncryptedStoreRecord | PlainStoreRecord;

const KEYLEN = 32;
const IVLEN = 12;

function maxmem(kdf: ScryptKdf): number {
  return 128 * kdf.N * kdf.r * 4;
}

function wrap(key: Buffer, plaintext: Buffer): WrappedBlob {
  const iv = randomBytes(IVLEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64')
  };
}

function unwrap(key: Buffer, blob: WrappedBlob, kind: 'password' | 'recovery' | 'DEK' | 'catalog'): Buffer {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(blob.ct, 'base64')),
      decipher.final()
    ]);
  } catch {
    if (kind === 'password') throw new Error('password does not unwrap the user KEK');
    if (kind === 'recovery') throw new Error('recovery phrase does not unwrap the user KEK');
    if (kind === 'catalog') throw new Error('cannot decrypt catalog');
    throw new Error('cannot unwrap store DEK');
  }
}

function derivePasswordKey(password: string, salt: Buffer, kdf: ScryptKdf): Buffer {
  return scryptSync(password, salt, KEYLEN, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: maxmem(kdf)
  });
}

function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
}

function mnemonicToWrapKey(mnemonic: string): Buffer {
  const seed = pbkdf2Sync(normalizeMnemonic(mnemonic), 'mnemonic', 2048, 64, 'sha512');
  return seed.subarray(0, KEYLEN);
}

function entropyToMnemonic(entropy: Buffer): string {
  if (entropy.length !== 16) throw new Error('12-word BIP39 uses 128 bits of entropy');
  const checksum = createHash('sha256').update(entropy).digest()[0] >> 4;
  let bits = '';
  for (const byte of entropy) bits += byte.toString(2).padStart(8, '0');
  bits += checksum.toString(2).padStart(4, '0');
  const words: string[] = [];
  for (let i = 0; i < mnemonicWordCount; i++) {
    const idx = Number.parseInt(bits.slice(i * 11, i * 11 + 11), 2);
    words.push(BIP39_ENGLISH[idx]);
  }
  return words.join(' ');
}

export function createUserKeys(
  password: string,
  opts: { kdf?: ScryptKdf } = {}
): { envelope: UserKeyEnvelope; kek: Buffer; mnemonic: string } {
  const kdf = opts.kdf ?? PRIVATE_STORE_KDF;
  const kek = randomBytes(KEYLEN);
  const passwordSalt = randomBytes(16);
  const mnemonic = entropyToMnemonic(randomBytes(16));
  return {
    kek,
    mnemonic,
    envelope: {
      version: 1,
      kdf: { ...kdf, salt: passwordSalt.toString('base64') },
      passwordWrap: wrap(derivePasswordKey(password, passwordSalt, kdf), kek),
      recoveryKdf: { alg: 'bip39-pbkdf2' },
      recoveryWrap: wrap(mnemonicToWrapKey(mnemonic), kek)
    }
  };
}

export function unwrapKekWithPassword(envelope: UserKeyEnvelope, password: string): Buffer {
  const salt = Buffer.from(envelope.kdf.salt, 'base64');
  const key = derivePasswordKey(password, salt, envelope.kdf);
  return unwrap(key, envelope.passwordWrap, 'password');
}

export function unwrapKekWithMnemonic(envelope: UserKeyEnvelope, mnemonic: string): Buffer {
  return unwrap(mnemonicToWrapKey(mnemonic), envelope.recoveryWrap, 'recovery');
}

/**
 * A fresh set of 12 recovery words for a KEK that has not been committed yet
 * (#1414): the store door's words screen, where a failed confirmation discards
 * the words it showed and never re-shows them. The KEK and its password wrap
 * are kept; only the recovery wrap is replaced.
 */
export function newRecoveryWords(kek: Buffer): { mnemonic: string; recoveryWrap: WrappedBlob } {
  const mnemonic = entropyToMnemonic(randomBytes(16));
  return { mnemonic, recoveryWrap: wrap(mnemonicToWrapKey(mnemonic), kek) };
}

/** True when two phrases are the same 12 words, compared as the recovery wrap reads them. */
export function sameMnemonic(entered: string, expected: string): boolean {
  const a = Buffer.from(normalizeMnemonic(entered));
  const b = Buffer.from(normalizeMnemonic(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function rewrapPassword(
  envelope: UserKeyEnvelope,
  oldPassword: string,
  newPassword: string,
  opts: { kdf?: ScryptKdf } = {}
): UserKeyEnvelope {
  return rewrapPasswordWithKek(envelope, unwrapKekWithPassword(envelope, oldPassword), newPassword, opts);
}

/**
 * Replace the password wrap, given the KEK itself (#1452): how the recovery
 * words set a new password when the old one is forgotten. The KEK bytes and
 * the recovery wrap are unchanged, so every store's wrapped DEK stays valid
 * and the same words keep working.
 */
export function rewrapPasswordWithKek(
  envelope: UserKeyEnvelope,
  kek: Buffer,
  newPassword: string,
  opts: { kdf?: ScryptKdf } = {}
): UserKeyEnvelope {
  const kdf = opts.kdf ?? { N: envelope.kdf.N, r: envelope.kdf.r, p: envelope.kdf.p };
  const passwordSalt = randomBytes(16);
  return {
    ...envelope,
    kdf: { ...kdf, salt: passwordSalt.toString('base64') },
    passwordWrap: wrap(derivePasswordKey(newPassword, passwordSalt, kdf), kek)
  };
}

export function createEncryptedStore(kek: Buffer): EncryptedStoreRecord {
  const dek = randomBytes(KEYLEN);
  return { encrypt: true, dekWrap: wrap(kek, dek) };
}

export function unwrapDek(kek: Buffer, store: EncryptedStoreRecord): Buffer {
  return unwrap(kek, store.dekWrap, 'DEK');
}

/** Encrypt a JSON value with the user KEK (user-index / versions / trash). */
export function encryptJson(key: Buffer, value: unknown): WrappedBlob {
  return wrap(key, Buffer.from(JSON.stringify(value), 'utf8'));
}

/** Decrypt a JSON value wrapped by {@link encryptJson}. */
export function decryptJson<T>(key: Buffer, blob: WrappedBlob): T {
  const buf = unwrap(key, blob, 'catalog');
  try {
    return JSON.parse(buf.toString('utf8')) as T;
  } catch {
    throw new Error('cannot decrypt catalog');
  }
}

/**
 * A file in an encrypted store on disk (#1415): `SEALED_MAGIC`, then the IV,
 * the GCM tag and the ciphertext. Binary, so page text and attachment bytes
 * (#1400) share one format; the magic lets a reader tell a sealed file from a
 * plaintext one without trying the key.
 *
 * A page or a file of an encrypted vault is sealed with a key of its own
 * (#1388, slice 2): `ITEM_MAGIC`, the item key wrapped by the vault DEK (IV,
 * tag, 32 bytes), then the IV, tag and ciphertext under the item key. A share
 * link can then carry that one key and open that one item, never the vault.
 * History and the vault's indexes stay sealed with the DEK itself.
 */
const SEALED_MAGIC = Buffer.from('NGDPSEAL1', 'ascii');
const ITEM_MAGIC = Buffer.from('NGDPSEAL2', 'ascii');
const TAGLEN = 16;
/** IV, tag and wrapped key of an item file's key, right after `ITEM_MAGIC`. */
const WRAPPED_ITEM_KEY_LEN = IVLEN + TAGLEN + KEYLEN;

/** True when `bytes` start with a sealed-file magic, either form. */
export function isSealedBytes(bytes: Buffer): boolean {
  if (bytes.length >= ITEM_MAGIC.length + WRAPPED_ITEM_KEY_LEN + IVLEN + TAGLEN
    && bytes.subarray(0, ITEM_MAGIC.length).equals(ITEM_MAGIC)) return true;
  return bytes.length >= SEALED_MAGIC.length + IVLEN + TAGLEN
    && bytes.subarray(0, SEALED_MAGIC.length).equals(SEALED_MAGIC);
}

/** True when `bytes` are an item file: sealed with a key of its own (#1388). */
export function isItemSealedBytes(bytes: Buffer): boolean {
  return isSealedBytes(bytes) && bytes.subarray(0, ITEM_MAGIC.length).equals(ITEM_MAGIC);
}

function gcmSeal(key: Buffer, plaintext: Buffer): Buffer {
  const iv = randomBytes(IVLEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

function gcmOpen(key: Buffer, sealed: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, IVLEN));
  decipher.setAuthTag(sealed.subarray(IVLEN, IVLEN + TAGLEN));
  return Buffer.concat([decipher.update(sealed.subarray(IVLEN + TAGLEN)), decipher.final()]);
}

/** Encrypt the bytes of one store file with the store DEK. */
export function sealBytes(dek: Buffer, plaintext: Buffer): Buffer {
  if (dek.length !== KEYLEN) throw new Error('encrypted store is locked: missing DEK');
  return Buffer.concat([SEALED_MAGIC, gcmSeal(dek, plaintext)]);
}

/** A fresh key for one page or file of an encrypted vault (#1388). */
export function newItemKey(): Buffer {
  return randomBytes(KEYLEN);
}

/**
 * Encrypt one page or file with its own `itemKey`, and keep that key in the
 * file, wrapped by the vault DEK (#1388).
 */
export function sealItemBytes(dek: Buffer, itemKey: Buffer, plaintext: Buffer): Buffer {
  if (dek.length !== KEYLEN) throw new Error('encrypted store is locked: missing DEK');
  if (itemKey.length !== KEYLEN) throw new Error('an item key is 32 bytes');
  return Buffer.concat([ITEM_MAGIC, gcmSeal(dek, itemKey), gcmSeal(itemKey, plaintext)]);
}

/**
 * The key an item file was sealed with, unwrapped by the vault DEK, or null
 * for a file sealed with the DEK itself (#1388).
 */
export function itemKeyOf(dek: Buffer, sealed: Buffer): Buffer | null {
  if (!isItemSealedBytes(sealed)) return null;
  try {
    return gcmOpen(dek, sealed.subarray(ITEM_MAGIC.length, ITEM_MAGIC.length + WRAPPED_ITEM_KEY_LEN));
  } catch {
    throw new Error('cannot open sealed store file');
  }
}

/**
 * Open an item file with its own key alone, without the vault DEK: what a
 * share link can do with the key it carries (#1388).
 */
export function openItemBytes(itemKey: Buffer, sealed: Buffer): Buffer {
  if (!isItemSealedBytes(sealed)) throw new Error('not an item file');
  try {
    return gcmOpen(itemKey, sealed.subarray(ITEM_MAGIC.length + WRAPPED_ITEM_KEY_LEN));
  } catch {
    throw new Error('cannot open sealed store file');
  }
}

/** Decrypt a store file written by {@link sealBytes} or {@link sealItemBytes}, with the vault DEK. */
export function openBytes(dek: Buffer, sealed: Buffer): Buffer {
  if (!isSealedBytes(sealed)) throw new Error('not a sealed store file');
  const itemKey = itemKeyOf(dek, sealed);
  if (itemKey) {
    try {
      return openItemBytes(itemKey, sealed);
    } finally {
      itemKey.fill(0);
    }
  }
  try {
    return gcmOpen(dek, sealed.subarray(SEALED_MAGIC.length));
  } catch {
    throw new Error('cannot open sealed store file');
  }
}

/**
 * Shared encrypt-on write gate. Callers pass the DEK from the session bag.
 * Not a PageManager method.
 */
export function assertEncryptedStoreWritable(args: {
  encrypt: boolean;
  dek: Buffer | undefined;
}): void {
  if (!args.encrypt) return;
  if (!args.dek || args.dek.length !== KEYLEN) {
    throw new Error('encrypted store is locked: missing DEK');
  }
}
