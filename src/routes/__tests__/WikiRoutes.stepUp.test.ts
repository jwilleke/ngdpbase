/**
 * #1525, #1635 — step-up decided by the PDP, answered at the route: a permission marked step-up,
 * granted by policy, still needs a fresh factor. A stale page action goes to
 * /auth/reauth and back; a JSON action is told where; a delegated credential
 * is refused; a fresh session proceeds. The password re-authentication is
 * throttled, audited, and stamps the session's sign-in.
 */
import WikiRoutes from '../WikiRoutes';
import AuthManager from '../../managers/AuthManager';

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis()
});
const session = (): Record<string, unknown> => ({ username: 'molly', isAuthenticated: true, save: vi.fn((cb: (e?: unknown) => void) => cb()) });

function routes(needed: boolean, authenticate: (id: string, c: unknown) => Promise<unknown> = () => Promise.resolve({ success: false })) {
  const audit: Array<Record<string, unknown>> = [];
  const authManager = {
    stepUpNeeded: vi.fn(() => needed),
    signInFresh: vi.fn(() => false),
    renameCredential: vi.fn().mockResolvedValue(true),
    revokeDelegation: vi.fn().mockResolvedValue(true),
    passkeyAuthenticationOptions: vi.fn().mockResolvedValue({ challenge: 'c1' }),
    passkeyRegistrationOptions: vi.fn().mockResolvedValue({ challenge: 'r1' }),
    authenticate: vi.fn(authenticate),
    reauthenticated: vi.fn(() => ({ provider: 'password', factors: [], amr: ['pwd'], aal: 1, acr: 'aal1', mfa: false, at: 'now' })),
    requiredAalFor: vi.fn(() => 1),
    passkeyRelyingParty: vi.fn(() => null),
    hasCredential: vi.fn(() => false),
    // #1758: step-up is AuthManager's — the real answer, record and completion, on this double.
    engine: null as unknown,
    askForFreshSignIn(...a: Parameters<AuthManager['askForFreshSignIn']>) { return AuthManager.prototype.askForFreshSignIn.apply(this as never, a); },
    // #2154: a page's form POST is kept to be redone after the prompt.
    stepUpReplays: new Map(),
    keepStepUpReplay(...a: unknown[]) { return (AuthManager.prototype as unknown as { keepStepUpReplay: (...x: unknown[]) => unknown }).keepStepUpReplay.apply(this, a); },
    recordReauth(...a: Parameters<AuthManager['recordReauth']>) { return AuthManager.prototype.recordReauth.apply(this as never, a); },
    completeReauth(...a: Parameters<AuthManager['completeReauth']>) { return AuthManager.prototype.completeReauth.apply(this as never, a); },
    // #2193: a script's request names its own prompt.
    cancelStepUpPrompt(...a: Parameters<AuthManager['cancelStepUpPrompt']>) { return AuthManager.prototype.cancelStepUpPrompt.apply(this as never, a); },
    stepUpPromptState(...a: Parameters<AuthManager['stepUpPromptState']>) { return AuthManager.prototype.stepUpPromptState.apply(this as never, a); },
    takeStepUpReplay(...a: Parameters<AuthManager['takeStepUpReplay']>) { return AuthManager.prototype.takeStepUpReplay.apply(this as never, a); }
  };
  const oidc = { revokeGrant: vi.fn().mockResolvedValue(true) };
  const folders = { prepareNewRecoveryWords: vi.fn().mockResolvedValue({ token: 'tok', words: ['abandon', 'ability'] }) };
  const backup = { revealInstanceEnv: vi.fn().mockResolvedValue(Buffer.from('X=1\n')), revealBackupKeyFile: vi.fn().mockResolvedValue({ fingerprint: '0123456789abcdef', text: 'X=1\n' }) };
  const managers: Record<string, unknown> = {
    OidcManager: oidc,
    BackupManager: backup,
    SharedFolderManager: folders,
    AuthManager: authManager,
    // #1635: the PDP decides step-up. This double grants by policy and asks
    // AuthManager about freshness exactly as the real PDP does; `holds` is the
    // policy-only question affordances ask.
    PolicyDecisionPoint: {
      permits: vi.fn((subject: { roles?: string[]; signIn?: unknown; viaToken?: unknown; viaShare?: unknown }, action: string) =>
        Promise.resolve(!authManager.stepUpNeeded(action, subject.signIn, subject.roles ?? [], Boolean(subject.viaToken || subject.viaShare)))),
      holds: vi.fn(() => Promise.resolve(true))
    },
    AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve('a'); }, logAuthentication: vi.fn().mockResolvedValue('a') },
    UserManager: { hasPassword: vi.fn().mockResolvedValue(true), getUser: vi.fn().mockResolvedValue({ username: 'molly' }) },
    ConfigurationManager: { getProperty: (_k: string, d: unknown) => d }
  };
  const engine = { getManager: vi.fn((n: string) => managers[n] ?? null) };
  authManager.engine = engine;
  const r = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>> & { getCommonTemplateData: unknown };
  (r as unknown as { getCommonTemplateData: () => Promise<Record<string, unknown>> }).getCommonTemplateData = () => Promise.resolve({ csrfToken: 't' });
  return { r, authManager, audit, oidc, backup, folders };
}

const req = (s: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  session: s, body: {}, ip: '1.2.3.4', headers: {}, query: {}, params: { id: 'cred-1' }, method: 'POST', originalUrl: '/profile/credentials/cred-1/rename',
  get: (h: string) => (h === 'referer' ? 'https://wiki.example.com/profile' : 'ua'),
  userContext: { username: 'molly', roles: ['reader'], isAuthenticated: true },
  ...extra
});

describe('step-up at the route door (#1525)', () => {
  test('a stale session on a page action goes to /auth/reauth and back to the page that posted', async () => {
    const { r, authManager, audit } = routes(true);
    const out = res();
    await r.renameOwnCredential(req(session(), { body: { label: 'Phone' } }), out);
    expect(out.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fprofile');
    expect(authManager.renameCredential).not.toHaveBeenCalled();
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-prompt', resource: 'account-security' }));
  });

  test('a JSON action is told where to re-authenticate, and comes back to the page it was on (#1738)', async () => {
    const { r } = routes(true);
    const out = res();
    await r.passkeyRegisterOptions(req(session(), { method: 'GET', originalUrl: '/auth/passkey/register/options' }), out);
    expect(out.status).toHaveBeenCalledWith(403);
    // Not the data URL: returning there showed the person raw JSON. #2193: it names its own prompt.
    expect(out.json).toHaveBeenCalledWith(expect.objectContaining({ reauth: expect.stringMatching(/^\/auth\/reauth\?next=%2Fprofile&prompt=[0-9a-f]{32}$/) }));
  });

  test('a delegated credential is refused outright, never sent to a prompt', async () => {
    const { r, authManager } = routes(true);
    const out = res();
    await r.renameOwnCredential(req(session(), { userContext: { username: 'molly', roles: ['reader'], isAuthenticated: true, viaToken: { id: 't', name: 'bot', scopes: ['account-security'] } } }), out);
    expect(authManager.stepUpNeeded).toHaveBeenCalledWith('account-security', undefined, ['reader'], true);
    expect(out.status).toHaveBeenCalledWith(403);
    expect(out.redirect).not.toHaveBeenCalled();
  });

  test('a fresh session proceeds', async () => {
    const { r, authManager } = routes(false);
    const out = res();
    await r.renameOwnCredential(req(session(), { body: { label: 'Phone' } }), out);
    expect(authManager.renameCredential).toHaveBeenCalled();
    expect(out.redirect).toHaveBeenCalledWith('/profile?success=Renamed');
  });
});

describe('downloading the instance .env (#1938)', () => {
  test('a stale session is sent to re-authenticate and the file is never read', async () => {
    // Sabotage (2026-10-21): asking holdsPermission instead of permitted() turns this red.
    const { r, backup, audit } = routes(true);
    const out = res();
    await r.adminBackupEnv(req(session(), { method: 'GET', originalUrl: '/admin/backup/env', get: (h: string) => (h === 'referer' ? 'https://wiki.example.com/admin/backup' : 'ua') }), out);
    // #2145: a download comes back to the page that linked it, not to itself:
    // returning to the file saved it and left the browser on the prompt.
    expect(out.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fadmin%2Fbackup');
    expect(backup.revealInstanceEnv).not.toHaveBeenCalled();
    expect(out.send).not.toHaveBeenCalled();
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-prompt', resource: 'config-manage' }));
  });
});

describe('coming back from a fresh sign-in (#2145)', () => {
  const fromBackup = (h: string) => (h === 'referer' ? 'https://wiki.example.com/admin/backup' : 'ua');
  const passkeyOk = () => Promise.resolve({ success: true, username: 'molly', provider: 'passkey', factors: [] });

  /** Ask for the step-up with `ask`, then give it with a passkey on the same session. */
  async function stepUpThenPasskey(ask: (r: ReturnType<typeof routes>['r'], s: Record<string, unknown>) => Promise<void>, next: string) {
    const env = routes(true, passkeyOk);
    const s = session();
    await ask(env.r, s);
    env.authManager.stepUpNeeded.mockReturnValue(false);
    s.passkeyChallenge = { value: 'c1', purpose: 'reauth', expires: Date.now() + 60_000 };
    const out = res();
    await env.r.passkeyReauthVerify(req(s, { body: { response: {}, next } }), out);
    return { ...env, s, out };
  }

  test('a download: the passkey answer names the page with the link, says it can be done now, and records the permission', async () => {
    // Sabotage (2026-10-30): passing 'page' for the .env download sent the browser back to the file — the stall.
    const { s, out, audit, backup } = await stepUpThenPasskey(
      (r, sess) => r.adminBackupEnv(req(sess, { method: 'GET', originalUrl: '/admin/backup/env', get: fromBackup }), res()), '/admin/backup');
    expect(out.json).toHaveBeenCalledWith({ ok: true, redirect: '/admin/backup' });
    expect(s.stepUpConfirmed).toBe('/admin/backup');
    expect(s.pendingStepUp).toBeUndefined();
    expect(backup.revealInstanceEnv).not.toHaveBeenCalled();
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-success', resource: 'config-manage',
      metadata: expect.objectContaining({ detail: expect.stringContaining('passkey for config-manage') }) }));
  });

  test('a form POST that cannot be redone (no form body) lands on the page with the form, which says it can be done now', async () => {
    const { s, out } = await stepUpThenPasskey(
      (r, sess) => r.renameOwnCredential(req(sess, { body: { label: 'Phone' } }), res()), '/profile');
    expect(out.json).toHaveBeenCalledWith({ ok: true, redirect: '/profile' });
    expect(s.stepUpConfirmed).toBe('/profile');
  });

  test('a page GET opens the page again, which does the action: no note', async () => {
    const { s, out, audit } = await stepUpThenPasskey(
      (r, sess) => r.adminBackupKey(req(sess, { method: 'GET', originalUrl: '/admin/backup/key' }), res()), '/admin/backup/key');
    expect(out.json).toHaveBeenCalledWith({ ok: true, redirect: '/admin/backup/key' });
    expect(s.stepUpConfirmed).toBeUndefined();
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-success', resource: 'config-manage' }));
  });

  test('a prompt opened without a pending step-up records the method and says nothing', async () => {
    const { r, audit } = routes(false, passkeyOk);
    const s = session();
    s.passkeyChallenge = { value: 'c1', purpose: 'reauth', expires: Date.now() + 60_000 };
    const out = res();
    await r.passkeyReauthVerify(req(s, { body: { response: {}, next: '/admin/backup' } }), out);
    expect(out.json).toHaveBeenCalledWith({ ok: true, redirect: '/admin/backup' });
    expect(s.stepUpConfirmed).toBeUndefined();
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-success', resource: 'passkey' }));
  });

  test('a session that cannot be saved is a JSON error the passkey script shows, not a text page', async () => {
    const { r } = routes(false, passkeyOk);
    const s = session();
    s.save = vi.fn((cb: (e?: unknown) => void) => cb(new Error('disk full')));
    s.passkeyChallenge = { value: 'c1', purpose: 'reauth', expires: Date.now() + 60_000 };
    const out = res();
    await r.passkeyReauthVerify(req(s, { body: { response: {}, next: '/profile' } }), out);
    expect(out.status).toHaveBeenCalledWith(500);
    expect(out.json).toHaveBeenCalledWith({ error: 'Your confirmation could not be saved; try again' });
    expect(out.send).not.toHaveBeenCalled();
  });

  test('the password path comes back the same way', async () => {
    const env = routes(true, () => Promise.resolve({ success: true, username: 'molly', provider: 'password', factors: [] }));
    const s = session();
    await env.r.adminBackupEnv(req(s, { method: 'GET', originalUrl: '/admin/backup/env', get: fromBackup }), res());
    env.authManager.stepUpNeeded.mockReturnValue(false);
    const out = res();
    await env.r.reauthWithPassword(req(s, { body: { password: 'right', next: '/admin/backup' } }), out);
    expect(out.redirect).toHaveBeenCalledWith('/admin/backup');
    expect(s.stepUpConfirmed).toBe('/admin/backup');
  });
});

describe('a form POST carries on after a fresh sign-in (#2154)', () => {
  const passkeyOk = () => Promise.resolve({ success: true, username: 'molly', provider: 'passkey', factors: [] });
  /** A browser's form POST on session `sid`. */
  const formPost = (s: Record<string, unknown>, sid: string, body: Record<string, unknown>) =>
    req(s, { sessionID: sid, body, is: (t: string) => (t === 'application/x-www-form-urlencoded' ? t : false) });
  const continueTo = (s: Record<string, unknown>, sid: string, next: string) =>
    req(s, { method: 'GET', sessionID: sid, originalUrl: next, query: { replay: new URL(next, 'http://x').searchParams.get('replay') } });

  /** Rename the passkey on a stale session, then confirm with a passkey; the prompt's return. */
  async function staleRenameThenPasskey() {
    const env = routes(true, passkeyOk);
    const s = session();
    const asked = res();
    await env.r.renameOwnCredential(formPost(s, 'sid-1', { _csrf: 't-old', label: 'Phone' }), asked);
    const reauth = String(asked.redirect.mock.calls[0]?.[0]);
    const next = new URL(reauth, 'http://x').searchParams.get('next') ?? '';
    env.authManager.stepUpNeeded.mockReturnValue(false);
    s.passkeyChallenge = { value: 'c1', purpose: 'reauth', expires: Date.now() + 60_000 };
    const out = res();
    await env.r.passkeyReauthVerify(req(s, { sessionID: 'sid-1', body: { response: {}, next } }), out);
    return { ...env, s, next, out };
  }

  test('the confirmation returns to the continue page, which posts the same fields to the same address once', async () => {
    const { r, authManager, s, next, out } = await staleRenameThenPasskey();
    expect(next).toMatch(/^\/auth\/reauth\/continue\?replay=[0-9a-f]{32}$/);
    expect(out.json).toHaveBeenCalledWith({ ok: true, redirect: next });
    expect(s.stepUpConfirmed).toBeUndefined();
    expect(authManager.renameCredential).not.toHaveBeenCalled();

    const page = res();
    await r.reauthContinue(continueTo(s, 'sid-1', next), page);
    // The session's own CSRF token, not the one kept: the CSRF check runs again on the POST.
    expect(page.render).toHaveBeenCalledWith('reauth-continue', expect.objectContaining({
      action: '/profile/credentials/cred-1/rename', fields: [['label', 'Phone']], back: '/profile', csrfToken: 't'
    }));
    expect(page.set).toHaveBeenCalledWith('Cache-Control', 'no-store');

    // The browser's POST from that page does the action, on its own door.
    const done = res();
    await r.renameOwnCredential(formPost(s, 'sid-1', { _csrf: 't', label: 'Phone' }), done);
    expect(authManager.renameCredential).toHaveBeenCalledTimes(1);
    expect(done.redirect).toHaveBeenCalledWith('/profile?success=Renamed');
  });

  test('a second replay is refused', async () => {
    const { r, s, next } = await staleRenameThenPasskey();
    await r.reauthContinue(continueTo(s, 'sid-1', next), res());
    const again = res();
    await r.reauthContinue(continueTo(s, 'sid-1', next), again);
    expect(again.status).toHaveBeenCalledWith(410);
    expect(again.render).not.toHaveBeenCalledWith('reauth-continue', expect.anything());
  });

  test('a replay from another session is refused, and spent', async () => {
    const { r, s, next } = await staleRenameThenPasskey();
    const other = res();
    await r.reauthContinue(continueTo(session(), 'sid-2', next), other);
    expect(other.status).toHaveBeenCalledWith(410);
    expect(other.render).not.toHaveBeenCalledWith('reauth-continue', expect.anything());
    const mine = res();
    await r.reauthContinue(continueTo(s, 'sid-1', next), mine);
    expect(mine.status).toHaveBeenCalledWith(410);
  });

  test('the prompt\'s Cancel goes back to the page with nothing redone', async () => {
    const env = routes(true, passkeyOk);
    const s = session();
    const asked = res();
    await env.r.renameOwnCredential(formPost(s, 'sid-1', { _csrf: 't-old', label: 'Phone' }), asked);
    const next = new URL(String(asked.redirect.mock.calls[0]?.[0]), 'http://x').searchParams.get('next') ?? '';
    // Still stale; profile-manage never steps up.
    env.authManager.stepUpNeeded.mockImplementation((action: string) => action !== 'profile-manage');
    const out = res();
    await env.r.reauthContinue(continueTo(s, 'sid-1', next), out);
    expect(out.redirect).toHaveBeenCalledWith('/profile');
    expect(out.render).not.toHaveBeenCalled();
  });

  test('Admin → Backup → Make a new set of recovery words is made after the passkey, with no second press (the issue\'s case)', async () => {
    const env = routes(true, passkeyOk);
    // Only the backup key pages' permission steps up, as configured.
    env.authManager.stepUpNeeded.mockImplementation((action: string) => action === 'config-manage');
    const s = session();
    const fromBackup = (h: string) => (h === 'referer' ? 'https://wiki.example.com/admin/backup' : 'ua');
    const press = (csrf: string) => req(s, {
      sessionID: 'sid-1', originalUrl: '/admin/backup/shared-folders/words/new', body: { _csrf: csrf }, get: fromBackup,
      is: (t: string) => (t === 'application/x-www-form-urlencoded' ? t : false),
      userContext: { username: 'molly', roles: ['admin'], isAuthenticated: true }
    });
    const asked = res();
    await env.r.adminSharedFoldersNewWords(press('t-old'), asked);
    const next = new URL(String(asked.redirect.mock.calls[0]?.[0]), 'http://x').searchParams.get('next') ?? '';
    expect(next).toMatch(/^\/auth\/reauth\/continue\?replay=[0-9a-f]{32}$/);
    expect(env.folders.prepareNewRecoveryWords).not.toHaveBeenCalled();

    env.authManager.stepUpNeeded.mockReturnValue(false);
    s.passkeyChallenge = { value: 'c1', purpose: 'reauth', expires: Date.now() + 60_000 };
    const confirmed = res();
    await env.r.passkeyReauthVerify(req(s, { sessionID: 'sid-1', body: { response: {}, next } }), confirmed);
    expect(confirmed.json).toHaveBeenCalledWith({ ok: true, redirect: next });

    const page = res();
    await env.r.reauthContinue(continueTo(s, 'sid-1', next), page);
    expect(page.render).toHaveBeenCalledWith('reauth-continue', expect.objectContaining({
      action: '/admin/backup/shared-folders/words/new', fields: [], back: '/admin/backup', csrfToken: 't'
    }));

    // The continue page's own POST makes the new set.
    const made = res();
    await env.r.adminSharedFoldersNewWords(press('t'), made);
    expect(env.folders.prepareNewRecoveryWords).toHaveBeenCalledTimes(1);
    expect(made.render).toHaveBeenCalledWith('admin-shared-folders-words', expect.objectContaining({ step: 'words', replacing: true }));
  });

  test('a page GET is unchanged: it returns to itself', async () => {
    const env = routes(true, passkeyOk);
    const out = res();
    await env.r.adminBackupKey(req(session(), { method: 'GET', sessionID: 'sid-1', originalUrl: '/admin/backup/key' }), out);
    expect(out.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fadmin%2Fbackup%2Fkey');
  });
});

describe('downloading the backup key file (#2134)', () => {
  test('a stale session is sent to re-authenticate and the key is never read', async () => {
    // Sabotage (2026-10-30): asking holdsPermission instead of permitted() turns this red.
    const { r, backup, audit } = routes(true);
    const out = res();
    await r.adminBackupKeyFile(req(session(), { method: 'GET', originalUrl: '/admin/backup/key/file', get: (h: string) => (h === 'referer' ? 'https://wiki.example.com/admin/backup/key' : 'ua') }), out);
    // #2145: a download returns to the page with the link, not to the file.
    expect(out.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fadmin%2Fbackup%2Fkey');
    expect(backup.revealBackupKeyFile).not.toHaveBeenCalled();
    expect(out.send).not.toHaveBeenCalled();
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-prompt', resource: 'config-manage' }));
  });

  test('a fresh session gets the file', async () => {
    const { r, backup } = routes(false);
    const out = { ...res(), setHeader: vi.fn() };
    await r.adminBackupKeyFile(req(session(), { method: 'GET', originalUrl: '/admin/backup/key/file' }), out);
    expect(backup.revealBackupKeyFile).toHaveBeenCalledWith(expect.objectContaining({ username: 'molly' }));
    expect(out.send).toHaveBeenCalledWith('X=1\n');
  });
});

describe('a page waiting on its prompt asks whether that prompt is confirmed (#2193)', () => {
  const status = (s: Record<string, unknown>, userContext: Record<string, unknown>, prompt?: unknown) =>
    req(s, { method: 'GET', originalUrl: '/auth/reauth/status', query: prompt === undefined ? {} : { prompt }, userContext });
  const molly = { username: 'molly', roles: ['reader'], isAuthenticated: true, aalCap: 1, signIn: { factors: [] } };
  const passwordOk = () => Promise.resolve({ success: true, username: 'molly', provider: 'password', factors: [] });

  /** A script's request refused on session `s`: the prompt id its `reauth` names. */
  async function refusedPrompt(env: ReturnType<typeof routes>, s: Record<string, unknown>): Promise<string> {
    const out = res();
    await env.r.passkeyRegisterOptions(req(s, { method: 'GET', originalUrl: '/auth/passkey/register/options' }), out);
    const { reauth } = (out.json.mock.calls[0] as [{ reauth: string }])[0];
    return new URL(reauth, 'http://x').searchParams.get('prompt') ?? '';
  }

  test('answers whether the sign-in is fresh and where this prompt is, never cached, and leaves the session object as it was', async () => {
    const env = routes(true);
    const s = session();
    const prompt = await refusedPrompt(env, s);
    env.authManager.stepUpNeeded.mockReturnValue(false); // the double asks it of every permission
    env.authManager.signInFresh.mockReturnValue(true);
    const before = JSON.stringify(s);
    const out = res();
    await env.r.reauthStatus(status(s, molly, prompt), out);
    expect(env.authManager.signInFresh).toHaveBeenCalledWith(molly.signIn, ['reader'], false, undefined, 1);
    expect(out.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(out.json).toHaveBeenCalledWith({ fresh: true, prompt: 'waiting' });
    expect(JSON.stringify(s)).toBe(before);
  });

  test('the password confirmation confirms the prompt it was opened for, and no other', async () => {
    // Sabotage (2026-10-31): dropping body.prompt in reauthWithPassword turns this red.
    const env = routes(true, passwordOk);
    const s = session();
    const mine = await refusedPrompt(env, s);
    const other = await refusedPrompt(env, s);
    env.authManager.stepUpNeeded.mockReturnValue(false);
    await env.r.reauthWithPassword(req(s, { body: { password: 'right', next: '/profile', prompt: mine } }), res());
    const answers: unknown[] = [];
    for (const prompt of [mine, other, 'f'.repeat(32)]) {
      const out = res();
      await env.r.reauthStatus(status(s, molly, prompt), out);
      answers.push((out.json.mock.calls[0] as [{ prompt: string }])[0].prompt);
    }
    expect(answers).toEqual(['confirmed', 'waiting', 'unknown']);
  });

  test('the passkey confirmation confirms its prompt too', async () => {
    const env = routes(true, () => Promise.resolve({ success: true, username: 'molly', provider: 'passkey', factors: [] }));
    const s = session();
    const prompt = await refusedPrompt(env, s);
    env.authManager.stepUpNeeded.mockReturnValue(false); // the double asks it of every permission
    s.passkeyChallenge = { value: 'c1', purpose: 'reauth', expires: Date.now() + 60_000 };
    await env.r.passkeyReauthVerify(req(s, { body: { response: {}, next: '/profile', prompt } }), res());
    const out = res();
    await env.r.reauthStatus(status(s, molly, prompt), out);
    expect(out.json).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'confirmed' }));
  });

  test('the prompt page carries its id, only a well-formed one, to the confirmation and to Cancel', async () => {
    const env = routes(false);
    const id = '0123456789abcdef0123456789abcdef';
    const out = res();
    await env.r.reauthPage(req(session(), { method: 'GET', originalUrl: '/auth/reauth', query: { next: '/profile', prompt: id } }), out);
    expect(out.render).toHaveBeenCalledWith('reauth', expect.objectContaining({ prompt: id }));
    const bad = res();
    await env.r.reauthPage(req(session(), { method: 'GET', originalUrl: '/auth/reauth', query: { next: '/profile', prompt: '"><script>' } }), bad);
    expect(bad.render).toHaveBeenCalledWith('reauth', expect.objectContaining({ prompt: '' }));
  });

  test('Cancel marks the prompt cancelled, saves the session, and goes back on this site', async () => {
    const env = routes(true);
    const s = session();
    const prompt = await refusedPrompt(env, s);
    env.authManager.stepUpNeeded.mockReturnValue(false); // the double asks it of every permission
    const out = res();
    await env.r.reauthCancel(req(s, { body: { prompt, next: '/view/Ledger' } }), out);
    expect(s.save).toHaveBeenCalled();
    expect(out.redirect).toHaveBeenCalledWith('/view/Ledger');
    const asked = res();
    await env.r.reauthStatus(status(s, molly, prompt), asked);
    expect(asked.json).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'cancelled' }));
    const away = res();
    await env.r.reauthCancel(req(s, { body: { prompt, next: 'https://evil.example/' } }), away);
    expect(away.redirect).toHaveBeenCalledWith('/');
  });

  test('a delegated credential is never fresh', async () => {
    const { r, authManager } = routes(false);
    await r.reauthStatus(status(session(), { ...molly, viaToken: { id: 't', name: 'bot', scopes: ['profile-manage'] } }), res());
    expect(authManager.signInFresh).toHaveBeenLastCalledWith(molly.signIn, ['reader'], true, undefined, 1);
  });

  test('asked like the prompt itself, profile-manage: a caller refused it learns nothing', async () => {
    const env = routes(false);
    (env.r as unknown as { permitted: () => Promise<boolean> }).permitted = vi.fn((_c, _p, _q, s: ReturnType<typeof res>) => { s.status(401).json({ error: 'Sign in' }); return Promise.resolve(false); }) as never;
    const out = res();
    await env.r.reauthStatus(status(session(), { username: 'anonymous', roles: ['anonymous'] }), out);
    expect(env.authManager.signInFresh).not.toHaveBeenCalled();
    expect(out.json).not.toHaveBeenCalledWith(expect.objectContaining({ fresh: expect.anything() }));
    const cancel = res();
    await env.r.reauthCancel(req(session(), { body: { prompt: 'a'.repeat(32), next: '/' } }), cancel);
    expect(cancel.redirect).not.toHaveBeenCalled();
  });
});

describe('re-authentication with the password (#1525)', () => {
  test('a wrong password is refused, audited, and counted by the throttle', async () => {
    const { r, audit } = routes(false, () => Promise.resolve({ success: false }));
    const out = res();
    await r.reauthWithPassword(req(session(), { body: { password: 'nope', next: '/profile' } }), out);
    expect(out.status).toHaveBeenCalledWith(401);
    expect(out.render).toHaveBeenCalledWith('reauth', expect.objectContaining({ error: 'That password is not correct.' }));
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-failure', result: 'failure' }));
  });

  test('the right password stamps the session\'s sign-in and returns to the page', async () => {
    const { r, authManager, audit } = routes(false, () => Promise.resolve({ success: true, username: 'molly', provider: 'password', factors: [] }));
    const s = session();
    const out = res();
    await r.reauthWithPassword(req(s, { body: { password: 'right', next: '/profile' } }), out);
    // #1758: checked (and audited) by AuthManager as a re-check, never counted as a sign-in.
    expect(authManager.authenticate).toHaveBeenCalledWith('password', { username: 'molly', password: 'right' },
      { ipAddress: '1.2.3.4', userAgent: 'ua', purpose: 're-check' });
    expect(authManager.reauthenticated).toHaveBeenCalled();
    expect(s.signIn).toEqual(expect.objectContaining({ at: 'now' }));
    expect(out.redirect).toHaveBeenCalledWith('/profile');
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-success', result: 'success' }));
  });

  test('someone else\'s password does not re-authenticate this session', async () => {
    const { r, authManager } = routes(false, () => Promise.resolve({ success: true, username: 'sam', provider: 'password', factors: [] }));
    const out = res();
    await r.reauthWithPassword(req(session(), { body: { password: 'x', next: '/profile' } }), out);
    expect(authManager.reauthenticated).not.toHaveBeenCalled();
    expect(out.status).toHaveBeenCalledWith(401);
  });

  test('a next outside this site is never followed', async () => {
    const { r } = routes(false, () => Promise.resolve({ success: true, username: 'molly', provider: 'password', factors: [] }));
    const out = res();
    await r.reauthWithPassword(req(session(), { body: { password: 'right', next: 'https://evil.example/' } }), out);
    expect(out.redirect).toHaveBeenCalledWith('/');
  });
});

describe('revoking an approved app (#1601)', () => {
  test('asks account-security, so a stale session is sent to re-authenticate first', async () => {
    const { r, authManager, oidc } = routes(true);
    const out = res();
    await r.revokeOwnApp(req(session(), { params: { grantId: 'g1' }, originalUrl: '/profile/apps/g1/revoke' }), out);
    expect(out.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fprofile');
    expect(authManager.revokeDelegation).not.toHaveBeenCalled();
    expect(oidc.revokeGrant).not.toHaveBeenCalled();
  });

  test('a fresh session revokes its own grant through AuthManager\'s door, by its own username (#1764)', async () => {
    const { r, authManager, oidc } = routes(false);
    const out = res();
    await r.revokeOwnApp(req(session(), { params: { grantId: 'g1' } }), out);
    expect(authManager.revokeDelegation).toHaveBeenCalledWith(expect.objectContaining({ username: 'molly' }), 'molly', 'app', 'g1');
    expect(oidc.revokeGrant).not.toHaveBeenCalled();
    expect(out.redirect).toHaveBeenCalledWith('/profile?success=Access+revoked');
  });
});

describe('revoking from My tokens and devices (#1764)', () => {
  test('a token row goes through the same door as an app row', async () => {
    const { r, authManager } = routes(false);
    const out = res();
    await r.revokeOwnDelegation(req(session(), { params: { kind: 'token', id: 'tok_1' } }), out);
    expect(authManager.revokeDelegation).toHaveBeenCalledWith(expect.objectContaining({ username: 'molly' }), 'molly', 'token', 'tok_1');
    expect(out.redirect).toHaveBeenCalledWith('/profile?success=Access+revoked');
  });

  test('a stale session is sent to re-authenticate and nothing is revoked', async () => {
    const { r, authManager } = routes(true);
    const out = res();
    await r.revokeOwnDelegation(req(session(), { params: { kind: 'token', id: 'tok_1' }, originalUrl: '/profile/tokens/token/tok_1/revoke' }), out);
    expect(out.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fprofile');
    expect(authManager.revokeDelegation).not.toHaveBeenCalled();
  });

  test('an unknown kind, or a refusal at the door, revokes nothing and says not found', async () => {
    const { r, authManager } = routes(false);
    const out = res();
    await r.revokeOwnDelegation(req(session(), { params: { kind: 'share', id: 's1' } }), out);
    expect(authManager.revokeDelegation).not.toHaveBeenCalled();
    expect(out.redirect).toHaveBeenCalledWith('/profile?error=Not+found');

    authManager.revokeDelegation.mockRejectedValueOnce(new Error('Permission denied'));
    const refused = res();
    await r.revokeOwnDelegation(req(session(), { params: { kind: 'app', id: 'g9' } }), refused);
    expect(refused.redirect).toHaveBeenCalledWith('/profile?error=Not+found');
  });
});

