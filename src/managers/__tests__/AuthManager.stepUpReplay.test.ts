/**
 * #2154 — a form POST that asked for a fresh sign-in carries on by itself
 * after it. The prompt keeps the form's fields in memory (never the session
 * store), tied to the session and the person, for five minutes; a
 * confirmation releases them once, to the same address, by POST.
 */
import type { Request } from 'express';
import AuthManager from '../AuthManager';

function double() {
  const engine = { getManager: (n: string) => (n === 'AuditManager' ? { logAuditEvent: () => Promise.resolve('a') } : null) };
  const self = {
    engine,
    stepUpReplays: new Map(),
    reauthenticated: vi.fn(() => ({ provider: 'passkey', factors: [], amr: ['hwk'], aal: 2, acr: 'aal2', mfa: true, at: 'now' })),
    recordReauth(...a: Parameters<AuthManager['recordReauth']>) { return AuthManager.prototype.recordReauth.apply(this as never, a); },
    keepStepUpReplay(...a: unknown[]) { return (AuthManager.prototype as unknown as { keepStepUpReplay: (...x: unknown[]) => unknown }).keepStepUpReplay.apply(this, a); }
  };
  const call = <K extends 'askForFreshSignIn' | 'completeReauth' | 'takeStepUpReplay'>(name: K, ...a: Parameters<AuthManager[K]>) =>
    (AuthManager.prototype[name] as (...x: unknown[]) => ReturnType<AuthManager[K]>).apply(self, a);
  return { call, self };
}

type Over = Partial<{ method: string; originalUrl: string; sessionID: string; type: string; body: unknown; session: Record<string, unknown> }>;

function request(over: Over = {}) {
  const session = over.session ?? { username: 'molly' };
  return {
    method: over.method ?? 'POST',
    originalUrl: over.originalUrl ?? '/admin/backup/shared-folders/words/new',
    path: '/',
    ip: '1.2.3.4',
    sessionID: over.sessionID ?? 'sid-1',
    session,
    body: over.body ?? { _csrf: 'old-token', note: 'hello', roles: ['a', 'b'] },
    is: (t: string) => (t === (over.type ?? 'application/x-www-form-urlencoded') ? t : false),
    get: (h: string) => (h === 'referer' ? 'https://site.example/admin/backup' : undefined)
  } as unknown as Request & { session: Record<string, unknown> };
}

const result = { success: true, username: 'molly', provider: 'passkey', factors: [] };

/** Ask, confirm with `next`, and return the replay id the prompt named. */
async function askAndConfirm(call: ReturnType<typeof double>['call'], r = request()): Promise<string> {
  const answer = await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
  const next = new URL(answer.reauth ?? '', 'http://x').searchParams.get('next') ?? '';
  await call('completeReauth', r, result, 'passkey', next);
  return new URL(next, 'http://x').searchParams.get('replay') ?? '';
}

describe('a form POST carries on after a fresh sign-in (#2154)', () => {
  test('the prompt returns to the continue page, which redoes the POST once with the same fields', async () => {
    const { call } = double();
    const r = request();
    const answer = await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
    const next = new URL(answer.reauth ?? '', 'http://x').searchParams.get('next') ?? '';
    expect(next).toMatch(/^\/auth\/reauth\/continue\?replay=[0-9a-f]{32}$/);
    expect(r.session.pendingStepUp).toEqual(expect.objectContaining({ permission: 'config-manage', next, replays: true }));
    // The fields are never put on the session (its store is on disk).
    expect(JSON.stringify(r.session)).not.toContain('hello');

    await call('completeReauth', r, result, 'passkey', next);
    expect(r.session.stepUpConfirmed).toBeUndefined();
    const id = new URL(next, 'http://x').searchParams.get('replay') ?? '';
    expect(call('takeStepUpReplay', request({ session: r.session }), id)).toEqual({
      action: '/admin/backup/shared-folders/words/new',
      fields: [['note', 'hello'], ['roles[]', 'a'], ['roles[]', 'b']],
      back: '/admin/backup'
    });
  });

  test('a second replay is refused', async () => {
    const { call } = double();
    const id = await askAndConfirm(call);
    expect(call('takeStepUpReplay', request(), id)).toEqual(expect.objectContaining({ action: expect.any(String) }));
    expect(call('takeStepUpReplay', request(), id)).toBeNull();
  });

  test('a replay from another session, or by another person, is refused and spent', async () => {
    const { call } = double();
    const id = await askAndConfirm(call);
    expect(call('takeStepUpReplay', request({ sessionID: 'sid-2' }), id)).toBeNull();
    expect(call('takeStepUpReplay', request(), id)).toBeNull();

    const other = await askAndConfirm(call);
    expect(call('takeStepUpReplay', request({ session: { username: 'mallory' } }), other)).toBeNull();
  });

  test('without the confirmation (Cancel), or after five minutes, it only goes back', async () => {
    const { call } = double();
    const r = request();
    const answer = await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
    const id = new URL(new URL(answer.reauth ?? '', 'http://x').searchParams.get('next') ?? '', 'http://x').searchParams.get('replay') ?? '';
    expect(call('takeStepUpReplay', request(), id)).toEqual({ back: '/admin/backup' });

    vi.useFakeTimers();
    try {
      const late = await askAndConfirm(call);
      vi.advanceTimersByTime(5 * 60_000 + 1);
      expect(call('takeStepUpReplay', request(), late)).toEqual({ back: '/admin/backup' });
    } finally {
      vi.useRealTimers();
    }
  });

  test('a new prompt on the session drops the one before it', async () => {
    const { call, self } = double();
    const first = await askAndConfirm(call);
    await askAndConfirm(call);
    expect(self.stepUpReplays.size).toBe(1);
    expect(call('takeStepUpReplay', request(), first)).toBeNull();
  });

  test('what cannot be replayed exactly returns to the page with the note, as before (#2145)', async () => {
    const cases: Over[] = [
      { type: 'multipart/form-data' },
      { body: { nested: { a: '1' } } },
      { body: { 'odd[': 'x' } },
      { originalUrl: '//evil.example/x' }
    ];
    for (const over of cases) {
      const { call, self } = double();
      const r = request(over);
      const answer = await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
      expect(answer.reauth).toBe('/auth/reauth?next=%2Fadmin%2Fbackup');
      expect(r.session.pendingStepUp).toEqual({ permission: 'config-manage', next: '/admin/backup', replays: false });
      expect(self.stepUpReplays.size).toBe(0);
    }
  });

  test('GET and a script\'s POST are unchanged', async () => {
    const { call, self } = double();
    const page = request({ method: 'GET', originalUrl: '/admin/backup/key' });
    await call('askForFreshSignIn', page, {}, 'config-manage', 'page');
    expect(page.session.pendingStepUp).toEqual({ permission: 'config-manage', next: '/admin/backup/key', replays: true });

    const script = request();
    await call('askForFreshSignIn', script, {}, 'config-manage', 'json');
    expect(script.session.pendingStepUp).toEqual({ permission: 'config-manage', next: '/admin/backup', replays: false });
    expect(self.stepUpReplays.size).toBe(0);
  });
});
