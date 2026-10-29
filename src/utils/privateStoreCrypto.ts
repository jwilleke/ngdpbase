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
  scrypt
} from 'crypto';
import { BIP39_ENGLISH } from './bip39English.js';
import { newLinkKeyPair, openLockbox, parseLinkPublicKey, sealForLink, type LinkPublicKey, type Lockbox } from './shareLockbox.js';

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

/**
 * A person's own key pair (#1762 slice 5): what lets someone else's grant hand
 * them a copy of a vault key while they are offline. The pair is the share
 * lockbox's (ECDH P-256, `shareLockbox.ts`); no other crypto.
 */
export interface PersonKey {
  /** The public half, readable: a grant seals a copy of the owner's KEK to it. */
  publicKey: LinkPublicKey;
  /** The private half (the lockbox key string), wrapped under the person's own KEK. */
  privateWrap: WrappedBlob;
}

export interface UserKeyEnvelope {
  version: 1;
  kdf: ScryptKdf & { salt: string };
  passwordWrap: WrappedBlob;
  recoveryKdf: { alg: 'bip39-pbkdf2' };
  recoveryWrap: WrappedBlob;
  /**
   * The person's key pair (#1762 slice 5). Made with the KEK at enrolment, or
   * the first time the store is unlocked after this field existed; absent
   * until then.
   */
  personKey?: PersonKey;
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

function unwrap(key: Buffer, blob: WrappedBlob, kind: 'password' | 'recovery' | 'DEK' | 'catalog' | 'person'): Buffer {
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
    if (kind === 'person') throw new Error('cannot unwrap the person key');
    throw new Error('cannot unwrap store DEK');
  }
}

/** Off the main thread (#1632): a sign-in that unlocks stores never stalls other requests. */
function derivePasswordKey(password: string, salt: Buffer, kdf: ScryptKdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEYLEN, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: maxmem(kdf) }, (err, key) => (err ? reject(err) : resolve(key)));
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

export async function createUserKeys(
  password: string,
  opts: { kdf?: ScryptKdf } = {}
): Promise<{ envelope: UserKeyEnvelope; kek: Buffer; mnemonic: string }> {
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
      passwordWrap: wrap(await derivePasswordKey(password, passwordSalt, kdf), kek),
      recoveryKdf: { alg: 'bip39-pbkdf2' },
      recoveryWrap: wrap(mnemonicToWrapKey(mnemonic), kek),
      personKey: await newPersonKey(kek)
    }
  };
}

/** A fresh key pair for a person (#1762 slice 5), its private half wrapped under their KEK. */
export async function newPersonKey(kek: Buffer): Promise<PersonKey> {
  const pair = await newLinkKeyPair();
  const secret = Buffer.from(pair.linkKey, 'utf8');
  try {
    return { publicKey: pair.publicKey, privateWrap: wrap(kek, secret) };
  } finally {
    secret.fill(0);
  }
}

/** The public half of a person's key pair, checked strictly; null when they have none. */
export function personPublicKey(envelope: UserKeyEnvelope): LinkPublicKey | null {
  return parseLinkPublicKey(envelope.personKey?.publicKey);
}

/**
 * Seal a copy of `kek` to `recipient`'s public key (#1762 slice 5): the copy a
 * proxy grant carries. Only the recipient's private key opens it.
 */
export function sealKekCopy(recipient: LinkPublicKey, kek: Buffer): Promise<Lockbox> {
  return sealForLink(recipient, kek);
}

/**
 * Open a KEK copy sealed to this person (#1762 slice 5): `ownKek` unwraps
 * their private key from `envelope`, which opens `copy`. Throws when any step
 * fails; the private key never leaves this function.
 */
export async function openKekCopy(envelope: Pick<UserKeyEnvelope, 'personKey'>, ownKek: Buffer, copy: Lockbox): Promise<Buffer> {
  if (!envelope.personKey) throw new Error('cannot unwrap the person key');
  const secret = unwrap(ownKek, envelope.personKey.privateWrap, 'person');
  let opened: Uint8Array | undefined;
  try {
    opened = await openLockbox(secret.toString('utf8'), copy);
    if (opened.length !== KEYLEN) throw new Error('not a key copy');
    return Buffer.from(opened);
  } catch {
    throw new Error('cannot open the key copy');
  } finally {
    secret.fill(0);
    opened?.fill(0);
  }
}

export async function unwrapKekWithPassword(envelope: UserKeyEnvelope, password: string): Promise<Buffer> {
  const salt = Buffer.from(envelope.kdf.salt, 'base64');
  const key = await derivePasswordKey(password, salt, envelope.kdf);
  return unwrap(key, envelope.passwordWrap, 'password');
}

export function unwrapKekWithMnemonic(envelope: Pick<UserKeyEnvelope, 'recoveryWrap'>, mnemonic: string): Buffer {
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

/**
 * Which set of recovery words an envelope holds (#1928), as a short id: a
 * digest of the recovery wrap, which a new set of words replaces and nothing
 * else changes (a password change or a new person key keep it). Reveals
 * nothing about the words or the key; it is what a recorded "I saved my
 * recovery words" is bound to, so a new set asks again.
 */
export function recoveryWordsId(envelope: Pick<UserKeyEnvelope, 'recoveryWrap'>): string {
  const w = envelope.recoveryWrap;
  return createHash('sha256').update(`${w.iv}.${w.tag}.${w.ct}`).digest('hex').slice(0, 32);
}

/** True when two phrases are the same 12 words, compared as the recovery wrap reads them. */
export function sameMnemonic(entered: string, expected: string): boolean {
  const a = Buffer.from(normalizeMnemonic(entered));
  const b = Buffer.from(normalizeMnemonic(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function rewrapPassword(
  envelope: UserKeyEnvelope,
  oldPassword: string,
  newPassword: string,
  opts: { kdf?: ScryptKdf } = {}
): Promise<UserKeyEnvelope> {
  return rewrapPasswordWithKek(envelope, await unwrapKekWithPassword(envelope, oldPassword), newPassword, opts);
}

/**
 * Replace the password wrap, given the KEK itself (#1452): how the recovery
 * words set a new password when the old one is forgotten. The KEK bytes and
 * the recovery wrap are unchanged, so every store's wrapped DEK stays valid
 * and the same words keep working.
 */
export async function rewrapPasswordWithKek(
  envelope: UserKeyEnvelope,
  kek: Buffer,
  newPassword: string,
  opts: { kdf?: ScryptKdf } = {}
): Promise<UserKeyEnvelope> {
  const kdf = opts.kdf ?? { N: envelope.kdf.N, r: envelope.kdf.r, p: envelope.kdf.p };
  const passwordSalt = randomBytes(16);
  return {
    ...envelope,
    kdf: { ...kdf, salt: passwordSalt.toString('base64') },
    passwordWrap: wrap(await derivePasswordKey(newPassword, passwordSalt, kdf), kek)
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
 */
const SEALED_MAGIC = Buffer.from('NGDPSEAL1', 'ascii');
const TAGLEN = 16;

/** True when `bytes` start with the sealed-file magic. */
export function isSealedBytes(bytes: Buffer): boolean {
  return bytes.length >= SEALED_MAGIC.length + IVLEN + TAGLEN
    && bytes.subarray(0, SEALED_MAGIC.length).equals(SEALED_MAGIC);
}

/** Encrypt the bytes of one store file with the store DEK. */
export function sealBytes(dek: Buffer, plaintext: Buffer): Buffer {
  if (dek.length !== KEYLEN) throw new Error('encrypted store is locked: missing DEK');
  const iv = randomBytes(IVLEN);
  const cipher = createCipheriv('aes-256-gcm', dek, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([SEALED_MAGIC, iv, cipher.getAuthTag(), ct]);
}

/** Decrypt a store file written by {@link sealBytes}. */
export function openBytes(dek: Buffer, sealed: Buffer): Buffer {
  if (!isSealedBytes(sealed)) throw new Error('not a sealed store file');
  const ivStart = SEALED_MAGIC.length;
  const tagStart = ivStart + IVLEN;
  const ctStart = tagStart + TAGLEN;
  try {
    const decipher = createDecipheriv('aes-256-gcm', dek, sealed.subarray(ivStart, tagStart));
    decipher.setAuthTag(sealed.subarray(tagStart, ctStart));
    return Buffer.concat([decipher.update(sealed.subarray(ctStart)), decipher.final()]);
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
