/**
 * The shared folders' recovery words on Admin → Backup (#2124, #2144, epic
 * #1775 decision 4): shown once with Download and Print, saved only once the
 * admin typed all 12 back and ticked "I have saved them", which is recorded
 * as a consent (`shared-folders-recovery-words`, `how: setup`, or `new-words`
 * for a new set, bound to the set of words). A new set needs a fresh sign-in.
 *
 * A real SharedFolderManager over a per-test mkdtemp folder (removed
 * afterwards, never a data/ tree) and a random server key; ConsentManager, the
 * PDP and the audit sink are stand-ins.
 *
 * Sabotaged once each (then restored):
 * - the tick check in adminSharedFoldersWordsSave (skipped): the "refuses to
 *   finish without the tick" test went red;
 * - the typed words (typedRecoveryWords returning them reversed): the "typed
 *   back and ticked" and "wrong words" tests went red;
 * - the config-manage check in showNewSharedFoldersWords (skipped): the
 *   "new set asks for a fresh sign-in" test went red.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import WikiRoutes from '../WikiRoutes';
import SharedFolderManager from '../../managers/SharedFolderManager';
import { SHARED_FOLDERS_KEY_ENV } from '../../utils/sharedFoldersKey';

type Res = {
  render: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};
const newRes = (): Res => {
  const res = { render: vi.fn(), redirect: vi.fn(), setHeader: vi.fn(), send: vi.fn(), json: vi.fn() } as unknown as Res;
  res.status = vi.fn(() => res);
  return res;
};

const SCOPE = 'shared-folders-recovery-words';
const TICK = { saved: 'on', 'words-document': SCOPE, 'words-version': '1' };
const typed = (words: string[]): Record<string, string> => Object.fromEntries(words.map((w, i) => [`word${i + 1}`, w]));

describe('the shared folders\' recovery words on Admin → Backup (#2124, #2144)', () => {
  let dir: string;
  let routes: WikiRoutes;
  let folders: SharedFolderManager;
  let consent: { documents: ReturnType<typeof vi.fn>; accept: ReturnType<typeof vi.fn>; pendingFor: ReturnType<typeof vi.fn> };
  let audited: Array<Record<string, unknown>>;
  let wordsVersion: string;
  let allowed: boolean;
  /** Whether the PDP permits config-manage now: the sign-in is fresh (step-up). */
  let fresh: boolean;
  /** Whether the admin holds config-manage at all (policy alone). */
  let holdsConfig: boolean;
  const savedKey = process.env[SHARED_FOLDERS_KEY_ENV];
  const admin = { username: 'ann', roles: ['admin'], isAuthenticated: true };

  const req = (body: Record<string, unknown> = {}) => ({
    method: 'POST',
    originalUrl: '/admin/backup/shared-folders/words',
    body: { _csrf: 't', ...body },
    userContext: admin,
    session: { csrfToken: 't', username: 'ann' },
    protocol: 'https',
    headers: {},
    get: (h: string) => (h === 'host' ? 'site.example' : undefined)
  }) as never;

  /** Show the words (the first set, or a new set); returns what the page rendered. */
  async function show(replacing = false): Promise<{ words: string[]; token: string; step: string; replacing: boolean }> {
    const res = newRes();
    await (replacing ? routes.adminSharedFoldersNewWords(req(), res) : routes.adminSharedFoldersWords(req(), res));
    expect(res.render).toHaveBeenCalledWith('admin-shared-folders-words', expect.anything());
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    return res.render.mock.calls[0][1] as { words: string[]; token: string; step: string; replacing: boolean };
  }

  /** Type the words back with the tick. */
  async function finish(token: string, words: string[]): Promise<Res> {
    const res = newRes();
    await routes.adminSharedFoldersWordsSave(req({ token, ...TICK, ...typed(words) }), res);
    return res;
  }

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-folders-words-routes-'));
    process.env[SHARED_FOLDERS_KEY_ENV] = randomBytes(32).toString('base64');
    wordsVersion = '1';
    allowed = true;
    fresh = true;
    holdsConfig = true;
    audited = [];
    consent = {
      documents: vi.fn(async (scope: string) => (scope === SCOPE ? [{ id: SCOPE, scope, title: 'Shared Folders Recovery Words', version: wordsVersion, effective: null }] : [])),
      accept: vi.fn(async () => []),
      // Nobody has confirmed: the set stays unconfirmed (the consent records are ConsentManager's, tested there).
      pendingFor: vi.fn(async (_u: string, scope: string) => (scope === SCOPE ? [{ id: SCOPE }] : []))
    };
    const managers: Record<string, unknown> = {
      ConsentManager: consent,
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k === 'ngdpbase.application-name' ? 'The Fairways' : k === 'ngdpbase.application.base-url' ? 'https://fairways.example' : d),
        getResolvedDataPath: () => dir
      },
      PolicyDecisionPoint: { permits: async (_s: unknown, a: string) => allowed && (a === 'admin-system' || (a === 'config-manage' && fresh)) },
      AuditManager: { logAuditEvent: vi.fn(async (e: Record<string, unknown>) => { audited.push(e); return 'id'; }), flushAuditQueue: vi.fn(async () => {}) },
      AuthManager: {
        askForFreshSignIn: vi.fn(async (_r: unknown, _u: unknown, permission: string) => ({ permission, delegated: false, error: 'A fresh sign-in is needed', reauth: '/auth/reauth?next=%2Fadmin%2Fbackup' }))
      }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null };
    folders = new SharedFolderManager(engine);
    await folders.initialize();
    managers.SharedFolderManager = folders;
    routes = new WikiRoutes(engine);
    vi.spyOn(routes, 'createWikiContext').mockImplementation(() => ({
      userContext: admin,
      hasPermission: async (p: string) => allowed && (p !== 'config-manage' || fresh),
      holdsPermission: async (p: string) => p === 'config-manage' && holdsConfig
    }) as never);
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });
    vi.spyOn(routes, 'renderError').mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Only this test's own mkdtemp folder.
    fs.rmSync(dir, { recursive: true, force: true });
    if (savedKey === undefined) delete process.env[SHARED_FOLDERS_KEY_ENV]; else process.env[SHARED_FOLDERS_KEY_ENV] = savedKey;
  });

  test('the words step shows 12 words and the wording at its current version; nothing is saved yet', async () => {
    const locals = await show() as unknown as { words: string[]; step: string; recoveryWordsDocument: { id: string; version: string } };
    expect(locals.step).toBe('words');
    expect(locals.words).toHaveLength(12);
    expect(locals.recoveryWordsDocument).toMatchObject({ id: SCOPE, version: '1' });
    expect(folders.recoveryWordsInfo()).toBeNull();
  });

  test('the confirm step never shows the words; with none waiting it goes back to Admin → Backup', async () => {
    let res = newRes();
    await routes.adminSharedFoldersWordsConfirmPage(req(), res);
    expect(res.redirect.mock.calls[0][0]).toMatch(/^\/admin\/backup\?error=/);
    const { token } = await show();
    res = newRes();
    await routes.adminSharedFoldersWordsConfirmPage(req(), res);
    const locals = res.render.mock.calls[0][1] as { step: string; words: string[]; token: string; wordCount: number };
    expect(locals).toMatchObject({ step: 'confirm', words: [], token, wordCount: 12 });
  });

  test('Download as a file: the site, the 12 numbered words, what they are for, when made; no-store, an attachment, audited without the words', async () => {
    const { token, words } = await show();
    const res = newRes();
    await routes.adminSharedFoldersWordsExport(req({ token }), res, 'download');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="The-Fairways-shared-folders-recovery-words.txt"');
    const text = res.send.mock.calls[0][0] as string;
    expect(text).toContain('The Fairways (https://fairways.example)');
    words.forEach((w, i) => expect(text).toContain(`${String(i + 1).padStart(2, ' ')}. ${w}\n`));
    expect(text).toMatch(/shared folders/);
    expect(text).toMatch(/not stored on the server/);
    expect(text).toMatch(/Made: \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(UTC[+-]\d{2}:\d{2}\)/);
    const exported = audited.filter((e) => e.eventType === 'recovery-words-export');
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ user: 'ann', metadata: expect.objectContaining({ set: 'shared-folders', how: 'download' }) });
    for (const w of words) expect(JSON.stringify(audited)).not.toMatch(new RegExp(`\\b${w}\\b`));
  });

  test('Print: the print view of the same words, no-store, audited', async () => {
    const { token, words } = await show();
    const res = newRes();
    await routes.adminSharedFoldersWordsExport(req({ token }), res, 'print');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.render).toHaveBeenCalledWith('recovery-words-print', { sheet: expect.objectContaining({ words, siteName: 'The Fairways' }) });
    expect(audited.map((e) => (e.metadata as Record<string, unknown>).how)).toEqual(['print']);
  });

  test('refuses to finish without the tick: nothing saved, no consent, and the words still wait', async () => {
    const { token, words } = await show();
    const res = newRes();
    await routes.adminSharedFoldersWordsSave(req({ token, ...typed(words) }), res);
    expect(res.render.mock.calls[0][1]).toMatchObject({ step: 'confirm', error: expect.stringMatching(/^Nothing was saved/) });
    expect(folders.recoveryWordsInfo()).toBeNull();
    expect(consent.accept).not.toHaveBeenCalled();
    expect((await finish(token, words)).redirect.mock.calls[0][0]).toMatch(/^\/admin\/backup\?success=/);
  });

  test('a changed wording version refuses too', async () => {
    const { token, words } = await show();
    wordsVersion = '2';
    const res = await finish(token, words);
    expect((res.render.mock.calls[0][1] as { error: string }).error).toMatch(/changed while you were reading/);
    expect(folders.recoveryWordsInfo()).toBeNull();
  });

  test('wrong words: nothing saved, it says so, and they can be typed again while the set waits', async () => {
    const { token, words } = await show();
    const res = await finish(token, [...words.slice(1), words[0]]);
    expect(res.render.mock.calls[0][1]).toMatchObject({ step: 'confirm', token, error: expect.stringMatching(/not the ones shown\. Nothing was saved/) });
    expect(folders.recoveryWordsInfo()).toBeNull();
    expect(consent.accept).not.toHaveBeenCalled();
    expect((await finish(token, words)).redirect.mock.calls[0][0]).toMatch(/^\/admin\/backup\?success=/);
  });

  test('typed back and ticked, the words are saved and the confirmation is recorded as a consent: the admin, the version, how, and which set', async () => {
    const { token, words } = await show();
    const res = await finish(token, words);
    expect(res.redirect.mock.calls[0][0]).toMatch(/^\/admin\/backup\?success=/);
    const info = folders.recoveryWordsInfo();
    expect(info).toMatchObject({ shownTo: 'ann' });
    expect(consent.accept).toHaveBeenCalledWith(admin, SCOPE, [{ id: SCOPE, version: '1' }], 'setup', info!.wordsId);
    // Once saved, nothing is left to download.
    const after = newRes();
    await routes.adminSharedFoldersWordsExport(req({ token }), after, 'download');
    expect(after.send).not.toHaveBeenCalled();
    expect(decodeURIComponent(after.redirect.mock.calls[0][0] as string)).toMatch(/no longer waiting/);
  });

  test('Cancel discards the words: nothing is saved', async () => {
    const { token, words } = await show();
    await routes.adminSharedFoldersWordsCancel(req(), newRes());
    const res = await finish(token, words);
    expect(decodeURIComponent(res.redirect.mock.calls[0][0] as string)).toMatch(/no longer waiting/);
    expect(folders.recoveryWordsInfo()).toBeNull();
  });

  test('a consent that cannot be recorded leaves the words saved (the banner asks instead)', async () => {
    consent.accept.mockRejectedValue(new Error('consent folder gone'));
    const { token, words } = await show();
    await finish(token, words);
    expect(folders.recoveryWordsInfo()).not.toBeNull();
  });

  test('an unconfirmed set can be discarded from Admin → Backup, and a new set made', async () => {
    const { token, words } = await show();
    await finish(token, words);
    expect(folders.recoveryWordsInfo()).not.toBeNull();
    const res = newRes();
    await routes.adminSharedFoldersWordsDiscard(req(), res);
    expect(res.redirect.mock.calls[0][0]).toMatch(/^\/admin\/backup\?success=/);
    expect(folders.recoveryWordsInfo()).toBeNull();
    await show();
  });

  test('a confirmed set is not discarded', async () => {
    const { token, words } = await show();
    await finish(token, words);
    consent.pendingFor.mockResolvedValue([]);
    const res = newRes();
    await routes.adminSharedFoldersWordsDiscard(req(), res);
    expect(decodeURIComponent(res.redirect.mock.calls[0][0] as string)).toMatch(/cannot be discarded/);
    expect(folders.recoveryWordsInfo()).not.toBeNull();
  });

  describe('a new set (#2144)', () => {
    test('asks for a fresh sign-in first: no words are made until then', async () => {
      const first = await show();
      await finish(first.token, first.words);
      fresh = false;
      const res = newRes();
      await routes.adminSharedFoldersNewWords(req(), res);
      expect(res.render).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/auth\/reauth\?next=/));
      expect(folders.waitingWords(admin as never)).toBeNull();
      // Not holding config-manage at all: a plain refusal, still nothing made.
      holdsConfig = false;
      const refused = newRes();
      await routes.adminSharedFoldersNewWords(req(), refused);
      expect(refused.render).not.toHaveBeenCalled();
      expect(refused.redirect).not.toHaveBeenCalledWith(expect.stringMatching(/reauth/));
      expect(folders.waitingWords(admin as never)).toBeNull();
    });

    test('shown and typed back as the first set; saved, every folder key sealed for it, the consent recorded as new-words', async () => {
      const first = await show();
      await finish(first.token, first.words);
      consent.pendingFor.mockResolvedValue([]); // confirmed
      await folders.createFolderKey(admin, 'default');
      const oldId = folders.recoveryWordsInfo()!.wordsId;
      const next = await show(true);
      expect(next).toMatchObject({ step: 'words', replacing: true });
      // Wrong words change nothing.
      await finish(next.token, first.words);
      expect(folders.recoveryWordsInfo()!.wordsId).toBe(oldId);
      const res = await finish(next.token, next.words);
      expect(decodeURIComponent(res.redirect.mock.calls[0][0] as string)).toMatch(/old words no longer open the shared folders/);
      const info = folders.recoveryWordsInfo()!;
      expect(info.wordsId).not.toBe(oldId);
      expect(consent.accept).toHaveBeenLastCalledWith(admin, SCOPE, [{ id: SCOPE, version: '1' }], 'new-words', info.wordsId);
      await expect(folders.openFolderKeyWithWords(admin as never, 'default', first.words.join(' '))).rejects.toThrow();
      expect((await folders.openFolderKeyWithWords(admin as never, 'default', next.words.join(' '))).length).toBe(32);
    });

    test('saving it asks the fresh sign-in again', async () => {
      const first = await show();
      await finish(first.token, first.words);
      const oldId = folders.recoveryWordsInfo()!.wordsId;
      const next = await show(true);
      fresh = false;
      const res = await finish(next.token, next.words);
      expect(res.redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/auth\/reauth\?next=/));
      expect(folders.recoveryWordsInfo()!.wordsId).toBe(oldId);
      expect(folders.waitingWords(admin as never)?.replacing).toBe(true);
    });
  });

  test('refused by policy: nothing is shown', async () => {
    allowed = false;
    const res = newRes();
    await routes.adminSharedFoldersWords(req(), res);
    expect(res.render).not.toHaveBeenCalled();
  });
});
