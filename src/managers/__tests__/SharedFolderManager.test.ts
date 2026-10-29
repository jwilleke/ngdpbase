/**
 * SharedFolderManager (#2124, epic #1775 decisions 1, 2, 4): each shared
 * folder's own key, wrapped under the server key and sealed for the
 * organization's recovery words; the words shown once and saved only on
 * the admin's say-so.
 *
 * The keys file is written to a per-test mkdtemp folder, removed afterwards
 * (never a data/ tree). The server key is a random value per test. The PDP and
 * the audit sink are stand-ins.
 *
 * Sabotaged once each (then restored):
 * - the server-key fingerprint check at start (skipped): the "different key"
 *   test went red;
 * - recording before saving (save first, then record): the refuse-on-failure
 *   test went red, a keys file was left on disk;
 * - the token check in saveRecoveryWords (skipped): the wrong-token test went red;
 * - the confirmation check in createFolderKey (skipped): the "unconfirmed
 *   words" test went red;
 * - the confirmed check in discardUnconfirmedWords (skipped): the "confirmed
 *   set cannot be discarded" test went red.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import SharedFolderManager, { SharedFolderRefusedError, SharedFoldersUnavailableError } from '../SharedFolderManager';
import { SHARED_FOLDERS_KEY_ENV } from '../../utils/sharedFoldersKey';
import { newRecoveryWords } from '../../utils/privateStoreCrypto';

interface Subj { username: string; isAuthenticated: boolean; roles: string[] }
const admin = (username = 'ann'): never => ({ username, roles: ['admin'], isAuthenticated: true }) as never;

describe('SharedFolderManager (#2124)', () => {
  let dir: string;
  let admins: Set<string>;
  let audited: Array<Record<string, unknown>>;
  let auditFails: boolean;
  /** `user/wordsId` pairs ConsentManager holds a current confirmation for. */
  let confirmed: Set<string>;
  let wordingPage: boolean;
  const savedKey = process.env[SHARED_FOLDERS_KEY_ENV];

  const build = async (): Promise<SharedFolderManager> => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (_k: string, d: unknown) => d,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.shared-folders.storagedir' ? dir : d)
      },
      ConsentManager: {
        documents: async (scope: string) => (scope === 'shared-folders-recovery-words' && wordingPage ? [{ id: scope }] : []),
        pendingFor: async (u: string, scope: string, subject?: string) =>
          (scope === 'shared-folders-recovery-words' && wordingPage && !confirmed.has(`${u}/${subject}`) ? [{ id: scope }] : [])
      },
      PolicyDecisionPoint: { permits: (s: Subj, a: string) => Promise.resolve(a === 'admin-system' && s.isAuthenticated && admins.has(s.username)) },
      AuditManager: {
        logAuditEvent: (e: Record<string, unknown>) => {
          if (auditFails) return Promise.reject(new Error('audit device full'));
          audited.push(e);
          return Promise.resolve('evt');
        },
        flushAuditQueue: () => Promise.resolve()
      }
    };
    const manager = new SharedFolderManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  /** Make and save the recovery words as `who`, and (unless told not to) record their confirmation; returns the words. */
  const setUpWords = async (m: SharedFolderManager, who = 'ann', confirm = true): Promise<string> => {
    const { token, words } = await m.prepareRecoveryWords(admin(who));
    const wordsId = await m.saveRecoveryWords(admin(who), token);
    if (confirm) confirmed.add(`${who}/${wordsId}`);
    return words.join(' ');
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-folders-2124-'));
    process.env[SHARED_FOLDERS_KEY_ENV] = randomBytes(32).toString('base64');
    admins = new Set(['ann', 'bob']);
    audited = [];
    auditFails = false;
    confirmed = new Set();
    wordingPage = true;
  });

  afterEach(() => {
    // Only this test's own mkdtemp folder.
    fs.rmSync(dir, { recursive: true, force: true });
    if (savedKey === undefined) delete process.env[SHARED_FOLDERS_KEY_ENV]; else process.env[SHARED_FOLDERS_KEY_ENV] = savedKey;
  });

  describe('the recovery words', () => {
    test('are 12 BIP39 words, shown before anything is saved; saving records who was shown them', async () => {
      const m = await build();
      const { token, words } = await m.prepareRecoveryWords(admin());
      expect(words).toHaveLength(12);
      expect(words.every((w) => /^[a-z]+$/.test(w))).toBe(true);
      expect(m.recoveryWordsInfo()).toBeNull();
      expect(fs.existsSync(path.join(dir, 'keys.json'))).toBe(false);

      const wordsId = await m.saveRecoveryWords(admin(), token);
      const info = m.recoveryWordsInfo();
      expect(info).toMatchObject({ wordsId, shownTo: 'ann' });
      expect(audited.map((e) => [e.eventType, e.user, (e.metadata as Record<string, unknown>).wordsId])).toEqual([['shared-folder-words-create', 'ann', wordsId]]);
      // The words are never kept or recorded.
      const file = fs.readFileSync(path.join(dir, 'keys.json'), 'utf8');
      for (const w of words) expect(file).not.toMatch(new RegExp(`\\b${w}\\b`));
      expect(JSON.stringify(audited)).not.toContain(words.join(' '));
      expect((fs.statSync(path.join(dir, 'keys.json')).mode & 0o777).toString(8)).toBe('600');
    });

    test('a token that is not the one shown to this admin saves nothing, and the words are discarded', async () => {
      const m = await build();
      const { token } = await m.prepareRecoveryWords(admin('ann'));
      await expect(m.saveRecoveryWords(admin('bob'), token)).rejects.toBeInstanceOf(SharedFolderRefusedError);
      await expect(m.saveRecoveryWords(admin('ann'), 'not-the-token')).rejects.toBeInstanceOf(SharedFolderRefusedError);
      // Discarded: the right token no longer works either.
      await expect(m.saveRecoveryWords(admin('ann'), token)).rejects.toBeInstanceOf(SharedFolderRefusedError);
      expect(m.recoveryWordsInfo()).toBeNull();
    });

    test('discarded words cannot be saved', async () => {
      const m = await build();
      const { token } = await m.prepareRecoveryWords(admin());
      m.discardRecoveryWords(admin());
      await expect(m.saveRecoveryWords(admin(), token)).rejects.toThrow(/no longer waiting/);
    });

    test('a second set is refused once one is saved (a new set is a later slice)', async () => {
      const m = await build();
      await setUpWords(m);
      await expect(m.prepareRecoveryWords(admin('bob'))).rejects.toThrow(/already have recovery words/);
    });

    test('a failed audit record refuses: nothing is saved', async () => {
      const m = await build();
      const { token } = await m.prepareRecoveryWords(admin());
      auditFails = true;
      await expect(m.saveRecoveryWords(admin(), token)).rejects.toThrow();
      expect(m.recoveryWordsInfo()).toBeNull();
      expect(fs.existsSync(path.join(dir, 'keys.json'))).toBe(false);
    });

    test('only a holder of admin-system may make them', async () => {
      const m = await build();
      admins.delete('ann');
      await expect(m.prepareRecoveryWords(admin())).rejects.toThrow(/needs admin-system/);
    });
  });

  describe('discarding an unconfirmed set (operator, 2026-10-29)', () => {
    test('any admin may discard words the admin shown them has not confirmed, then make and confirm a new set', async () => {
      const m = await build();
      await setUpWords(m, 'ann', false);
      expect(await m.recoveryWordsConfirmed()).toBe(false);
      await m.discardUnconfirmedWords(admin('bob'));
      expect(m.recoveryWordsInfo()).toBeNull();
      expect(audited.map((e) => [e.eventType, e.user, (e.metadata as Record<string, unknown>).shownTo])).toContainEqual(['shared-folder-words-discard', 'bob', 'ann']);
      await setUpWords(m, 'bob');
      expect(m.recoveryWordsInfo()?.shownTo).toBe('bob');
      expect(await m.recoveryWordsConfirmed()).toBe(true);
      await m.createFolderKey(admin('bob'), 'executive');
    });

    test('a confirmed set cannot be discarded', async () => {
      const m = await build();
      await setUpWords(m);
      await expect(m.discardUnconfirmedWords(admin('bob'))).rejects.toThrow(/confirmed saving these recovery words/);
      expect(m.recoveryWordsInfo()).not.toBeNull();
    });

    test('a set that protects folder keys cannot be discarded, even when a new wording version asks again', async () => {
      const m = await build();
      await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      confirmed.clear(); // as if the wording's version was raised
      expect(m.recoveryWordsInfo()?.protectsFolders).toBe(true);
      await expect(m.discardUnconfirmedWords(admin('bob'))).rejects.toThrow(/protect shared folders/);
    });

    test('only an admin, and a failed audit record refuses: nothing is removed', async () => {
      const m = await build();
      await setUpWords(m, 'ann', false);
      admins.delete('bob');
      await expect(m.discardUnconfirmedWords(admin('bob'))).rejects.toThrow(/needs admin-system/);
      auditFails = true;
      await expect(m.discardUnconfirmedWords(admin('ann'))).rejects.toThrow();
      expect((await build()).recoveryWordsInfo()).not.toBeNull();
    });

    test('nothing to discard without words', async () => {
      await expect((await build()).discardUnconfirmedWords(admin())).rejects.toThrow(/no recovery words to discard/);
    });
  });

  describe('folder keys', () => {
    test('need the recovery words first', async () => {
      const m = await build();
      await expect(m.createFolderKey(admin(), 'executive')).rejects.toThrow(/recovery words first/);
    });

    test('need the words confirmed by the admin shown them, not merely made', async () => {
      const m = await build();
      const words = await setUpWords(m, 'ann', false);
      await expect(m.createFolderKey(admin(), 'executive')).rejects.toThrow(/ann has not confirmed saving/);
      // Another admin's confirmation does not count.
      confirmed.add(`bob/${m.recoveryWordsInfo()!.wordsId}`);
      await expect(m.createFolderKey(admin('bob'), 'executive')).rejects.toThrow(/has not confirmed/);
      // Without the wording page nobody could have confirmed it.
      confirmed.add(`ann/${m.recoveryWordsInfo()!.wordsId}`);
      wordingPage = false;
      await expect(m.createFolderKey(admin(), 'executive')).rejects.toThrow(/has not confirmed/);
      wordingPage = true;
      await m.createFolderKey(admin(), 'executive');
      expect((await m.openFolderKeyWithWords(admin(), 'executive', words)).equals(await m.openFolderKey(admin(), 'executive'))).toBe(true);
    });

    test('round-trip through the server-key wrap and through the words, which give the same key', async () => {
      const m = await build();
      const words = await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      const byServer = await m.openFolderKey(admin(), 'executive');
      const byWords = await m.openFolderKeyWithWords(admin(), 'executive', words);
      expect(byServer).toHaveLength(32);
      expect(byWords.equals(byServer)).toBe(true);
      // Capitals and extra spaces do not matter, as for personal recovery words.
      expect((await m.openFolderKeyWithWords(admin(), 'executive', `  ${words.toUpperCase().replace(/ /g, '   ')} `)).equals(byServer)).toBe(true);
      expect(audited.map((e) => [e.eventType, e.resource])).toContainEqual(['shared-folder-key-create', 'executive']);
      // Never the key in the file or the record.
      expect(fs.readFileSync(path.join(dir, 'keys.json'), 'utf8')).not.toContain(byServer.toString('base64'));
    });

    test('each folder has its own key', async () => {
      const m = await build();
      await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      await m.createFolderKey(admin(), 'default');
      expect((await m.openFolderKey(admin(), 'executive')).equals(await m.openFolderKey(admin(), 'default'))).toBe(false);
      await expect(m.createFolderKey(admin(), 'executive')).rejects.toThrow(/already has a key/);
    });

    test('wrong recovery words do not open a folder key', async () => {
      const m = await build();
      await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      const other = newRecoveryWords(randomBytes(32)).mnemonic;
      await expect(m.openFolderKeyWithWords(admin(), 'executive', other)).rejects.toThrow(/recovery phrase does not unwrap/);
    });

    test('a different server key does not open them: the manager says so at start and refuses', async () => {
      const m = await build();
      await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');

      process.env[SHARED_FOLDERS_KEY_ENV] = randomBytes(32).toString('base64');
      const restarted = await build();
      expect(restarted.unavailableReason()).toMatch(/not the key the shared folders were made under/);
      expect(restarted.getManagerStatus().state).toBe('degraded');
      await expect(restarted.openFolderKey(admin(), 'executive')).rejects.toBeInstanceOf(SharedFoldersUnavailableError);
    });

    test('the same server key after a restart opens them', async () => {
      const m = await build();
      const words = await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      const before = await m.openFolderKey(admin(), 'executive');
      const restarted = await build();
      expect(restarted.unavailableReason()).toBeNull();
      expect((await restarted.openFolderKey(admin(), 'executive')).equals(before)).toBe(true);
      expect((await restarted.openFolderKeyWithWords(admin(), 'executive', words)).equals(before)).toBe(true);
    });

    test('a wrapped key altered on disk does not open', async () => {
      const m = await build();
      await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      const file = path.join(dir, 'keys.json');
      const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { folders: Record<string, { serverWrap: { ct: string } }> };
      const ct = Buffer.from(json.folders.executive.serverWrap.ct, 'base64');
      ct[0] ^= 0xff;
      json.folders.executive.serverWrap.ct = ct.toString('base64');
      fs.writeFileSync(file, JSON.stringify(json));
      await expect((await build()).openFolderKey(admin(), 'executive')).rejects.toThrow(/cannot unwrap/);
    });

    test('no server key at all: degraded, and nothing opens', async () => {
      delete process.env[SHARED_FOLDERS_KEY_ENV];
      const m = await build();
      expect(m.unavailableReason()).toMatch(/NGDPBASE_SHARED_FOLDERS_KEY is not set/);
      await expect(m.prepareRecoveryWords(admin())).rejects.toBeInstanceOf(SharedFoldersUnavailableError);
    });

    test('opening a key asks the PDP', async () => {
      const m = await build();
      await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      admins.delete('ann');
      await expect(m.openFolderKey(admin(), 'executive')).rejects.toBeInstanceOf(SharedFolderRefusedError);
    });

    test('a folder name must be a plain slug', async () => {
      const m = await build();
      await setUpWords(m);
      await expect(m.createFolderKey(admin(), '../etc')).rejects.toThrow(/not a folder name/);
    });
  });

  test('declares its folder for the backup', async () => {
    const m = await build();
    expect(m.backupFolders()).toEqual([{ part: 'shared-folders', folder: dir, optional: true }]);
  });
});
