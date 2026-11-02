/**
 * #421 slice 2c — step-up with the authenticator app. An account with an app
 * enrolled, whose `totp` factor entry is enabled, is offered the app's code at
 * the step-up prompt; at AAL2 it goes with the password, and the two together
 * reach it. A wrong answer re-prompts and counts against the sign-in
 * throttle. No app, or the entry disabled: not offered. And the regression
 * the slice closes: an admin (AAL2) with only a password and an app can pass
 * step-up and remove the app.
 *
 * The real AuthManager and FileCredentialsProvider, in a temp directory that is
 * all that is removed; WikiRoutes with a PDP double that asks AuthManager about
 * freshness as the real one does. No seed or password hash is printed.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Secret, TOTP } from 'otpauth';
import WikiRoutes from '../WikiRoutes';
import AuthManager from '../../managers/AuthManager.js';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins.js';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider.js';
import { hashPassword } from '../../utils/passwordHash.js';

const KEY = 'test-credentials-key-not-a-secret';
const PASSWORD = 'correct horse battery staple';
const factors = (totpEnabled: boolean) => [
  { authproviderid: 'password', primary: true, amr: ['pwd'], aal: 1, enabled: true },
  { authproviderid: 'totp', primary: false, amr: ['otp'], aal: 1, enabled: totpEnabled, preference: 3 }
];
const subject = (username: string) => ({ username, roles: ['reader'], isAuthenticated: true }) as never;
const codeFor = (seed: string, at: number) => new TOTP({ secret: Secret.fromBase32(seed), digits: 6, period: 30, algorithm: 'SHA1' }).generate({ timestamp: at });
const nextCode = (seed: string) => codeFor(seed, Date.now() + 30_000);
const wrong = (seed: string) => (nextCode(seed) === '000000' ? '111111' : '000000');
/** A sign-in with a password and the app's code `minutesAgo`: AAL2 then, stale after five minutes. */
const staleSignIn = (minutesAgo = 60) => {
  const at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return { provider: 'password', factors: [{ provider: 'password', amr: ['pwd'], aal: 1, at }, { provider: 'totp', amr: ['otp'], aal: 1, at }], amr: ['pwd', 'otp'], aal: 2, acr: 'aal2', mfa: true, at };
};

const res = () => ({
  status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), redirect: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(), render: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), setHeader: vi.fn().mockReturnThis()
});

describe('step-up with the authenticator app (#421 slice 2c)', () => {
  let dir: string;
  let file: string;
  let hash: string;
  const roles: Record<string, string[]> = { molly: ['reader'], jim: ['admin'] };
  const savedKey = process.env[CREDENTIALS_KEY_ENV];

  beforeAll(async () => { hash = await hashPassword(PASSWORD); });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-421-stepup-'));
    file = path.join(dir, 'users', 'credentials.json');
    process.env[CREDENTIALS_KEY_ENV] = KEY;
    // The throttle is one per process; each test starts with its own.
    (WikiRoutes as unknown as { loginThrottle: unknown }).loginThrottle = null;
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    (WikiRoutes as unknown as { loginThrottle: unknown }).loginThrottle = null;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function setUp(totpEnabled = true) {
    const config: Record<string, unknown> = {
      'ngdpbase.auth.factors': factors(totpEnabled),
      'ngdpbase.auth.step-up': { 'max-age-minutes': 5 },
      'ngdpbase.permissions.definitions': { 'account-security': { description: 'own account', 'step-up': true } },
      'ngdpbase.auth.throttle.max-attempts': 3
    };
    const session: Record<string, unknown> = { save: vi.fn((cb: (e?: unknown) => void) => cb()) };
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in config ? config[k] : d),
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? file : d),
        isBaseUrlExplicit: () => false,
        getBaseURL: () => 'http://wiki.example.com',
        getApplicationName: () => 'Willeke Family'
      },
      // Grants by role, then asks AuthManager about freshness, as the real PDP does (#1635).
      PolicyDecisionPoint: {
        permits: (s: { roles?: string[] }, action: string) => Promise.resolve(!am.stepUpNeeded(action, session.signIn as never, s.roles ?? [], false)),
        holds: () => Promise.resolve(true)
      },
      PolicyInformationPoint: { subjectFor: (u: string) => Promise.resolve(roles[u] ? { username: u, roles: roles[u], isAuthenticated: true } : null) },
      RoleManager: { roleRequiredAal: () => ({ admin: 2, reader: 1 }), operatorRequiredAal: () => ({}) },
      UserManager: {
        getUser: (u: string) => Promise.resolve(roles[u] ? { username: u } : null),
        hasPassword: () => Promise.resolve(true),
        storedPasswordHash: (u: string) => Promise.resolve(roles[u] ? hash : null),
        upgradePasswordHash: () => Promise.resolve()
      },
      PluginManager: TEST_PLUGIN_MANAGER,
      AuditManager: { logAuditEvent: () => Promise.resolve('evt'), logAuthentication: () => Promise.resolve('evt') }
    };
    const engine = { getManager: (n: string) => managers[n] ?? null };
    const am = new AuthManager(engine as never);
    await am.initialize();
    managers.AuthManager = am;
    const r = new WikiRoutes(engine) as unknown as Record<string, (q: unknown, s: unknown) => Promise<void>>;
    (r as unknown as { getCommonTemplateData: () => Promise<Record<string, unknown>> }).getCommonTemplateData = () => Promise.resolve({ csrfToken: 't' });
    return { am, r, session };
  }

  const req = (username: string, session: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    session, body: {}, ip: '1.2.3.4', headers: {}, query: {}, params: {}, method: 'POST', originalUrl: '/auth/reauth/totp',
    get: (h: string) => (h === 'referer' ? 'https://wiki.example.com/profile' : 'ua'),
    userContext: { username, roles: roles[username], isAuthenticated: true },
    ...extra
  });

  /** Enrol an app for `username`, on a fresh sign-in; returns its seed and credential id. */
  const enrolled = async (am: AuthManager, username: string, session: Record<string, unknown>): Promise<{ seed: string; id: string }> => {
    session.signIn = staleSignIn(0);
    const { seed, pending } = await am.totpEnrolmentStart(subject(username), username);
    const id = await am.totpEnrolmentConfirm(subject(username), username, pending, codeFor(seed, Date.now()), 'Phone');
    expect(id).toEqual(expect.any(String));
    return { seed, id: id };
  };

  test('offered, at AAL2 with the password: the right password and code reach it', async () => {
    const { am, r, session } = await setUp();
    const { seed } = await enrolled(am, 'jim', session);
    session.signIn = staleSignIn();
    const page = res();
    await r.reauthPage(req('jim', session, { method: 'GET', originalUrl: '/auth/reauth', query: { next: '/profile' } }), page);
    expect(page.render).toHaveBeenCalledWith('reauth', expect.objectContaining({ needsPasskey: true, hasPasskey: false, hasTotp: true }));

    const out = res();
    await r.reauthWithTotp(req('jim', session, { body: { password: PASSWORD, code: nextCode(seed), next: '/profile' } }), out);
    expect(out.redirect).toHaveBeenCalledWith('/profile');
    expect(am.signInFresh(session.signIn as never, ['admin'], false)).toBe(true);
  });

  test('the code alone does not reach AAL2: the password is asked with it', async () => {
    const { am, r, session } = await setUp();
    const { seed } = await enrolled(am, 'jim', session);
    session.signIn = staleSignIn();
    const out = res();
    await r.reauthWithTotp(req('jim', session, { body: { code: nextCode(seed), next: '/profile' } }), out);
    expect(out.status).toHaveBeenCalledWith(401);
    expect(am.signInFresh(session.signIn as never, ['admin'], false)).toBe(false);
  });

  test('a reader (AAL1) confirms with the code alone', async () => {
    const { am, r, session } = await setUp();
    const { seed } = await enrolled(am, 'molly', session);
    session.signIn = staleSignIn();
    const out = res();
    await r.reauthWithTotp(req('molly', session, { body: { code: nextCode(seed), next: '/profile' } }), out);
    expect(out.redirect).toHaveBeenCalledWith('/profile');
    expect(am.signInFresh(session.signIn as never, ['reader'], false)).toBe(true);
  });

  test('a wrong code re-prompts, and wrong codes are throttled like wrong passwords', async () => {
    const { am, r, session } = await setUp();
    const { seed } = await enrolled(am, 'jim', session);
    session.signIn = staleSignIn();
    for (let i = 0; i < 3; i++) {
      const out = res();
      await r.reauthWithTotp(req('jim', session, { body: { password: PASSWORD, code: wrong(seed), next: '/profile' } }), out);
      expect(out.status).toHaveBeenCalledWith(401);
      expect(out.render).toHaveBeenCalledWith('reauth', expect.objectContaining({ error: 'That password or code is not correct.', hasTotp: true }));
    }
    // Blocked now: even the right answer is not checked.
    const blocked = res();
    await r.reauthWithTotp(req('jim', session, { body: { password: PASSWORD, code: nextCode(seed), next: '/profile' } }), blocked);
    expect(blocked.render).toHaveBeenCalledWith('reauth', expect.objectContaining({ error: 'Too many attempts. Wait a few minutes and try again.' }));
    expect(am.signInFresh(session.signIn as never, ['admin'], false)).toBe(false);
  });

  test('no app enrolled: not offered, and a code is not accepted', async () => {
    const { am, r, session } = await setUp();
    session.signIn = staleSignIn();
    const page = res();
    await r.reauthPage(req('jim', session, { method: 'GET', originalUrl: '/auth/reauth', query: { next: '/profile' } }), page);
    expect(page.render).toHaveBeenCalledWith('reauth', expect.objectContaining({ hasTotp: false }));
    const out = res();
    await r.reauthWithTotp(req('jim', session, { body: { password: PASSWORD, code: '123456', next: '/profile' } }), out);
    expect(out.render).toHaveBeenCalledWith('reauth', expect.objectContaining({ error: 'An authenticator app is not available to confirm it is you here.' }));
    expect(am.signInFresh(session.signIn as never, ['admin'], false)).toBe(false);
  });

  test('the factor entry disabled: not offered, and a right code is not accepted', async () => {
    const { am, r, session } = await setUp(false);
    // Enrolment is not the factor entry's; the app stays enrolled while the entry is off.
    const { seed } = await enrolled(am, 'jim', session);
    session.signIn = staleSignIn();
    expect(am.stepUpTotpOffered('jim')).toBe(false);
    const page = res();
    await r.reauthPage(req('jim', session, { method: 'GET', originalUrl: '/auth/reauth', query: { next: '/profile' } }), page);
    expect(page.render).toHaveBeenCalledWith('reauth', expect.objectContaining({ hasTotp: false }));
    const out = res();
    await r.reauthWithTotp(req('jim', session, { body: { password: PASSWORD, code: nextCode(seed), next: '/profile' } }), out);
    expect(out.redirect).not.toHaveBeenCalled();
    expect(am.signInFresh(session.signIn as never, ['admin'], false)).toBe(false);
  });

  test('regression: an admin with only a password and an app reaches /profile/totp and removes the app', async () => {
    const { am, r, session } = await setUp();
    const { seed, id } = await enrolled(am, 'jim', session);
    session.signIn = staleSignIn();

    // Stale: removing the app sends them to step-up first, and nothing is removed.
    const first = res();
    await r.removeOwnCredential(req('jim', session, { params: { id }, originalUrl: `/profile/credentials/${id}/remove` }), first);
    expect(first.redirect).toHaveBeenCalledWith('/auth/reauth?next=%2Fprofile');
    expect(am.hasCredential('jim', 'totp')).toBe(true);

    const confirm = res();
    await r.reauthWithTotp(req('jim', session, { body: { password: PASSWORD, code: nextCode(seed), next: '/profile' } }), confirm);
    expect(confirm.redirect).toHaveBeenCalledWith('/profile');

    // Fresh: the app can be removed, and /profile/totp then opens to add one again.
    const remove = res();
    await r.removeOwnCredential(req('jim', session, { params: { id }, originalUrl: `/profile/credentials/${id}/remove` }), remove);
    expect(remove.redirect).toHaveBeenCalledWith('/profile?success=Credential+removed');
    expect(am.hasCredential('jim', 'totp')).toBe(false);
    const enrolPage = res();
    await r.totpEnrolPage(req('jim', session, { method: 'GET', originalUrl: '/profile/totp' }), enrolPage);
    expect(enrolPage.render).toHaveBeenCalledWith('profile-totp', expect.anything());
  });
});
