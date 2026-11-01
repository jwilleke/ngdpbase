/**
 * #2193 — a script's request refused for a fresh sign-in names its own prompt.
 * The page that sent it waits on that prompt only: the confirmation marks it
 * confirmed, its Cancel cancelled, and another tab's prompt changes nothing
 * here (#2176's rule). Kept on the session, a few at a time; reading one
 * changes nothing.
 */
import type { Request } from 'express';
import AuthManager from '../AuthManager';

function double() {
  const audit = { logAuditEvent: vi.fn(() => Promise.resolve('a')) };
  const engine = { getManager: (n: string) => (n === 'AuditManager' ? audit : null) };
  let record: unknown = { provider: 'passkey', factors: [], amr: ['hwk'], aal: 2, acr: 'aal2', mfa: true, at: 'now' };
  const self = {
    engine,
    stepUpReplays: new Map(),
    reauthenticated: vi.fn(() => record),
    recordReauth(...a: Parameters<AuthManager['recordReauth']>) { return AuthManager.prototype.recordReauth.apply(this as never, a); },
    keepStepUpReplay(...a: unknown[]) { return (AuthManager.prototype as unknown as { keepStepUpReplay: (...x: unknown[]) => unknown }).keepStepUpReplay.apply(this, a); }
  };
  const call = <K extends 'askForFreshSignIn' | 'completeReauth' | 'cancelStepUpPrompt' | 'stepUpPromptState'>(name: K, ...a: Parameters<AuthManager[K]>) =>
    (AuthManager.prototype[name] as (...x: unknown[]) => ReturnType<AuthManager[K]>).apply(self, a);
  return { call, noRecord: () => { record = null; } };
}

function request(session: Record<string, unknown> = { username: 'molly' }) {
  return {
    method: 'POST',
    originalUrl: '/api/forms/submit/led',
    path: '/api/forms/submit/led',
    ip: '1.2.3.4',
    sessionID: 'sid-1',
    session,
    body: { memo: 'hello' },
    is: (t: string) => (t === 'application/json' ? t : false),
    get: (h: string) => (h === 'referer' ? 'https://site.example/view/Ledger' : undefined)
  } as unknown as Request & { session: Record<string, unknown> };
}

const result = { success: true, username: 'molly', provider: 'passkey', factors: [] };

/** The prompt id a refusal's `reauth` names, and its `next`. */
function parts(reauth: string | undefined): { prompt: string; next: string } {
  const url = new URL(reauth ?? '', 'http://x');
  return { prompt: url.searchParams.get('prompt') ?? '', next: url.searchParams.get('next') ?? '' };
}

describe('a script\'s request names its own prompt (#2193)', () => {
  test('a JSON refusal names a new prompt, waiting; a page refusal names none', async () => {
    const { call } = double();
    const r = request();
    const { prompt, next } = parts((await call('askForFreshSignIn', r, {}, 'form-submit', 'json')).reauth);
    expect(prompt).toMatch(/^[0-9a-f]{32}$/);
    expect(next).toBe('/view/Ledger');
    expect(call('stepUpPromptState', r, prompt)).toBe('waiting');
    // The session holds the state only, nothing of the request.
    expect(JSON.stringify(r.session)).not.toContain('hello');

    const page = parts((await call('askForFreshSignIn', request(), {}, 'config-manage', 'page')).reauth);
    expect(page.prompt).toBe('');
  });

  test('two tabs: confirming one prompt confirms that one only', async () => {
    // Sabotage (2026-10-31): confirming every waiting prompt in completeReauth turns this red.
    const { call } = double();
    const r = request();
    const a = parts((await call('askForFreshSignIn', r, {}, 'form-submit', 'json')).reauth);
    const b = parts((await call('askForFreshSignIn', r, {}, 'form-submit', 'json')).reauth);
    expect(a.prompt).not.toBe(b.prompt);
    await call('completeReauth', r, result, 'passkey', a.next, a.prompt);
    expect(call('stepUpPromptState', r, a.prompt)).toBe('confirmed');
    expect(call('stepUpPromptState', r, b.prompt)).toBe('waiting');
  });

  test('Cancel marks the prompt cancelled, and a later confirmation of it changes nothing', async () => {
    const { call } = double();
    const r = request();
    const { prompt, next } = parts((await call('askForFreshSignIn', r, {}, 'form-submit', 'json')).reauth);
    call('cancelStepUpPrompt', r, prompt);
    expect(call('stepUpPromptState', r, prompt)).toBe('cancelled');
    await call('completeReauth', r, result, 'passkey', next, prompt);
    expect(call('stepUpPromptState', r, prompt)).toBe('cancelled');
  });

  test('a confirmation that gives no sign-in does not confirm the prompt', async () => {
    const { call, noRecord } = double();
    const r = request();
    const { prompt, next } = parts((await call('askForFreshSignIn', r, {}, 'form-submit', 'json')).reauth);
    noRecord();
    await call('completeReauth', r, result, 'passkey', next, prompt);
    expect(call('stepUpPromptState', r, prompt)).toBe('waiting');
  });

  test('an unknown, malformed or another session\'s id is unknown, and reading changes nothing', async () => {
    const { call } = double();
    const r = request();
    const { prompt } = parts((await call('askForFreshSignIn', r, {}, 'form-submit', 'json')).reauth);
    const before = JSON.stringify(r.session);
    expect(call('stepUpPromptState', r, 'f'.repeat(32))).toBe('unknown');
    expect(call('stepUpPromptState', r, ['x'])).toBe('unknown');
    expect(call('stepUpPromptState', request({ username: 'molly' }), prompt)).toBe('unknown');
    expect(call('stepUpPromptState', r, prompt)).toBe('waiting');
    expect(JSON.stringify(r.session)).toBe(before);
  });

  test('a session keeps its five newest prompts', async () => {
    const { call } = double();
    const r = request();
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(parts((await call('askForFreshSignIn', r, {}, 'form-submit', 'json')).reauth).prompt);
    expect(call('stepUpPromptState', r, ids[0])).toBe('unknown');
    for (const id of ids.slice(1)) expect(call('stepUpPromptState', r, id)).toBe('waiting');
  });

  test('a delegated credential gets no prompt', async () => {
    const { call } = double();
    const r = request();
    const answer = await call('askForFreshSignIn', r, { viaToken: { id: 't' } }, 'form-submit', 'json');
    expect(answer.reauth).toBeUndefined();
    expect(r.session.stepUpPrompts).toBeUndefined();
  });
});
