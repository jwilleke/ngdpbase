/**
 * User KEK / store DEK / 12-word recovery — #1384 (epic #1382)
 *
 * Keys are not on PageManager. These tests exercise the shared helpers only.
 */

import { createHash } from 'crypto';
import {
  TEST_PRIVATE_STORE_KDF,
  assertEncryptedStoreWritable,
  createEncryptedStore,
  createUserKeys,
  mnemonicWordCount,
  rewrapPassword,
  unwrapDek,
  unwrapKekWithMnemonic,
  unwrapKekWithPassword
} from '../privateStoreCrypto';
import {
  clearUnlockedPrivateStores,
  getUnlockedDek,
  getUnlockedKek,
  lockPrivateStores,
  setUnlockedDek,
  unlockPrivateStores
} from '../privateStoreUnlock';

const kdf = TEST_PRIVATE_STORE_KDF;

describe('private store keys (#1384)', () => {
  afterEach(() => {
    clearUnlockedPrivateStores();
  });

  test('password unwraps the KEK; a wrong password does not', () => {
    const { envelope, kek } = createUserKeys('correct-horse', { kdf });

    expect(Buffer.compare(unwrapKekWithPassword(envelope, 'correct-horse'), kek)).toBe(0);
    expect(() => unwrapKekWithPassword(envelope, 'wrong')).toThrow(/password/i);
  });

  test('recovery phrase unwraps the same KEK', () => {
    const { envelope, kek, mnemonic } = createUserKeys('pw', { kdf });

    expect(mnemonic.split(' ')).toHaveLength(mnemonicWordCount);
    expect(Buffer.compare(unwrapKekWithMnemonic(envelope, mnemonic), kek)).toBe(0);
    expect(() => unwrapKekWithMnemonic(envelope, 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about')).toThrow(/recovery/i);
  });

  test('password change re-wraps the KEK; recovery wrap still works; DEK wrap is unchanged', () => {
    const created = createUserKeys('old-pw', { kdf });
    const store = createEncryptedStore(created.kek);
    const dekBefore = unwrapDek(created.kek, store);

    const rewrapped = rewrapPassword(created.envelope, 'old-pw', 'new-pw', { kdf });
    const kek = unwrapKekWithPassword(rewrapped, 'new-pw');
    expect(Buffer.compare(kek, created.kek)).toBe(0);
    expect(() => unwrapKekWithPassword(rewrapped, 'old-pw')).toThrow(/password/i);
    expect(Buffer.compare(unwrapKekWithMnemonic(rewrapped, created.mnemonic), created.kek)).toBe(0);
    expect(Buffer.compare(unwrapDek(kek, store), dekBefore)).toBe(0);
  });

  test('encrypt-on write refuses a missing DEK; plaintext store does not need one', () => {
    expect(() => assertEncryptedStoreWritable({ encrypt: true, dek: undefined })).toThrow(/locked|DEK|decrypt/i);
    expect(() => assertEncryptedStoreWritable({ encrypt: true, dek: Buffer.alloc(0) })).toThrow();
    expect(() => assertEncryptedStoreWritable({ encrypt: false, dek: undefined })).not.toThrow();
  });

  test('unlock bag is keyed by session id, not a manager instance', () => {
    const a = createUserKeys('a', { kdf });
    const b = createUserKeys('b', { kdf });
    const storeA = createEncryptedStore(a.kek);

    unlockPrivateStores('sid-a', 'alice', a.kek);
    unlockPrivateStores('sid-b', 'bob', b.kek);
    setUnlockedDek('sid-a', 'yourphr', unwrapDek(a.kek, storeA));

    expect(Buffer.compare(getUnlockedKek('sid-a'), a.kek)).toBe(0);
    expect(Buffer.compare(getUnlockedKek('sid-b'), b.kek)).toBe(0);
    expect(getUnlockedDek('sid-a', 'yourphr')?.length).toBe(32);
    expect(getUnlockedDek('sid-b', 'yourphr')).toBeUndefined();

    lockPrivateStores('sid-a');
    expect(getUnlockedKek('sid-a')).toBeUndefined();
    expect(getUnlockedKek('sid-b')?.length).toBe(32);

    expect(() =>
      assertEncryptedStoreWritable({ encrypt: true, dek: getUnlockedDek('sid-a', 'yourphr') })
    ).toThrow();
  });

  test('helpers never put key bytes into a JSON session blob', () => {
    const { kek } = createUserKeys('pw', { kdf });
    unlockPrivateStores('sid', 'molly', kek);
    const json = JSON.stringify({ sessionId: 'sid', user: 'molly' });
    expect(json).not.toContain(kek.toString('base64'));
    expect(json).not.toContain(kek.toString('hex'));
  });

  test('two envelopes for the same password are not byte-identical (salted wraps)', () => {
    const a = createUserKeys('same', { kdf });
    const b = createUserKeys('same', { kdf });
    expect(a.envelope).not.toEqual(b.envelope);
    expect(createHash('sha256').update(JSON.stringify(a.envelope)).digest('hex'))
      .not.toBe(createHash('sha256').update(JSON.stringify(b.envelope)).digest('hex'));
  });
});
