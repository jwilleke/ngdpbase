/**
 * #2145 — where a fresh sign-in returns, and what it says there. The prompt
 * remembers which permission it was for and whether going back redoes the
 * action; the success is recorded against that permission; a return that
 * cannot redo it (a form POST, a script's request, a download) says
 * "Confirmed — you can do it now" once, on the page it returns to.
 */
import type { Request } from 'express';
import AuthManager, { reauthReturnTo } from '../AuthManager';

function double() {
  const audit: Array<Record<string, unknown>> = [];
  const engine = { getManager: (n: string) => (n === 'AuditManager' ? { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve('a'); } } : null) };
  const self = {
    engine,
    stepUpReplays: new Map(),
    reauthenticated: vi.fn(() => ({ provider: 'passkey', factors: [], amr: ['hwk'], aal: 2, acr: 'aal2', mfa: true, at: 'now' })),
    recordReauth(...a: Parameters<AuthManager['recordReauth']>) { return AuthManager.prototype.recordReauth.apply(this as never, a); },
    // #2154: a form POST is kept for redoing only when it can be; these requests have no body.
    keepStepUpReplay(...a: unknown[]) { return (AuthManager.prototype as unknown as { keepStepUpReplay: (...x: unknown[]) => unknown }).keepStepUpReplay.apply(this, a); }
  };
  const call = <K extends 'askForFreshSignIn' | 'completeReauth' | 'takeStepUpNotice'>(name: K, ...a: Parameters<AuthManager[K]>) =>
    (AuthManager.prototype[name] as (...x: unknown[]) => ReturnType<AuthManager[K]>).apply(self, a);
  return { audit, call };
}

function request(over: Partial<{ method: string; originalUrl: string; path: string; referer: string; accept: string; session: Record<string, unknown> }> = {}) {
  const session = over.session ?? { username: 'molly' };
  return {
    method: over.method ?? 'POST',
    originalUrl: over.originalUrl ?? '/admin/backup/create',
    path: over.path ?? '/',
    ip: '1.2.3.4',
    session,
    get: (h: string) => (h === 'referer' ? (over.referer ?? 'https://site.example/admin/backup') : h === 'accept' ? (over.accept ?? 'text/html,application/xhtml+xml') : undefined)
  } as unknown as Request & { session: Record<string, unknown> };
}

const result = { success: true, username: 'molly', provider: 'passkey', factors: [] };

describe('where a fresh sign-in returns (#2145)', () => {
  test('a download returns to the page that linked it, as a POST does; a page GET to itself', () => {
    expect(reauthReturnTo(request({ method: 'GET', originalUrl: '/admin/backup/env' }), 'download')).toBe('/admin/backup');
    expect(reauthReturnTo(request({ method: 'POST' }), 'page')).toBe('/admin/backup');
    expect(reauthReturnTo(request({ method: 'GET', originalUrl: '/admin/backup/key' }), 'page')).toBe('/admin/backup/key');
  });

  test('the prompt keeps what it was for: permission, return, and whether returning redoes it', async () => {
    const { call } = double();
    const download = request({ method: 'GET', originalUrl: '/admin/backup/env' });
    const answer = await call('askForFreshSignIn', download, {}, 'config-manage', 'download');
    expect(answer.reauth).toBe('/auth/reauth?next=%2Fadmin%2Fbackup');
    expect(download.session.pendingStepUp).toEqual({ permission: 'config-manage', next: '/admin/backup', replays: false });

    const page = request({ method: 'GET', originalUrl: '/admin/backup/key' });
    await call('askForFreshSignIn', page, {}, 'config-manage', 'page');
    expect(page.session.pendingStepUp).toEqual({ permission: 'config-manage', next: '/admin/backup/key', replays: true });
  });

  test('the session is saved with it before the answer goes out, so the prompt\'s request reads it', async () => {
    // Found on a live run: express-session's own save lands after the browser has followed the redirect.
    const { call } = double();
    const saved: unknown[] = [];
    const session: Record<string, unknown> = { username: 'molly' };
    session.save = vi.fn((cb: () => void) => { saved.push(session.pendingStepUp); cb(); });
    await call('askForFreshSignIn', request({ method: 'GET', originalUrl: '/admin/backup/env', session }), {}, 'config-manage', 'download');
    expect(saved).toEqual([{ permission: 'config-manage', next: '/admin/backup', replays: false }]);
  });

  test('a delegated credential keeps nothing: it is never sent to the prompt', async () => {
    const { call } = double();
    const r = request();
    await call('askForFreshSignIn', r, { viaToken: { id: 't' } }, 'config-manage', 'page');
    expect(r.session.pendingStepUp).toBeUndefined();
  });

  test('the success is recorded against the permission, and a return that cannot redo it is flagged for its page', async () => {
    const { call, audit } = double();
    const r = request({ session: { username: 'molly', pendingStepUp: { permission: 'config-manage', next: '/admin/backup?tab=1', replays: false } } });
    await call('completeReauth', r, result, 'passkey', '/admin/backup?tab=1');
    expect(r.session.pendingStepUp).toBeUndefined();
    expect(r.session.stepUpConfirmed).toBe('/admin/backup');
    expect(audit).toContainEqual(expect.objectContaining({ eventType: 'reauth-success', resource: 'config-manage', resourceType: 'permission',
      metadata: { detail: 're-authenticated with passkey for config-manage; acr aal2' } }));
  });

  test('a return that redoes the action, or one the prompt did not name, is not flagged', async () => {
    const { call, audit } = double();
    const replay = request({ session: { username: 'molly', pendingStepUp: { permission: 'config-manage', next: '/admin/backup/key', replays: true } } });
    await call('completeReauth', replay, result, 'passkey', '/admin/backup/key');
    expect(replay.session.stepUpConfirmed).toBeUndefined();

    const elsewhere = request({ session: { username: 'molly', pendingStepUp: { permission: 'config-manage', next: '/admin/backup', replays: false } } });
    await call('completeReauth', elsewhere, result, 'passkey', '/profile');
    expect(elsewhere.session.stepUpConfirmed).toBeUndefined();
    expect(elsewhere.session.pendingStepUp).toBeUndefined();
    expect(audit.at(-1)).toEqual(expect.objectContaining({ resource: 'passkey' }));
  });

  test('the note shows once, on the page it was for; the next page view clears it either way', () => {
    const { call } = double();
    const session: Record<string, unknown> = { stepUpConfirmed: '/admin/backup' };
    // A script's request for data neither shows nor clears it.
    expect(call('takeStepUpNotice', request({ method: 'GET', path: '/admin/backup', accept: 'application/json', session }))).toBe(false);
    expect(session.stepUpConfirmed).toBe('/admin/backup');
    expect(call('takeStepUpNotice', request({ method: 'GET', path: '/admin/backup', session }))).toBe(true);
    expect(call('takeStepUpNotice', request({ method: 'GET', path: '/admin/backup', session }))).toBe(false);

    const other: Record<string, unknown> = { stepUpConfirmed: '/admin/backup' };
    expect(call('takeStepUpNotice', request({ method: 'GET', path: '/view/Welcome', session: other }))).toBe(false);
    expect(other.stepUpConfirmed).toBeUndefined();
  });
});
