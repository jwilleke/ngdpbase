/**
 * #2154 — a form POST that asked for a fresh sign-in carries on by itself
 * after it. The prompt keeps the form's fields in memory (never the session
 * store), tied to the session and the person; a confirmation, however late,
 * releases them once for two minutes, to the same address, by POST.
 */
import type { Request } from 'express';
import AuthManager from '../AuthManager';

function double() {
  const audit = { logAuditEvent: vi.fn((e: Record<string, unknown>) => Promise.resolve(String(e.eventType))) };
  const engine = { getManager: (n: string) => (n === 'AuditManager' ? audit : null) };
  const self = {
    engine,
    stepUpReplays: new Map(),
    reauthenticated: vi.fn(() => ({ provider: 'passkey', factors: [], amr: ['hwk'], aal: 2, acr: 'aal2', mfa: true, at: 'now' })),
    recordReauth(...a: Parameters<AuthManager['recordReauth']>) { return AuthManager.prototype.recordReauth.apply(this as never, a); },
    keepStepUpReplay(...a: unknown[]) { return (AuthManager.prototype as unknown as { keepStepUpReplay: (...x: unknown[]) => unknown }).keepStepUpReplay.apply(this, a); }
  };
  const call = <K extends 'askForFreshSignIn' | 'completeReauth' | 'takeStepUpReplay'>(name: K, ...a: Parameters<AuthManager[K]>) =>
    (AuthManager.prototype[name] as (...x: unknown[]) => ReturnType<AuthManager[K]>).apply(self, a);
  /** The `reauth-failure` details recorded. */
  const failures = () => audit.logAuditEvent.mock.calls.map(([e]) => e).filter(e => e.eventType === 'reauth-failure').map(e => (e.metadata as { detail: string }).detail);
  /** The resource each `reauth-success` was recorded against. */
  const successes = () => audit.logAuditEvent.mock.calls.map(([e]) => e).filter(e => e.eventType === 'reauth-success').map(e => e.resource);
  const drop = (sessionId: string) => AuthManager.prototype.dropStepUpReplays.apply(self, [sessionId]);
  return { call, self, failures, successes, drop };
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
    expect(await call('takeStepUpReplay', request({ session: r.session }), id)).toEqual({
      action: '/admin/backup/shared-folders/words/new',
      fields: [['note', 'hello'], ['roles[]', 'a'], ['roles[]', 'b']],
      back: '/admin/backup'
    });
  });

  test('a second replay is refused, and recorded', async () => {
    const { call, failures } = double();
    const id = await askAndConfirm(call);
    expect(await call('takeStepUpReplay', request(), id)).toEqual(expect.objectContaining({ action: expect.any(String) }));
    expect(await call('takeStepUpReplay', request(), id)).toBeNull();
    expect(failures()).toEqual(['kept form POST not found: already used, past its time, or unknown']);
  });

  test('a replay from another session, or by another person, is refused, recorded and spent', async () => {
    const { call, failures } = double();
    const id = await askAndConfirm(call);
    expect(await call('takeStepUpReplay', request({ sessionID: 'sid-2' }), id)).toBeNull();
    expect(await call('takeStepUpReplay', request(), id)).toBeNull();

    const other = await askAndConfirm(call);
    expect(await call('takeStepUpReplay', request({ session: { username: 'mallory' } }), other)).toBeNull();
    expect(failures()).toEqual([
      'kept form POST for /admin/backup/shared-folders/words/new asked for from another session',
      'kept form POST not found: already used, past its time, or unknown',
      'kept form POST for /admin/backup/shared-folders/words/new asked for from another session'
    ]);
  });

  test('without the confirmation (Cancel) it only goes back', async () => {
    const { call, failures } = double();
    const r = request();
    const answer = await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
    const id = new URL(new URL(answer.reauth ?? '', 'http://x').searchParams.get('next') ?? '', 'http://x').searchParams.get('replay') ?? '';
    expect(await call('takeStepUpReplay', request(), id)).toEqual({ back: '/admin/backup' });
    expect(failures()).toEqual([]);
  });

  test('a confirmation more than five minutes after the press still carries on', async () => {
    vi.useFakeTimers();
    try {
      const { call } = double();
      const r = request();
      const answer = await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
      const next = new URL(answer.reauth ?? '', 'http://x').searchParams.get('next') ?? '';
      vi.advanceTimersByTime(6 * 60_000);
      // Another prompt elsewhere sweeps records past their time; this one is not.
      await call('askForFreshSignIn', request({ sessionID: 'sid-2' }), {}, 'config-manage', 'page');
      await call('completeReauth', r, result, 'passkey', next);
      vi.advanceTimersByTime(60_000);
      const id = new URL(next, 'http://x').searchParams.get('replay') ?? '';
      expect(await call('takeStepUpReplay', request({ session: r.session }), id)).toEqual(expect.objectContaining({ action: '/admin/backup/shared-folders/words/new' }));
    } finally {
      vi.useRealTimers();
    }
  });

  test('two minutes after the confirmation it goes back with the note, recorded as a failure', async () => {
    vi.useFakeTimers();
    try {
      const { call, failures } = double();
      const r = request();
      const late = await askAndConfirm(call, r);
      vi.advanceTimersByTime(2 * 60_000 + 1);
      expect(await call('takeStepUpReplay', request({ session: r.session }), late)).toEqual({ back: '/admin/backup' });
      expect(r.session.stepUpConfirmed).toBe('/admin/backup');
      expect(failures()).toEqual(['kept form POST for /admin/backup/shared-folders/words/new past its time; not redone']);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a record past its time is dropped when any replay is taken', async () => {
    vi.useFakeTimers();
    try {
      const { call, self } = double();
      await call('askForFreshSignIn', request(), {}, 'config-manage', 'page');
      vi.advanceTimersByTime(60 * 60_000 + 1);
      await call('takeStepUpReplay', request({ sessionID: 'sid-2' }), 'unknown');
      expect(self.stepUpReplays.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a form holding a secret is never kept: it returns with the note', async () => {
    for (const body of [{ currentPassword: 'x', newPassword: 'y' }, { words: 'a b c', token: 't' }, { sessionSecret: 's' }]) {
      const { call, self } = double();
      const r = request({ body });
      const answer = await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
      expect(answer.reauth).toBe('/auth/reauth?next=%2Fadmin%2Fbackup');
      expect(self.stepUpReplays.size).toBe(0);
    }
  });

  test('the confirmation releases the POST its own prompt named, whatever the session last asked for', async () => {
    const { call } = double();
    const r = request();
    const first = await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
    const pendingFirst = r.session.pendingStepUp;
    const second = await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
    const next = new URL(second.reauth ?? '', 'http://x').searchParams.get('next') ?? '';
    expect(next).not.toBe(new URL(first.reauth ?? '', 'http://x').searchParams.get('next'));
    // A double click: the first POST's session save lands last.
    r.session.pendingStepUp = pendingFirst;
    await call('completeReauth', r, result, 'passkey', next);
    const id = new URL(next, 'http://x').searchParams.get('replay') ?? '';
    expect(await call('takeStepUpReplay', request({ session: r.session }), id)).toEqual(expect.objectContaining({ action: '/admin/backup/shared-folders/words/new' }));

    // Another tab's confirmation already cleared the pending prompt.
    const third = await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
    const thirdNext = new URL(third.reauth ?? '', 'http://x').searchParams.get('next') ?? '';
    delete r.session.pendingStepUp;
    await call('completeReauth', r, result, 'passkey', thirdNext);
    const thirdId = new URL(thirdNext, 'http://x').searchParams.get('replay') ?? '';
    expect(await call('takeStepUpReplay', request({ session: r.session }), thirdId)).toEqual(expect.objectContaining({ action: expect.any(String) }));
  });

  test('a confirmation in another session, or by another person, does not release it, and is recorded as a failure', async () => {
    const { call, failures, successes } = double();
    const r = request({ originalUrl: '/admin/backup/shared-folders/words/new?folder=secret-name' });
    const answer = await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
    const next = new URL(answer.reauth ?? '', 'http://x').searchParams.get('next') ?? '';
    await call('completeReauth', request({ sessionID: 'sid-2' }), result, 'passkey', next);
    await call('completeReauth', request({ session: { username: 'mallory' } }), result, 'passkey', next);
    const id = new URL(next, 'http://x').searchParams.get('replay') ?? '';
    expect(await call('takeStepUpReplay', request({ session: r.session }), id)).toEqual({ back: '/admin/backup' });
    // Their own re-authentication is not recorded against the other session's
    // permission, and the address is recorded without its query (#2176).
    expect(successes()).toEqual(['passkey', 'passkey']);
    expect(failures()).toEqual([
      'kept form POST for /admin/backup/shared-folders/words/new confirmed from another session; not released',
      'kept form POST for /admin/backup/shared-folders/words/new confirmed from another session; not released'
    ]);
  });

  test('the same button in two tabs: confirming the first prompt carries out its own POST, once (#2176)', async () => {
    const { call, failures } = double();
    const r = request();
    const nextOf = (a: { reauth?: string }) => new URL(a.reauth ?? '', 'http://x').searchParams.get('next') ?? '';
    const replayOf = (next: string) => new URL(next, 'http://x').searchParams.get('replay') ?? '';
    const first = nextOf(await call('askForFreshSignIn', r, {}, 'config-manage', 'page'));
    const second = nextOf(await call('askForFreshSignIn', r, {}, 'config-manage', 'page'));

    await call('completeReauth', r, result, 'passkey', first);
    expect(await call('takeStepUpReplay', request({ session: r.session }), replayOf(first))).toEqual(expect.objectContaining({ action: '/admin/backup/shared-folders/words/new' }));
    expect(await call('takeStepUpReplay', request({ session: r.session }), replayOf(first))).toBeNull();

    // The first confirmation released only its own: the second tab's waits for
    // its own confirmation, and is then carried out once too.
    await call('completeReauth', r, result, 'passkey', second);
    expect(await call('takeStepUpReplay', request({ session: r.session }), replayOf(second))).toEqual(expect.objectContaining({ action: '/admin/backup/shared-folders/words/new' }));
    expect(await call('takeStepUpReplay', request({ session: r.session }), replayOf(second))).toBeNull();
    expect(failures()).toEqual([
      'kept form POST not found: already used, past its time, or unknown',
      'kept form POST not found: already used, past its time, or unknown'
    ]);
  });

  test('confirming one prompt does not release another prompt on the session (#2176)', async () => {
    const { call } = double();
    const r = request();
    const nextOf = (a: { reauth?: string }) => new URL(a.reauth ?? '', 'http://x').searchParams.get('next') ?? '';
    const first = nextOf(await call('askForFreshSignIn', r, {}, 'config-manage', 'page'));
    const second = nextOf(await call('askForFreshSignIn', r, {}, 'config-manage', 'page'));
    await call('completeReauth', r, result, 'passkey', first);
    // Never confirmed: it only goes back.
    const id = new URL(second, 'http://x').searchParams.get('replay') ?? '';
    expect(await call('takeStepUpReplay', request({ session: r.session }), id)).toEqual({ back: '/admin/backup' });
  });

  test('a session keeps at most a few: past that, a new prompt drops the oldest (#2176)', async () => {
    const { call, self } = double();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const answer = await call('askForFreshSignIn', request(), {}, 'config-manage', 'page');
      ids.push(new URL(new URL(answer.reauth ?? '', 'http://x').searchParams.get('next') ?? '', 'http://x').searchParams.get('replay') ?? '');
    }
    await askAndConfirm(call, request({ sessionID: 'sid-2' }));
    expect(self.stepUpReplays.size).toBe(6);
    expect(self.stepUpReplays.has(ids[0])).toBe(false);
    for (const id of ids.slice(1)) expect(self.stepUpReplays.has(id)).toBe(true);
  });

  test('a confirmed POST is not dropped for an unconfirmed one: the sixth prompt drops the oldest unconfirmed (#2176)', async () => {
    const { call, self } = double();
    const r = request();
    const nextOf = (a: { reauth?: string }) => new URL(a.reauth ?? '', 'http://x').searchParams.get('next') ?? '';
    const replayOf = (next: string) => new URL(next, 'http://x').searchParams.get('replay') ?? '';
    const nexts: string[] = [];
    for (let i = 0; i < 5; i++) nexts.push(nextOf(await call('askForFreshSignIn', r, {}, 'config-manage', 'page')));
    await call('completeReauth', r, result, 'passkey', nexts[0]);
    await call('askForFreshSignIn', r, {}, 'config-manage', 'page');
    expect(self.stepUpReplays.has(replayOf(nexts[1]))).toBe(false);
    expect(await call('takeStepUpReplay', request({ session: r.session }), replayOf(nexts[0]))).toEqual(expect.objectContaining({ action: '/admin/backup/shared-folders/words/new' }));
  });

  test('an account keeps at most ten across its sessions, and the site two hundred (#2176)', async () => {
    const { call, self } = double();
    const keep = async (over: Over) => {
      const answer = await call('askForFreshSignIn', request(over), {}, 'config-manage', 'page');
      return new URL(new URL(answer.reauth ?? '', 'http://x').searchParams.get('next') ?? '', 'http://x').searchParams.get('replay') ?? '';
    };
    // Signing in again and again does not hold more: three sessions of five.
    const molly: string[] = [];
    for (let s = 0; s < 3; s++) for (let i = 0; i < 5; i++) molly.push(await keep({ sessionID: `molly-${s}` }));
    expect(Array.from(self.stepUpReplays.values()).filter(k => k.username === 'molly')).toHaveLength(10);
    expect(molly.slice(0, 5).some(id => self.stepUpReplays.has(id))).toBe(false);

    // Nor do many accounts: the site's oldest go past two hundred.
    for (let u = 0; u < 200; u++) await keep({ sessionID: `sid-u${u}`, session: { username: `user-${u}` } });
    expect(self.stepUpReplays.size).toBe(200);
    expect(molly.some(id => self.stepUpReplays.has(id))).toBe(false);
  });

  test('a session\'s end drops the POSTs it kept, and only those (#2176)', async () => {
    const { call, self, drop } = double();
    await call('askForFreshSignIn', request(), {}, 'config-manage', 'page');
    await call('askForFreshSignIn', request(), {}, 'config-manage', 'page');
    await call('askForFreshSignIn', request({ sessionID: 'sid-2' }), {}, 'config-manage', 'page');
    drop('sid-1');
    expect(Array.from(self.stepUpReplays.values()).map(k => k.sessionId)).toEqual(['sid-2']);
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
