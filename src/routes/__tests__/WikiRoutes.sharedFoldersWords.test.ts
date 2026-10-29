/**
 * The shared folders' recovery words on Admin → Backup (#2124, epic #1775
 * decision 4): shown once, saved only with the admin's "I have saved them",
 * which is recorded as a consent (`shared-folders-recovery-words`, `how:
 * setup`, bound to the set of words).
 *
 * A real SharedFolderManager over a per-test mkdtemp folder (removed
 * afterwards, never a data/ tree) and a random server key; ConsentManager, the
 * PDP and the audit sink are stand-ins.
 *
 * Sabotaged once (then restored): the tick check in adminSharedFoldersWordsSave
 * (skipped) — the "refuses to finish without the tick" test went red.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import WikiRoutes from '../WikiRoutes';
import SharedFolderManager from '../../managers/SharedFolderManager';
import { SHARED_FOLDERS_KEY_ENV } from '../../utils/sharedFoldersKey';

type Res = { render: ReturnType<typeof vi.fn>; redirect: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn> };
const newRes = (): Res => {
  const res = { render: vi.fn(), redirect: vi.fn(), setHeader: vi.fn() } as unknown as Res;
  res.status = vi.fn(() => res);
  return res;
};

const SCOPE = 'shared-folders-recovery-words';
const TICK = { saved: 'on', 'words-document': SCOPE, 'words-version': '1' };

describe('the shared folders\' recovery words on Admin → Backup (#2124)', () => {
  let dir: string;
  let routes: WikiRoutes;
  let folders: SharedFolderManager;
  let consent: { documents: ReturnType<typeof vi.fn>; accept: ReturnType<typeof vi.fn>; pendingFor: ReturnType<typeof vi.fn> };
  let wordsVersion: string;
  let allowed: boolean;
  const savedKey = process.env[SHARED_FOLDERS_KEY_ENV];
  const admin = { username: 'ann', roles: ['admin'], isAuthenticated: true };

  const req = (body: Record<string, unknown> = {}) => ({ body: { _csrf: 't', ...body }, userContext: admin, session: { csrfToken: 't', username: 'ann' }, get: () => undefined }) as never;

  /** Show the words; returns what the page rendered. */
  async function show(): Promise<{ words: string[]; token: string }> {
    const res = newRes();
    await routes.adminSharedFoldersWords(req(), res);
    expect(res.render).toHaveBeenCalledWith('admin-shared-folders-words', expect.anything());
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    return res.render.mock.calls[0][1] as { words: string[]; token: string };
  }

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-folders-words-routes-'));
    process.env[SHARED_FOLDERS_KEY_ENV] = randomBytes(32).toString('base64');
    wordsVersion = '1';
    allowed = true;
    consent = {
      documents: vi.fn(async (scope: string) => (scope === SCOPE ? [{ id: SCOPE, scope, title: 'Shared Folders Recovery Words', version: wordsVersion, effective: null }] : [])),
      accept: vi.fn(async () => []),
      // Nobody has confirmed: the set stays unconfirmed (the consent records are ConsentManager's, tested there).
      pendingFor: vi.fn(async (_u: string, scope: string) => (scope === SCOPE ? [{ id: SCOPE }] : []))
    };
    const managers: Record<string, unknown> = {
      ConsentManager: consent,
      ConfigurationManager: { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => dir },
      PolicyDecisionPoint: { permits: async (_s: unknown, a: string) => allowed && a === 'admin-system' },
      AuditManager: { logAuditEvent: vi.fn(async () => 'id'), flushAuditQueue: vi.fn(async () => {}) }
    };
    const engine = { getManager: (name: string) => managers[name] ?? null };
    folders = new SharedFolderManager(engine);
    await folders.initialize();
    managers.SharedFolderManager = folders;
    routes = new WikiRoutes(engine);
    vi.spyOn(routes, 'createWikiContext').mockImplementation(() => ({ userContext: admin, hasPermission: async () => allowed, holdsPermission: async () => false }) as never);
    vi.spyOn(routes, 'getCommonTemplateData').mockResolvedValue({ csrfToken: 't' });
    vi.spyOn(routes, 'renderError').mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Only this test's own mkdtemp folder.
    fs.rmSync(dir, { recursive: true, force: true });
    if (savedKey === undefined) delete process.env[SHARED_FOLDERS_KEY_ENV]; else process.env[SHARED_FOLDERS_KEY_ENV] = savedKey;
  });

  test('the page shows 12 words and the wording at its current version; nothing is saved yet', async () => {
    const res = newRes();
    await routes.adminSharedFoldersWords(req(), res);
    const locals = res.render.mock.calls[0][1] as { words: string[]; recoveryWordsDocument: { id: string; version: string } };
    expect(locals.words).toHaveLength(12);
    expect(locals.recoveryWordsDocument).toMatchObject({ id: SCOPE, version: '1' });
    expect(folders.recoveryWordsInfo()).toBeNull();
  });

  test('refuses to finish without the tick: nothing saved, no consent, the words are discarded', async () => {
    const { token } = await show();
    const res = newRes();
    await routes.adminSharedFoldersWordsSave(req({ token }), res);
    expect(res.redirect.mock.calls[0][0]).toMatch(/^\/admin\/backup\?error=Nothing%20was%20saved/);
    expect(folders.recoveryWordsInfo()).toBeNull();
    expect(consent.accept).not.toHaveBeenCalled();
    // Discarded: the same token, now ticked, saves nothing.
    await routes.adminSharedFoldersWordsSave(req({ token, ...TICK }), newRes());
    expect(folders.recoveryWordsInfo()).toBeNull();
  });

  test('a changed wording version refuses too', async () => {
    const { token } = await show();
    wordsVersion = '2';
    const res = newRes();
    await routes.adminSharedFoldersWordsSave(req({ token, ...TICK }), res);
    expect(decodeURIComponent(res.redirect.mock.calls[0][0] as string)).toMatch(/changed while you were reading/);
    expect(folders.recoveryWordsInfo()).toBeNull();
  });

  test('with the tick the words are saved and the confirmation is recorded as a consent: the admin, the version, how, and which set', async () => {
    const { token } = await show();
    const res = newRes();
    await routes.adminSharedFoldersWordsSave(req({ token, ...TICK }), res);
    expect(res.redirect.mock.calls[0][0]).toMatch(/^\/admin\/backup\?success=/);
    const info = folders.recoveryWordsInfo();
    expect(info).toMatchObject({ shownTo: 'ann' });
    expect(consent.accept).toHaveBeenCalledWith(admin, SCOPE, [{ id: SCOPE, version: '1' }], 'setup', info!.wordsId);
  });

  test('a consent that cannot be recorded leaves the words saved (the banner asks instead)', async () => {
    consent.accept.mockRejectedValue(new Error('consent folder gone'));
    const { token } = await show();
    await routes.adminSharedFoldersWordsSave(req({ token, ...TICK }), newRes());
    expect(folders.recoveryWordsInfo()).not.toBeNull();
  });

  test('an unconfirmed set can be discarded from Admin → Backup, and a new set made', async () => {
    const { token } = await show();
    await routes.adminSharedFoldersWordsSave(req({ token, ...TICK }), newRes());
    expect(folders.recoveryWordsInfo()).not.toBeNull();
    const res = newRes();
    await routes.adminSharedFoldersWordsDiscard(req(), res);
    expect(res.redirect.mock.calls[0][0]).toMatch(/^\/admin\/backup\?success=/);
    expect(folders.recoveryWordsInfo()).toBeNull();
    await show();
  });

  test('a confirmed set is not discarded', async () => {
    const { token } = await show();
    await routes.adminSharedFoldersWordsSave(req({ token, ...TICK }), newRes());
    consent.pendingFor.mockResolvedValue([]);
    const res = newRes();
    await routes.adminSharedFoldersWordsDiscard(req(), res);
    expect(decodeURIComponent(res.redirect.mock.calls[0][0] as string)).toMatch(/cannot be discarded/);
    expect(folders.recoveryWordsInfo()).not.toBeNull();
  });

  test('refused by policy: nothing is shown', async () => {
    allowed = false;
    const res = newRes();
    await routes.adminSharedFoldersWords(req(), res);
    expect(res.render).not.toHaveBeenCalled();
  });
});
