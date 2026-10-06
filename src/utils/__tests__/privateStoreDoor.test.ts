/**
 * The store door's logic — #1414 (epic #1382).
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  TEST_PRIVATE_STORE_KDF,
  createUserKeys,
  unwrapDek,
  unwrapKekWithMnemonic,
  unwrapKekWithPassword
} from '../privateStoreCrypto';
import {
  clearPendingWords,
  commitStoreCopy,
  confirmAttempts,
  confirmWords,
  dropPendingWords,
  hasPendingWords,
  holdWordsForConfirmation,
  storeCopyExists,
  storeKindFromConfig,
  storeKindIds,
  storeDoorState
} from '../privateStoreDoor';
import { privateUserKeysPath, storeMetaPath } from '../privateStorePath';
import { vaultKindCategories } from '../../test-support/vaults';

const config = (values: Record<string, unknown>) =>
  (key: string, def: unknown): unknown => (key in values ? values[key] : def);

describe('store door (#1414)', () => {
  afterEach(() => clearPendingWords());

  describe('store kinds', () => {
    const get = config({
      'ngdpbase.system-category': vaultKindCategories({
        default: { encrypt: false },
        yourphr: { owner: 'yourphr', encrypt: true },
        odd: { owner: 'odd', encrypt: 'true' }
      }),
      // #1505: the old kind keys are read by nothing.
      'ngdpbase.stores.legacy.owner': 'admin'
    });

    test('a kind exists when a system-category declares its vault (#1505)', async () => {
      expect(storeKindFromConfig(get, 'default')).toEqual({ id: 'default', owner: 'admin', encrypt: false });
      expect(storeKindFromConfig(get, 'yourphr')).toEqual({ id: 'yourphr', owner: 'yourphr', encrypt: true });
      expect(storeKindFromConfig(get, 'nosuch')).toBeNull();
      expect(storeKindFromConfig(get, 'legacy')).toBeNull();
    });

    test('every kind is listed, by id, from the system-category entries (#1505)', async () => {
      expect(storeKindIds({ 'ngdpbase.system-category': vaultKindCategories({ default: {}, yourphr: { owner: 'yourphr' } }), 'ngdpbase.stores.legacy.owner': 'admin' }))
        .toEqual(['default', 'yourphr']);
    });

    test('encrypt is the boolean true and nothing else; a store id that is not a slug is no kind', async () => {
      expect(storeKindFromConfig(get, 'odd')?.encrypt).toBe(false);
      expect(storeKindFromConfig(get, '../default')).toBeNull();
    });

    test('attempts are one plus the configured retries', async () => {
      expect(confirmAttempts(config({}))).toBe(2);
      expect(confirmAttempts(config({ 'ngdpbase.stores.recovery.confirmretries': 0 }))).toBe(1);
      expect(confirmAttempts(config({ 'ngdpbase.stores.recovery.confirmretries': 3 }))).toBe(4);
      expect(confirmAttempts(config({ 'ngdpbase.stores.recovery.confirmretries': 'x' }))).toBe(1);
    });
  });

  describe('words pending confirmation', () => {
    const keys = () => createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const hold = async (attempts = 2) => {
      const k = await keys();
      holdWordsForConfirmation('h1', { username: 'molly', store: 'yourphr', kek: k.kek, envelope: k.envelope, mnemonic: k.mnemonic, attempts });
      return k;
    };

    test('the right words hand over the key once, and are then forgotten', async () => {
      const k = await hold();
      const out = confirmWords('h1', 'molly', 'yourphr', `  ${k.mnemonic.toUpperCase()} `);
      expect(out.status).toBe('confirmed');
      if (out.status === 'confirmed') expect(out.kek.equals(k.kek)).toBe(true);
      expect(confirmWords('h1', 'molly', 'yourphr', k.mnemonic).status).toBe('none');
    });

    test('a miss gets NEW words; the missed set no longer works, the new one does and unwraps the key', async () => {
      const k = await hold();
      const miss = confirmWords('h1', 'molly', 'yourphr', 'wrong words');
      expect(miss.status).toBe('retry');
      if (miss.status !== 'retry') return;
      expect(miss.mnemonic).not.toBe(k.mnemonic);

      expect(confirmWords('h1', 'molly', 'yourphr', k.mnemonic).status).toBe('exhausted');

      const again = await hold();
      const retry = confirmWords('h1', 'molly', 'yourphr', 'wrong');
      if (retry.status !== 'retry') throw new Error('expected retry');
      const ok = confirmWords('h1', 'molly', 'yourphr', retry.mnemonic);
      expect(ok.status).toBe('confirmed');
      if (ok.status === 'confirmed') {
        // The envelope that gets committed carries the words the user confirmed.
        expect(unwrapKekWithMnemonic(ok.envelope, retry.mnemonic).equals(again.kek)).toBe(true);
        expect((await unwrapKekWithPassword(ok.envelope, 'pw')).equals(again.kek)).toBe(true);
      }
    });

    test('attempts run out and nothing is left', async () => {
      await hold(1);
      expect(confirmWords('h1', 'molly', 'yourphr', 'wrong').status).toBe('exhausted');
      expect(hasPendingWords('h1', 'molly', 'yourphr')).toBe(false);
    });

    test('pending words belong to one user and one store', async () => {
      const k = await hold();
      expect(confirmWords('h1', 'bob', 'yourphr', k.mnemonic).status).toBe('none');
      expect(hasPendingWords('h1', 'molly', 'yourphr')).toBe(false);
    });

    test('logout drops them; so does the time limit', async () => {
      await hold();
      dropPendingWords('h1');
      expect(hasPendingWords('h1', 'molly', 'yourphr')).toBe(false);

      vi.useFakeTimers();
      try {
        await hold();
        vi.advanceTimersByTime(31 * 60 * 1000);
        expect(hasPendingWords('h1', 'molly', 'yourphr')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('commit', () => {
    let pagesDir: string;
    beforeEach(async () => {
      pagesDir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'store-door-')), 'pages');
    });
    afterEach(async () => { await fs.remove(path.dirname(pagesDir)); });

    const plain = { id: 'default', owner: 'admin', encrypt: false };
    const sealed = { id: 'yourphr', owner: 'yourphr', encrypt: true };

    test('an unencrypted copy writes store.json with kind, encrypt and created — and no key', async () => {
      await commitStoreCopy({ pagesDirectory: pagesDir, username: 'molly', kind: plain, now: new Date('2026-09-19T12:00:00Z') });
      expect(await fs.readJson(storeMetaPath(pagesDir, 'molly', 'default')))
        .toEqual({ kind: 'default', encrypt: false, created: '2026-09-19T12:00:00.000Z' });
      expect(await fs.pathExists(privateUserKeysPath(pagesDir, 'molly'))).toBe(false);
    });

    test('a sealed copy with a new key writes the envelope and a DEK wrapped by that key', async () => {
      const k = await createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
      const { dek } = await commitStoreCopy({ pagesDirectory: pagesDir, username: 'molly', kind: sealed, kek: k.kek, newEnvelope: k.envelope });
      expect(await fs.readJson(privateUserKeysPath(pagesDir, 'molly'))).toEqual(k.envelope);
      const meta = await fs.readJson(storeMetaPath(pagesDir, 'molly', 'yourphr'));
      expect(meta).toMatchObject({ kind: 'yourphr', encrypt: true });
      expect(unwrapDek(k.kek, meta).equals(dek as Buffer)).toBe(true);
    });

    test('an existing store.json is never overwritten, and a key made for it is removed again', async () => {
      await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'yourphr')));
      await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'yourphr'), { encrypt: true, dekWrap: { iv: 'a', tag: 'b', ct: 'c' } });
      const k = await createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });

      await expect(commitStoreCopy({ pagesDirectory: pagesDir, username: 'molly', kind: sealed, kek: k.kek, newEnvelope: k.envelope }))
        .rejects.toThrow();
      expect((await fs.readJson(storeMetaPath(pagesDir, 'molly', 'yourphr'))).dekWrap.ct).toBe('c');
      expect(await fs.pathExists(privateUserKeysPath(pagesDir, 'molly'))).toBe(false);
    });

    test('a sealed copy without a key is refused and writes nothing', async () => {
      await expect(commitStoreCopy({ pagesDirectory: pagesDir, username: 'molly', kind: sealed })).rejects.toThrow(/locked/);
      expect(await storeCopyExists({ pagesDirectory: pagesDir, username: 'molly', store: 'yourphr' })).toBe(false);
    });
  });
});

describe('the store door\'s state (#1414)', () => {
  test('the door: the site\'s kinds always open, an addon\'s only while it is loaded', async () => {
    const site = { id: 'default', owner: 'admin', encrypt: false };
    const addon = { id: 'yourphr', owner: 'yourphr', encrypt: true };

    expect(storeDoorState(site, null)).toEqual({ open: true });
    expect(storeDoorState(addon, 'loaded')).toEqual({ open: true });
    expect(storeDoorState(addon, 'failed')).toMatchObject({ open: false, reason: 'unavailable' });
    expect(storeDoorState(addon, 'disabled')).toMatchObject({ open: false, reason: 'disabled' });
    expect(storeDoorState(addon, 'absent')).toMatchObject({ open: false, reason: 'not-installed' });
    // No AddonsManager answering is treated as not installed, never as open.
    expect(storeDoorState(addon, null)).toMatchObject({ open: false, reason: 'not-installed' });
  });
});

