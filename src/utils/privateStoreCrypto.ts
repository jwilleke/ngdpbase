/**
 * Private-store crypto (#1384, epic #1382).
 *
 * Random user KEK, wrapped by the login password and by a BIP39 12-word
 * phrase. Each encrypted store has its own DEK wrapped by that KEK.
 * Not on PageManager — see docs/planning/private-stores.md.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
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

export function rewrapPassword(
  envelope: UserKeyEnvelope,
  oldPassword: string,
  newPassword: string,
  opts: { kdf?: ScryptKdf } = {}
): UserKeyEnvelope {
  const kek = unwrapKekWithPassword(envelope, oldPassword);
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
