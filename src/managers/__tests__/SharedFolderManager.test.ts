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
 *   set cannot be discarded" test went red;
 * - #2095, `executive` left out of SHIPPED_SHARED_FOLDERS: the "shipped
 *   folders" and "made at start" tests went red;
 * - #2144, the typed-back check in saveRecoveryWords (skipped): the "words
 *   that do not match" tests went red;
 * - #2144, a new set keeping each folder's old recovery copy (not sealed
 *   again): the "old words no longer open them" tests went red;
 * - #2144, the fresh sign-in asked again at save (skipped): the "needs a
 *   fresh sign-in" test went red.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import SharedFolderManager, { SharedFolderRefusedError, SharedFoldersUnavailableError, SharedFolderWordsMismatchError } from '../SharedFolderManager';
import { SHARED_FOLDERS_KEY_ENV } from '../../utils/sharedFoldersKey';
import { newRecoveryWords } from '../../utils/privateStoreCrypto';
import { pdpOver } from '../../test-support/policyDecisionPoint';

const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;

interface Subj { username: string; isAuthenticated: boolean; roles: string[] }
const admin = (username = 'ann'): never => ({ username, roles: ['admin'], isAuthenticated: true }) as never;

describe('SharedFolderManager (#2124)', () => {
  let dir: string;
  let admins: Set<string>;
  /** `user:shared/<folder>` pairs a policy grants shared-folder-read (#2125). */
  let readers: Set<string>;
  let audited: Array<Record<string, unknown>>;
  let auditFails: boolean;
  /** `user/wordsId` pairs ConsentManager holds a current confirmation for. */
  let confirmed: Set<string>;
  let wordingPage: boolean;
  /** Who the PDP permits `config-manage` now: a fresh sign-in (step-up, #2144). */
  let fresh: Set<string>;
  const savedKey = process.env[SHARED_FOLDERS_KEY_ENV];

  /** The manager over `dir`; `pdp` replaces the stand-in PDP (the shipped policies' test). */
  const build = async (pdp?: unknown): Promise<SharedFolderManager> => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (_k: string, d: unknown) => d,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.shared-folders.storagedir' ? dir : k === 'ngdpbase.page.provider.filesystem.storagedir' ? path.join(dir, 'pages') : d)
      },
      ConsentManager: {
        documents: async (scope: string) => (scope === 'shared-folders-recovery-words' && wordingPage ? [{ id: scope }] : []),
        pendingFor: async (u: string, scope: string, subject?: string) =>
          (scope === 'shared-folders-recovery-words' && wordingPage && !confirmed.has(`${u}/${subject}`) ? [{ id: scope }] : [])
      },
      PolicyDecisionPoint: pdp ?? {
        permits: (s: Subj, a: string) => Promise.resolve(s.isAuthenticated && (a === 'admin-system' ? admins.has(s.username) : a === 'config-manage' && fresh.has(s.username))),
        decide: (s: Subj, r: { action: string; attributes: Record<string, unknown> }) =>
          Promise.resolve({ permit: r.action === 'shared-folder-read' && s.isAuthenticated && readers.has(`${s.username}:${String(r.attributes['shared-folder'])}`) })
      },
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
    const wordsId = await m.saveRecoveryWords(admin(who), token, words.join(' '));
    if (confirm) confirmed.add(`${who}/${wordsId}`);
    return words.join(' ');
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-folders-2124-'));
    process.env[SHARED_FOLDERS_KEY_ENV] = randomBytes(32).toString('base64');
    admins = new Set(['ann', 'bob']);
    readers = new Set(['ann:shared/executive', 'bob:shared/executive', 'ann:shared/default']);
    audited = [];
    auditFails = false;
    confirmed = new Set();
    wordingPage = true;
    fresh = new Set(['ann', 'bob']);
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

      const wordsId = await m.saveRecoveryWords(admin(), token, words.join(' '));
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
      const { token, words } = await m.prepareRecoveryWords(admin('ann'));
      const typed = words.join(' ');
      await expect(m.saveRecoveryWords(admin('bob'), token, typed)).rejects.toBeInstanceOf(SharedFolderRefusedError);
      await expect(m.saveRecoveryWords(admin('ann'), 'not-the-token', typed)).rejects.toBeInstanceOf(SharedFolderRefusedError);
      // Discarded: the right token no longer works either.
      await expect(m.saveRecoveryWords(admin('ann'), token, typed)).rejects.toBeInstanceOf(SharedFolderRefusedError);
      expect(m.recoveryWordsInfo()).toBeNull();
    });

    test('discarded words cannot be saved', async () => {
      const m = await build();
      const { token, words } = await m.prepareRecoveryWords(admin());
      m.discardRecoveryWords(admin());
      await expect(m.saveRecoveryWords(admin(), token, words.join(' '))).rejects.toThrow(/no longer waiting/);
    });

    test('a second set is refused once one is saved: a saved set is replaced with a new set (#2144)', async () => {
      const m = await build();
      await setUpWords(m);
      await expect(m.prepareRecoveryWords(admin('bob'))).rejects.toThrow(/already have recovery words/);
    });

    test('a failed audit record refuses: nothing is saved', async () => {
      const m = await build();
      const { token, words } = await m.prepareRecoveryWords(admin());
      auditFails = true;
      await expect(m.saveRecoveryWords(admin(), token, words.join(' '))).rejects.toThrow();
      expect(m.recoveryWordsInfo()).toBeNull();
      expect(fs.existsSync(path.join(dir, 'keys.json'))).toBe(false);
    });

    test('only a holder of admin-system may make them', async () => {
      const m = await build();
      admins.delete('ann');
      await expect(m.prepareRecoveryWords(admin())).rejects.toThrow(/needs admin-system/);
    });
  });

  describe('typed back before anything is saved (#2144)', () => {
    test('words that do not match save nothing, and the same words can be typed again while they wait', async () => {
      const m = await build();
      const { token, words } = await m.prepareRecoveryWords(admin());
      const wrong = [...words.slice(0, 11), words[11] === 'abandon' ? 'ability' : 'abandon'].join(' ');
      await expect(m.saveRecoveryWords(admin(), token, wrong)).rejects.toBeInstanceOf(SharedFolderWordsMismatchError);
      await expect(m.saveRecoveryWords(admin(), token, '')).rejects.toBeInstanceOf(SharedFolderWordsMismatchError);
      expect(m.recoveryWordsInfo()).toBeNull();
      expect(fs.existsSync(path.join(dir, 'keys.json'))).toBe(false);
      expect(audited).toEqual([]);
      // Still waiting: the right words, typed with capitals and extra spaces, save them.
      expect(m.waitingWords(admin())).toEqual({ token, replacing: false });
      await m.saveRecoveryWords(admin(), token, `  ${words.join('   ').toUpperCase()} `);
      expect(m.recoveryWordsInfo()?.shownTo).toBe('ann');
      expect(m.waitingWords(admin())).toBeNull();
    });
  });

  describe('downloading or printing words that wait (#2144)', () => {
    test('hands over the waiting words, recorded first with who, which set and how, never the words', async () => {
      const m = await build();
      const { token, words } = await m.prepareRecoveryWords(admin());
      const got = await m.pendingRecoveryWords(admin(), token, 'download');
      expect(got.words).toEqual(words);
      await m.pendingRecoveryWords(admin(), token, 'print');
      expect(audited.map((e) => [e.eventType, e.user, (e.metadata as Record<string, unknown>).how, (e.metadata as Record<string, unknown>).wordsId]))
        .toEqual([['recovery-words-export', 'ann', 'download', got.wordsId], ['recovery-words-export', 'ann', 'print', got.wordsId]]);
      for (const w of words) expect(JSON.stringify(audited)).not.toMatch(new RegExp(`\\b${w}\\b`));
      // The set downloaded is the set saved.
      expect(await m.saveRecoveryWords(admin(), token, words.join(' '))).toBe(got.wordsId);
      // Once saved they are gone: nothing to download.
      await expect(m.pendingRecoveryWords(admin(), token, 'download')).rejects.toThrow(/no longer waiting/);
    });

    test('refused for another admin or a wrong token, and a failed record hands nothing over', async () => {
      const m = await build();
      const { token } = await m.prepareRecoveryWords(admin());
      await expect(m.pendingRecoveryWords(admin('bob'), token, 'download')).rejects.toBeInstanceOf(SharedFolderRefusedError);
      await expect(m.pendingRecoveryWords(admin(), 'not-the-token', 'download')).rejects.toBeInstanceOf(SharedFolderRefusedError);
      auditFails = true;
      await expect(m.pendingRecoveryWords(admin(), token, 'download')).rejects.toThrow(/audit device full/);
      // A refused export does not discard the words.
      expect(m.waitingWords(admin())?.token).toBe(token);
    });
  });

  describe('a new set of words (#2144)', () => {
    /** Make a new set as `who`, typed back; returns the new words. */
    const replaceWords = async (m: SharedFolderManager, who = 'ann'): Promise<string> => {
      const { token, words } = await m.prepareNewRecoveryWords(admin(who));
      const wordsId = await m.saveRecoveryWords(admin(who), token, words.join(' '));
      confirmed.add(`${who}/${wordsId}`);
      return words.join(' ');
    };

    test('seals every folder key for the new words; the old words no longer open them; recorded with both sets', async () => {
      const m = await build();
      const oldWords = await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      await m.createFolderKey(admin(), 'default');
      const oldId = m.recoveryWordsInfo()!.wordsId;
      const keys = { executive: await m.openFolderKey(admin(), 'executive'), default: await m.openFolderKey(admin(), 'default') };

      const newWords = await replaceWords(m, 'bob');
      const info = m.recoveryWordsInfo()!;
      expect(info.wordsId).not.toBe(oldId);
      expect(info.shownTo).toBe('bob');
      for (const name of ['executive', 'default'] as const) {
        expect((await m.openFolderKeyWithWords(admin(), name, newWords)).equals(keys[name])).toBe(true);
        await expect(m.openFolderKeyWithWords(admin(), name, oldWords)).rejects.toThrow(/recovery phrase does not unwrap/);
        // The server key still opens the same key: only the recovery copy changed.
        expect((await m.openFolderKey(admin(), name)).equals(keys[name])).toBe(true);
      }
      const json = JSON.parse(fs.readFileSync(path.join(dir, 'keys.json'), 'utf8')) as { folders: Record<string, { wordsId: string }> };
      expect(Object.values(json.folders).map((f) => f.wordsId)).toEqual([info.wordsId, info.wordsId]);
      const replace = audited.find((e) => e.eventType === 'shared-folder-words-replace');
      expect(replace).toMatchObject({ user: 'bob', metadata: expect.objectContaining({ wordsId: info.wordsId, replaces: oldId, folders: 2 }) });
      expect(JSON.stringify(audited)).not.toContain(newWords);
      // After a restart too.
      const restarted = await build();
      expect((await restarted.openFolderKeyWithWords(admin(), 'executive', newWords)).equals(keys.executive)).toBe(true);
    });

    test('needs a fresh sign-in, to make the set and again to save it', async () => {
      const m = await build();
      await setUpWords(m);
      fresh.delete('ann');
      await expect(m.prepareNewRecoveryWords(admin())).rejects.toThrow(/fresh sign-in/);
      fresh.add('ann');
      const { token, words } = await m.prepareNewRecoveryWords(admin());
      const before = m.recoveryWordsInfo()!.wordsId;
      fresh.delete('ann');
      await expect(m.saveRecoveryWords(admin(), token, words.join(' '))).rejects.toThrow(/fresh sign-in/);
      expect(m.recoveryWordsInfo()!.wordsId).toBe(before);
      // Still waiting: with a fresh sign-in it finishes.
      fresh.add('ann');
      await m.saveRecoveryWords(admin(), token, words.join(' '));
      expect(m.recoveryWordsInfo()!.wordsId).not.toBe(before);
    });

    test('only an admin; and not before a first set exists', async () => {
      const m = await build();
      await expect(m.prepareNewRecoveryWords(admin())).rejects.toThrow(/no recovery words yet/);
      await setUpWords(m);
      admins.delete('bob');
      await expect(m.prepareNewRecoveryWords(admin('bob'))).rejects.toThrow(/needs admin-system/);
    });

    test('a failure keeps the old set: a failed record, or the file not renamed into place', async () => {
      const m = await build();
      const oldWords = await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      const oldId = m.recoveryWordsInfo()!.wordsId;
      const keysBefore = fs.readFileSync(path.join(dir, 'keys.json'), 'utf8');

      const first = await m.prepareNewRecoveryWords(admin());
      auditFails = true;
      await expect(m.saveRecoveryWords(admin(), first.token, first.words.join(' '))).rejects.toThrow(/audit device full/);
      auditFails = false;
      const rename = vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('disk gone'));
      await expect(m.saveRecoveryWords(admin(), first.token, first.words.join(' '))).rejects.toThrow(/disk gone/);
      rename.mockRestore();

      for (const manager of [m, await build()]) {
        expect(manager.recoveryWordsInfo()!.wordsId).toBe(oldId);
        expect((await manager.openFolderKeyWithWords(admin(), 'executive', oldWords)).length).toBe(32);
        await expect(manager.openFolderKeyWithWords(admin(), 'executive', first.words.join(' '))).rejects.toThrow();
      }
      expect(fs.readFileSync(path.join(dir, 'keys.json'), 'utf8')).toBe(keysBefore);
    });

    test('an unconfirmed new set can be discarded or left, and the old set stays; words that do not match change nothing', async () => {
      const m = await build();
      const oldWords = await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      const oldId = m.recoveryWordsInfo()!.wordsId;
      const { token, words } = await m.prepareNewRecoveryWords(admin());
      expect(m.waitingWords(admin())).toEqual({ token, replacing: true });
      await expect(m.saveRecoveryWords(admin(), token, oldWords)).rejects.toBeInstanceOf(SharedFolderWordsMismatchError);
      m.discardRecoveryWords(admin());
      await expect(m.saveRecoveryWords(admin(), token, words.join(' '))).rejects.toThrow(/no longer waiting/);
      expect(m.recoveryWordsInfo()!.wordsId).toBe(oldId);
      expect((await m.openFolderKeyWithWords(admin(), 'executive', oldWords)).length).toBe(32);
      expect(audited.some((e) => e.eventType === 'shared-folder-words-replace')).toBe(false);
    });

    test('replaces a set that protects folders and was never confirmed again, whose reminder nobody could clear', async () => {
      const m = await build();
      await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      confirmed.clear(); // a new wording version asks again, and ann is gone
      await expect(m.discardUnconfirmedWords(admin('bob'))).rejects.toThrow(/protect shared folders/);
      const newWords = await replaceWords(m, 'bob');
      expect(await m.recoveryWordsConfirmed()).toBe(true);
      expect((await m.openFolderKeyWithWords(admin('bob'), 'executive', newWords)).length).toBe(32);
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

    test('opening a key asks the PDP for shared-folder-read on the folder (#2125), not admin-system', async () => {
      const m = await build();
      await setUpWords(m);
      await m.createFolderKey(admin(), 'executive');
      admins.delete('ann');
      // Still a reader of shared/executive: no admin-system needed to open it.
      expect((await m.openFolderKey(admin(), 'executive')).length).toBe(32);
      readers.delete('ann:shared/executive');
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

  describe('folders (#2125)', () => {
    const storeJson = (name: string): string => path.join(dir, 'pages', 'vaults', 'shared-folders', name, 'store.json');

    test('an admin makes a folder once the words are confirmed: its key, and a sealed place for pages under the shared-folders container', async () => {
      const m = await build();
      await setUpWords(m);
      await m.createFolder(admin(), 'executive');
      expect(m.folderNames()).toEqual(['executive']);
      expect(JSON.parse(fs.readFileSync(storeJson('executive'), 'utf8'))).toMatchObject({ kind: 'shared-folder', encrypt: true });
      // No wrapped key in store.json: the key is the server's (keys.json).
      expect(fs.readFileSync(storeJson('executive'), 'utf8')).not.toContain('dekWrap');
      expect(audited.map((e) => [e.eventType, e.user, e.resource])).toEqual([
        ['shared-folder-words-create', 'ann', 'shared-folders'],
        ['shared-folder-create', 'ann', 'shared/executive'],
        ['shared-folder-key-create', 'ann', 'executive']
      ]);
      await expect(m.createFolder(admin(), 'executive')).rejects.toThrow(/already exists/);
    });

    test('refused until the words are confirmed, to anyone without admin-system, and for a name that is not a slug', async () => {
      const m = await build();
      await expect(m.createFolder(admin(), 'default')).rejects.toBeInstanceOf(SharedFolderRefusedError);
      await setUpWords(m, 'ann', false);
      await expect(m.createFolder(admin(), 'default')).rejects.toThrow(/has not confirmed/);
      expect(fs.existsSync(storeJson('default'))).toBe(false);
      admins.delete('bob');
      await expect(m.createFolder(admin('bob'), 'default')).rejects.toBeInstanceOf(SharedFolderRefusedError);
      await expect(m.createFolder(admin(), 'Bad--Name')).rejects.toThrow(/not a folder name/);
    });

    test('nothing is made when the record cannot be written (on-failure refuse)', async () => {
      const m = await build();
      await setUpWords(m);
      auditFails = true;
      await expect(m.createFolder(admin(), 'executive')).rejects.toThrow();
      expect(m.folderNames()).toEqual([]);
      expect(fs.existsSync(storeJson('executive'))).toBe(false);
    });

    test('the shipped folders, /shared/default and /shared/executive, are made when the words are confirmed, once (#2095)', async () => {
      const m = await build();
      expect(await m.ensureShippedFolders(admin())).toEqual([]);
      await setUpWords(m, 'ann', false);
      expect(await m.ensureShippedFolders(admin())).toEqual([]);
      expect(m.folderNames()).toEqual([]);
      confirmed.add(`ann/${m.recoveryWordsInfo()?.wordsId}`);
      expect(await m.ensureShippedFolders(admin())).toEqual(['default', 'executive']);
      expect(m.folderNames()).toEqual(['default', 'executive']);
      expect(fs.existsSync(storeJson('executive'))).toBe(true);
      expect(await m.ensureShippedFolders(admin())).toEqual([]);
    });

    describe('made at start (#2095)', () => {
      /** A PDP that lets the system principal (the fixture's fallback name) manage the keys, as `ngdpbase.system.roles` does. */
      const systemPdp = {
        permits: (s: Subj, a: string) => Promise.resolve(a === 'admin-system' && (s.username === 'system' || admins.has(s.username))),
        decide: () => Promise.resolve({ permit: false })
      };

      test('a site that confirmed its words before /shared/executive existed gets it on its next start, under the system context', async () => {
        const before = await build();
        await setUpWords(before);
        await before.createFolder(admin(), 'default');
        audited = [];
        // The next start.
        const m = await build(systemPdp);
        await m.ensureShippedFoldersAtBoot();
        expect(m.folderNames()).toEqual(['default', 'executive']);
        expect(fs.existsSync(storeJson('executive'))).toBe(true);
        const made = audited.filter((e) => e.eventType === 'shared-folder-create');
        expect(made.map((e) => [e.user, e.resource, (e.metadata as Record<string, unknown>).origin])).toEqual([['system', 'shared/executive', 'boot']]);
        // Idempotent: the start after that makes nothing.
        audited = [];
        const again = await build(systemPdp);
        await again.ensureShippedFoldersAtBoot();
        expect(again.folderNames()).toEqual(['default', 'executive']);
        expect(audited.filter((e) => e.eventType === 'shared-folder-create')).toEqual([]);
      });

      test('nothing is made at start before the words are confirmed, and a failure never stops the start', async () => {
        const before = await build();
        await setUpWords(before, 'ann', false);
        const m = await build(systemPdp);
        await m.ensureShippedFoldersAtBoot();
        expect(m.folderNames()).toEqual([]);
        // Confirmed, but the record cannot be written: refused, logged, start goes on.
        confirmed.add(`ann/${m.recoveryWordsInfo()?.wordsId}`);
        auditFails = true;
        await expect(m.ensureShippedFoldersAtBoot()).resolves.toBeUndefined();
        expect(m.folderNames()).toEqual([]);
      });
    });

    test('the folders a reader may open are the PDP\'s answer, folder by folder', async () => {
      const m = await build();
      await setUpWords(m);
      await m.createFolder(admin(), 'default');
      await m.createFolder(admin(), 'executive');
      expect(await m.foldersReadableBy(admin('ann'))).toEqual(['default', 'executive']);
      expect(await m.foldersReadableBy(admin('bob'))).toEqual(['executive']);
      expect(await m.foldersReadableBy(admin('cat'))).toEqual([]);
      // A folder that does not exist is never permitted, whatever a policy says.
      readers.add('ann:shared/ghost');
      expect(await m.mayInFolder(admin('ann'), 'shared-folder-read', 'ghost')).toBe(false);
    });

    test('by the shipped policies an admin opens and files in every folder, an executive reads every folder and files only in executive; an ordinary account only default', async () => {
      const made = await build();
      await setUpWords(made);
      await made.createFolder(admin(), 'default');
      await made.createFolder(admin(), 'executive');
      await made.createFolder(admin(), 'finance');
      // The same folders, decided by the real PDP over the shipped policies.
      const m = await build(await pdpOver(shipped));
      const ada = { username: 'ada', roles: ['admin', 'vault-owner'], isAuthenticated: true } as never;
      expect(await m.foldersReadableBy(ada)).toEqual(['default', 'executive', 'finance']);
      for (const folder of ['default', 'executive', 'finance']) {
        expect(await m.mayInFolder(ada, 'shared-folder-file', folder)).toBe(true);
        expect(await m.mayInFolder(ada, 'page-edit', folder)).toBe(true);
      }
      // #2095: an executive reads every folder and files only in executive (and default, as every account).
      const eve = { username: 'eve', roles: ['reader', 'vault-owner', 'executive'], isAuthenticated: true } as never;
      expect(await m.foldersReadableBy(eve)).toEqual(['default', 'executive', 'finance']);
      expect(await m.mayInFolder(eve, 'shared-folder-file', 'executive')).toBe(true);
      expect(await m.mayInFolder(eve, 'shared-folder-file', 'default')).toBe(true);
      expect(await m.mayInFolder(eve, 'shared-folder-file', 'finance')).toBe(false);
      expect(await m.mayInFolder(eve, 'page-edit', 'finance')).toBe(false);
      const rita = { username: 'rita', roles: ['editor', 'vault-owner'], isAuthenticated: true } as never;
      expect(await m.foldersReadableBy(rita)).toEqual(['default']);
      expect(await m.mayInFolder(rita, 'shared-folder-read', 'executive')).toBe(false);
      expect(await m.mayInFolder(rita, 'shared-folder-file', 'executive')).toBe(false);
      expect(await m.mayInFolder(rita, 'shared-folder-read', 'finance')).toBe(false);
      const anon = { username: 'Anonymous', roles: ['anonymous'], isAuthenticated: false } as never;
      expect(await m.foldersReadableBy(anon)).toEqual([]);
    });

    test('a read is recorded with who read it and what', async () => {
      const m = await build();
      await m.recordRead(admin('bob'), 'executive', { page: 'shared/executive/Board pack', action: 'view' });
      expect(audited).toEqual([expect.objectContaining({
        eventType: 'shared-folder-read',
        user: 'bob',
        resource: 'shared/executive/Board pack',
        metadata: expect.objectContaining({ folder: 'executive', page: 'shared/executive/Board pack', action: 'view' })
      })]);
    });
  });
});
