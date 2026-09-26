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
  planStoreDeclaration,
  readStoreDeclarations,
  storeDoorState
} from '../privateStoreDoor';
import { privateUserKeysPath, storeMetaPath } from '../privateStorePath';

const config = (values: Record<string, unknown>) =>
  (key: string, def: unknown): unknown => (key in values ? values[key] : def);

describe('store door (#1414)', () => {
  afterEach(() => clearPendingWords());

  describe('store kinds', () => {
    const get = config({
      'ngdpbase.stores.default.owner': 'admin',
      'ngdpbase.stores.default.encrypt': false,
      'ngdpbase.stores.yourphr.owner': 'yourphr',
      'ngdpbase.stores.yourphr.encrypt': true,
      'ngdpbase.stores.odd.owner': 'odd',
      'ngdpbase.stores.odd.encrypt': 'true'
    });

    test('a kind exists when configuration gives it an owner', () => {
      expect(storeKindFromConfig(get, 'default')).toEqual({ id: 'default', owner: 'admin', encrypt: false });
      expect(storeKindFromConfig(get, 'yourphr')).toEqual({ id: 'yourphr', owner: 'yourphr', encrypt: true });
      expect(storeKindFromConfig(get, 'nosuch')).toBeNull();
    });

    test('encrypt is the boolean true and nothing else; a store id that is not a slug is no kind', () => {
      expect(storeKindFromConfig(get, 'odd')?.encrypt).toBe(false);
      expect(storeKindFromConfig(get, '../default')).toBeNull();
    });

    test('attempts are one plus the configured retries', () => {
      expect(confirmAttempts(config({}))).toBe(2);
      expect(confirmAttempts(config({ 'ngdpbase.stores.recovery.confirmretries': 0 }))).toBe(1);
      expect(confirmAttempts(config({ 'ngdpbase.stores.recovery.confirmretries': 3 }))).toBe(4);
      expect(confirmAttempts(config({ 'ngdpbase.stores.recovery.confirmretries': 'x' }))).toBe(1);
    });
  });

  describe('words pending confirmation', () => {
    const keys = () => createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
    const hold = (attempts = 2) => {
      const k = keys();
      holdWordsForConfirmation('h1', { username: 'molly', store: 'yourphr', kek: k.kek, envelope: k.envelope, mnemonic: k.mnemonic, attempts });
      return k;
    };

    test('the right words hand over the key once, and are then forgotten', () => {
      const k = hold();
      const out = confirmWords('h1', 'molly', 'yourphr', `  ${k.mnemonic.toUpperCase()} `);
      expect(out.status).toBe('confirmed');
      if (out.status === 'confirmed') expect(out.kek.equals(k.kek)).toBe(true);
      expect(confirmWords('h1', 'molly', 'yourphr', k.mnemonic).status).toBe('none');
    });

    test('a miss gets NEW words; the missed set no longer works, the new one does and unwraps the key', () => {
      const k = hold();
      const miss = confirmWords('h1', 'molly', 'yourphr', 'wrong words');
      expect(miss.status).toBe('retry');
      if (miss.status !== 'retry') return;
      expect(miss.mnemonic).not.toBe(k.mnemonic);

      expect(confirmWords('h1', 'molly', 'yourphr', k.mnemonic).status).toBe('exhausted');

      const again = hold();
      const retry = confirmWords('h1', 'molly', 'yourphr', 'wrong');
      if (retry.status !== 'retry') throw new Error('expected retry');
      const ok = confirmWords('h1', 'molly', 'yourphr', retry.mnemonic);
      expect(ok.status).toBe('confirmed');
      if (ok.status === 'confirmed') {
        // The envelope that gets committed carries the words the user confirmed.
        expect(unwrapKekWithMnemonic(ok.envelope, retry.mnemonic).equals(again.kek)).toBe(true);
        expect(unwrapKekWithPassword(ok.envelope, 'pw').equals(again.kek)).toBe(true);
      }
    });

    test('attempts run out and nothing is left', () => {
      hold(1);
      expect(confirmWords('h1', 'molly', 'yourphr', 'wrong').status).toBe('exhausted');
      expect(hasPendingWords('h1', 'molly', 'yourphr')).toBe(false);
    });

    test('pending words belong to one user and one store', () => {
      const k = hold();
      expect(confirmWords('h1', 'bob', 'yourphr', k.mnemonic).status).toBe('none');
      expect(hasPendingWords('h1', 'molly', 'yourphr')).toBe(false);
    });

    test('logout drops them; so does the time limit', () => {
      hold();
      dropPendingWords('h1');
      expect(hasPendingWords('h1', 'molly', 'yourphr')).toBe(false);

      vi.useFakeTimers();
      try {
        hold();
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
      const k = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });
      const { dek } = await commitStoreCopy({ pagesDirectory: pagesDir, username: 'molly', kind: sealed, kek: k.kek, newEnvelope: k.envelope });
      expect(await fs.readJson(privateUserKeysPath(pagesDir, 'molly'))).toEqual(k.envelope);
      const meta = await fs.readJson(storeMetaPath(pagesDir, 'molly', 'yourphr'));
      expect(meta).toMatchObject({ kind: 'yourphr', encrypt: true });
      expect(unwrapDek(k.kek, meta).equals(dek as Buffer)).toBe(true);
    });

    test('an existing store.json is never overwritten, and a key made for it is removed again', async () => {
      await fs.ensureDir(path.dirname(storeMetaPath(pagesDir, 'molly', 'yourphr')));
      await fs.writeJson(storeMetaPath(pagesDir, 'molly', 'yourphr'), { encrypt: true, dekWrap: { iv: 'a', tag: 'b', ct: 'c' } });
      const k = createUserKeys('pw', { kdf: TEST_PRIVATE_STORE_KDF });

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

describe('addon-declared store kinds (#1414 step 2)', () => {
  const config = (entries: Record<string, unknown>) => (key: string, def: unknown): unknown =>
    (key in entries ? entries[key] : def);

  test('reads well-formed declarations and names what is wrong with the rest', () => {
    const { declarations, problems } = readStoreDeclarations([
      { id: 'yourphr', encrypt: true },
      { id: 'notes', encrypt: false },
      { id: 'Bad Id', encrypt: true },
      { id: 'import', encrypt: true },
      { id: 'health', encrypt: 'yes' }
    ]);

    expect(declarations).toEqual([{ id: 'yourphr', encrypt: true }, { id: 'notes', encrypt: false }]);
    expect(problems).toHaveLength(3);
    expect(problems.join(' ')).toMatch(/reserved/);
    // encrypt says whether someone's data is sealed: a non-boolean is refused, never read as false.
    expect(problems.join(' ')).toMatch(/health.*encrypt must be true or false/);
  });

  test('a manifest with no stores declares nothing, and a non-array is a problem', () => {
    expect(readStoreDeclarations(undefined)).toEqual({ declarations: [], problems: [] });
    expect(readStoreDeclarations({ id: 'x' }).problems).toEqual(['`stores` must be an array']);
  });

  test('a new id is persisted; the owner\'s own matching kind is left alone', () => {
    expect(planStoreDeclaration(config({}), 'yourphr', { id: 'yourphr', encrypt: true })).toEqual({ action: 'persist' });
    const owned = config({ 'ngdpbase.stores.yourphr.owner': 'yourphr', 'ngdpbase.stores.yourphr.encrypt': true });
    expect(planStoreDeclaration(owned, 'yourphr', { id: 'yourphr', encrypt: true })).toEqual({ action: 'match' });
  });

  test('a manifest that later disagrees is stale: config wins', () => {
    const owned = config({ 'ngdpbase.stores.yourphr.owner': 'yourphr', 'ngdpbase.stores.yourphr.encrypt': true });

    expect(planStoreDeclaration(owned, 'yourphr', { id: 'yourphr', encrypt: false }))
      .toEqual({ action: 'stale', configEncrypt: true });
  });

  test('an id another owner holds is denied — the site\'s default store included', () => {
    const other = config({ 'ngdpbase.stores.yourphr.owner': 'otheraddon' });
    expect(planStoreDeclaration(other, 'yourphr', { id: 'yourphr', encrypt: true }))
      .toEqual({ action: 'denied', owner: 'otheraddon' });

    const site = config({ 'ngdpbase.stores.default.owner': 'admin' });
    expect(planStoreDeclaration(site, 'sneaky', { id: 'default', encrypt: false }))
      .toEqual({ action: 'denied', owner: 'admin' });
  });

  test('an addon whose slug is the reserved "admin" owns nothing', () => {
    expect(planStoreDeclaration(config({}), 'admin', { id: 'x', encrypt: true }))
      .toEqual({ action: 'denied', owner: 'admin' });
  });

  test('a reserved id is never a kind, even when configuration names an owner', () => {
    const cfg = config({ 'ngdpbase.stores.import.owner': 'someone' });

    expect(storeKindFromConfig(cfg, 'import')).toBeNull();
  });

  test('the door: the site\'s kinds always open, an addon\'s only while it is loaded', () => {
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
