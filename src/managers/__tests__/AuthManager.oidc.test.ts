/**
 * #1743 — outside sign-in through AuthManager, the one door: providers
 * registered from configuration (the new map, and the old google-oidc keys),
 * offered as a sign-in method at AAL1, connecting an identity to the signed-in
 * account (one account per identity, step-up applies), signing in only a
 * connected identity, and disconnecting under the last-way-in rule.
 *
 * A real FileCredentialsProvider in a temp directory (all that is removed),
 * a fake issuer in place of guardedFetch, and keys made at run time.
 */
vi.unmock('../../providers/FileCredentialsProvider');
vi.mock('../../http/guardedFetch.js', () => ({ guardedFetch: vi.fn() }));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as crypto from 'node:crypto';
import AuthManager from '../AuthManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';
import { guardedFetch } from '../../http/guardedFetch.js';
import { fakeIssuer, flowFrom, type FakeIssuer } from '../../providers/__tests__/__fixtures__/fakeOidcIssuer';
import { UserCreateError } from '../../utils/userCreateError';
import { endSession } from '../../utils/sessionEnd';

/** A client-secret value written straight into config (not a $NAME reference), made up per run. */
const NOT_AN_ENV_REFERENCE = `literal-${crypto.randomUUID()}`;

const BROWSER = 'browser-a';
const SECRET_ENV = 'NGDPBASE_TEST_OIDC_CLIENT_SECRET';
const subject = (username: string) => ({ username, roles: ['reader'], isAuthenticated: true }) as never;

describe('AuthManager outside sign-in (#1743)', () => {
  let dir: string;
  let file: string;
  let idp: FakeIssuer;
  let config: Record<string, unknown>;
  let users: Record<string, { passwordSet?: boolean; allowedAuthMethods?: string[]; email?: string }>;
  let created: Array<{ input: Record<string, unknown>; ctx: Record<string, unknown> }>;
  let emailLookups: number;
  let auditEvents: Array<Record<string, unknown>>;
  let deleted: Array<{ username: string; ctx: Record<string, unknown> }>;
  let authAudit: Array<{ ctx: Record<string, unknown>; result: string; reason: string }>;
  let stale: boolean;
  const saved = { key: process.env[CREDENTIALS_KEY_ENV], secret: process.env[SECRET_ENV] };

  const started = async (): Promise<AuthManager> => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in config ? config[k] : d),
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? file : d),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://wiki.example.com'
      },
      PolicyDecisionPoint: {
        permits: (_s: unknown, action: string) => Promise.resolve(!stale && action === 'account-security'),
        holds: (_s: unknown, action: string) => Promise.resolve(action === 'account-security')
      },
      UserManager: {
        // undefined for nobody, as UserManager answers (deriveUsername relies on it).
        getUser: (u: string) => Promise.resolve(users[u] ? { ...users[u] } : undefined),
        hasPassword: (u: string) => Promise.resolve(Boolean(users[u]?.passwordSet)),
        getUserByEmail: () => { emailLookups++; return Promise.resolve(undefined); },
        // The account-creation door: one email, one account (#1748), as UserManager refuses it.
        createUser: async (input: Record<string, unknown>, ctx: Record<string, unknown>) => {
          await Promise.resolve();
          if (Object.values(users).some(u => u.email === input.email)) {
            throw new UserCreateError('email-taken', 'Email address is already used by another account');
          }
          created.push({ input, ctx });
          users[String(input.username)] = { email: String(input.email) };
          return { username: input.username };
        },
        deleteUser: (username: string, ctx: Record<string, unknown>) => {
          deleted.push({ username, ctx });
          delete users[username];
          return Promise.resolve(true);
        }
      },
      AuditManager: {
        logAuditEvent: (event: Record<string, unknown>) => { auditEvents.push(event); return Promise.resolve('evt'); },
        logAuthentication: (ctx: Record<string, unknown>, result: string, reason: string) => { authAudit.push({ ctx, result, reason }); return Promise.resolve('a'); }
      }
    };
    const manager = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  const provider = (overrides: Record<string, unknown> = {}) => ({
    issuer: idp.issuer, 'client-id': idp.clientId, 'client-secret': `$${SECRET_ENV}`, enabled: true, 'display-name': 'Example IdP', ...overrides
  });

  /** Run a whole flow at the fake issuer: start it, have the issuer vouch for `sub`, return the callback's credentials. */
  const callback = async (am: AuthManager, start: () => Promise<string>, claims: Record<string, unknown> = {}) => {
    const flow = flowFrom(await start());
    idp.idToken = await idp.sign({ sub: 'ann-123', nonce: flow.nonce, ...claims });
    return { token: 'code-1', state: flow.state, deviceState: BROWSER };
  };

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1743-am-'));
    file = path.join(dir, 'users', 'credentials.json');
    process.env[CREDENTIALS_KEY_ENV] = crypto.randomBytes(32).toString('hex');
    idp = await fakeIssuer();
    process.env[SECRET_ENV] = idp.clientSecret;
    vi.mocked(guardedFetch).mockReset();
    vi.mocked(guardedFetch).mockImplementation((url, options) => idp.respond(url, options));
    config = { 'ngdpbase.auth.oidc.providers': { idp: provider() } };
    users = { ann: { passwordSet: true, email: 'ann@example.com' }, sam: {} };
    created = [];
    emailLookups = 0;
    auditEvents = [];
    deleted = [];
    authAudit = [];
    stale = false;
  });

  afterEach(() => {
    for (const [name, value] of [[CREDENTIALS_KEY_ENV, saved.key], [SECRET_ENV, saved.secret]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('registration from configuration', () => {
    test('an enabled entry is registered as oidc:<name> and offered at AAL1 without a factors entry', async () => {
      const am = await started();
      expect(am.outsideProviders()).toEqual([{ id: 'oidc:idp', name: 'idp', displayName: 'Example IdP' }]);
      expect(am.getFactors()).toContainEqual({ provider: 'oidc:idp', primary: true, amr: [], aal: 1 });
    });

    test('a factors entry still governs it: disabled there, it is not offered', async () => {
      config['ngdpbase.auth.factors'] = [{ authproviderid: 'password' }, { authproviderid: 'oidc:idp', enabled: false }];
      const am = await started();
      expect(am.getFactors().map(f => f.provider)).toEqual(['password']);
    });

    test.each([
      ['a literal secret', { 'client-secret': NOT_AN_ENV_REFERENCE }],
      ['a secret whose variable is not set', { 'client-secret': '$NGDPBASE_TEST_UNSET_VARIABLE' }],
      ['no issuer and no preset', { issuer: undefined }],
      ['a preset not available yet', { issuer: undefined, preset: 'apple' }],
      ['no client id', { 'client-id': '' }],
      ['enabled not set', { enabled: undefined }]
    ])('is not registered with %s', async (_what, overrides) => {
      config['ngdpbase.auth.oidc.providers'] = { idp: provider(overrides) };
      expect((await started()).outsideProviders()).toEqual([]);
    });

    test('the google preset fills the issuer and the name', async () => {
      config['ngdpbase.auth.oidc.providers'] = { google: { preset: 'google', 'client-id': 'g', 'client-secret': `$${SECRET_ENV}`, enabled: true } };
      const am = await started();
      expect(am.outsideProviders()).toEqual([{ id: 'oidc:google', name: 'google', displayName: 'Google' }]);
    });

    test('the old google-oidc keys keep working, as the google entry, and only once', async () => {
      config = {
        'ngdpbase.auth.google-oidc.enabled': true,
        'ngdpbase.auth.google-oidc.client-id': 'g',
        'ngdpbase.auth.google-oidc.client-secret': idp.clientSecret,
        'ngdpbase.auth.google-oidc.callback-url': 'https://wiki.example.com/auth/oauth/google/callback',
        // A factors entry under the old id still governs it.
        'ngdpbase.auth.factors': [{ authproviderid: 'password' }, { authproviderid: 'google-oidc', primary: true }]
      };
      const am = await started();
      expect(am.outsideProviders()).toEqual([{ id: 'oidc:google', name: 'google', displayName: 'Google' }]);
      expect(am.getFactors().map(f => f.provider)).toEqual(['password', 'oidc:google']);

      config['ngdpbase.auth.oidc.providers'] = { google: { preset: 'google', 'client-id': 'g2', 'client-secret': `$${SECRET_ENV}`, enabled: true, 'display-name': 'Google (new)' } };
      expect((await started()).outsideProviders()).toEqual([{ id: 'oidc:google', name: 'google', displayName: 'Google (new)' }]);
    });

    test('an account limited to the old google-oidc id may still use oidc:google', async () => {
      users.ann.allowedAuthMethods = ['google-oidc'];
      const am = await started();
      expect(await am.userMayUseProvider('ann', 'oidc:google')).toBe(true);
      expect(await am.userMayUseProvider('ann', 'oidc:idp')).toBe(false);
    });
  });

  describe('connecting and signing in', () => {
    test('a connected identity signs its account in; an unconnected one is refused and audited', async () => {
      const am = await started();
      const refused = await am.authenticate('oidc:idp', await callback(am, () => am.startFlow('oidc:idp', { deviceState: BROWSER })));
      expect(refused).toEqual({ success: false });
      expect(authAudit).toContainEqual(expect.objectContaining({ result: 'failure', reason: 'oidc:idp refused' }));

      const connect = await callback(am, () => am.startConnect(subject('ann'), 'ann', 'oidc:idp', { deviceState: BROWSER }), { email: 'ann@example.com', email_verified: true });
      expect(await am.connectIdentity(subject('ann'), 'ann', 'oidc:idp', connect)).toBe('connected');

      const result = await am.authenticate('oidc:idp', await callback(am, () => am.startFlow('oidc:idp', { deviceState: BROWSER })));
      expect(result).toEqual(expect.objectContaining({ success: true, username: 'ann', provider: 'oidc:idp' }));
      expect(result.factors).toEqual([expect.objectContaining({ provider: 'oidc:idp', aal: 1 })]);

      const [identity] = await am.connectedIdentities(subject('ann'), 'ann');
      expect(identity).toEqual(expect.objectContaining({ label: 'Example IdP', email: 'ann@example.com', provider: { id: 'oidc:idp', name: 'idp', displayName: 'Example IdP' } }));
      expect(identity.lastUsedAt).toBeDefined();
    });

    test('an identity belongs to one account: connecting it to a second is refused', async () => {
      const am = await started();
      expect(await am.connectIdentity(subject('ann'), 'ann', 'oidc:idp',
        await callback(am, () => am.startConnect(subject('ann'), 'ann', 'oidc:idp', { deviceState: BROWSER })))).toBe('connected');
      expect(await am.connectIdentity(subject('ann'), 'ann', 'oidc:idp',
        await callback(am, () => am.startConnect(subject('ann'), 'ann', 'oidc:idp', { deviceState: BROWSER })))).toBe('already-yours');
      expect(await am.connectIdentity(subject('sam'), 'sam', 'oidc:idp',
        await callback(am, () => am.startConnect(subject('sam'), 'sam', 'oidc:idp', { deviceState: BROWSER })))).toBe('connected-elsewhere');
      expect(await am.connectedIdentities(subject('sam'), 'sam')).toEqual([]);
    });

    test('connecting is your own account-security change: another account, or a stale sign-in, is refused', async () => {
      const am = await started();
      await expect(am.startConnect(subject('sam'), 'ann', 'oidc:idp', { deviceState: BROWSER })).rejects.toThrow(/Permission denied/);
      stale = true;
      await expect(am.startConnect(subject('ann'), 'ann', 'oidc:idp', { deviceState: BROWSER })).rejects.toThrow(/Permission denied/);
    });

    test('a connect flow cannot be finished as someone else, and a sign-in flow cannot connect', async () => {
      const am = await started();
      const annsFlow = await callback(am, () => am.startConnect(subject('ann'), 'ann', 'oidc:idp', { deviceState: BROWSER }));
      expect(am.flowConnectsFor('oidc:idp', annsFlow.state)).toBe('ann');
      expect(await am.connectIdentity(subject('sam'), 'sam', 'oidc:idp', annsFlow)).toBe('refused');

      const signIn = await callback(am, () => am.startFlow('oidc:idp', { deviceState: BROWSER, connectFor: 'ann' }));
      expect(am.flowConnectsFor('oidc:idp', signIn.state)).toBeNull();
      expect(await am.connectIdentity(subject('ann'), 'ann', 'oidc:idp', signIn)).toBe('refused');
      expect(await am.connectedIdentities(subject('ann'), 'ann')).toEqual([]);
    });
  });

  describe('disconnecting', () => {
    const connected = async (am: AuthManager, username: string): Promise<string> => {
      await am.connectIdentity(subject(username), username, 'oidc:idp',
        await callback(am, () => am.startConnect(subject(username), username, 'oidc:idp', { deviceState: BROWSER })));
      return (await am.connectedIdentities(subject(username), username))[0].id;
    };

    test('an account with a password may disconnect', async () => {
      const am = await started();
      const id = await connected(am, 'ann');
      expect(await am.removeCredential(subject('ann'), 'ann', id)).toBe(true);
    });

    test('the last way in cannot be disconnected', async () => {
      const am = await started();
      const id = await connected(am, 'sam');
      await expect(am.removeCredential(subject('sam'), 'sam', id)).rejects.toThrow(/last way into the account/);
    });

    test('an identity whose provider is turned off is kept, but is no way in', async () => {
      const am = await started();
      await connected(am, 'sam');
      const passkey = await am.addCredential(subject('sam'), 'sam', { kind: 'passkey', subject: 'cred-1', secret: 'public-key', label: 'Phone' });
      config['ngdpbase.auth.oidc.providers'] = { idp: provider({ enabled: false }) };
      const off = await started();
      expect(await off.connectedIdentities(subject('sam'), 'sam')).toEqual([expect.objectContaining({ provider: null })]);
      await expect(off.removeCredential(subject('sam'), 'sam', passkey)).rejects.toThrow(/last way into the account/);
    });
  });
  describe('an identity connected to no account (#1743 slice 3)', () => {
    const PROVISION = {
      'ngdpbase.auth.oidc.auto-provision': true,
      'ngdpbase.application.registration': true
    };

    /** A request whose session behaves like express-session's: regenerate() empties it. */
    const fakeReq = (initial: Record<string, unknown> = {}) => {
      const session: Record<string, unknown> = {
        ...initial,
        regenerate: vi.fn((cb: (err?: unknown) => void) => {
          for (const k of Object.keys(session)) if (k !== 'regenerate' && k !== 'save') delete session[k];
          cb();
        }),
        save: vi.fn((cb: (err?: unknown) => void) => cb())
      };
      return { session, ip: '203.0.113.9', get: () => 'TestAgent/1.0' } as never as import('express').Request & { session: Record<string, unknown> };
    };

    /** An outside sign-in at the fake issuer, finished through AuthManager. */
    const outsideSignIn = async (am: AuthManager, req: ReturnType<typeof fakeReq>, claims: Record<string, unknown> = {}) =>
      am.finishOutsideSignIn(req, 'oidc:idp', await callback(am, () => am.startFlow('oidc:idp', { deviceState: BROWSER, redirect: '/wanted' }), claims));

    const passwordSignIn = { success: true, username: 'ann', provider: 'password', factors: [] };
    const verified = { email: 'ann@idp.example', email_verified: true };

    test('it is held in the session as a pending connection, and the sign-in page is asked to show it', async () => {
      const am = await started();
      const req = fakeReq();
      const before = Date.now();
      expect(await outsideSignIn(am, req, verified)).toEqual({ outcome: 'connect-first' });
      const pending = req.session.pendingConnection as Record<string, unknown>;
      expect(pending).toEqual(expect.objectContaining({ providerId: 'oidc:idp', subject: `${idp.issuer}#ann-123`, email: 'ann@idp.example', displayName: 'Example IdP' }));
      expect(pending.expiresAt).toBeGreaterThanOrEqual(before + 5 * 60_000);
      expect(pending.expiresAt).toBeLessThanOrEqual(Date.now() + 5 * 60_000);
      expect(am.pendingConnection(req)).toEqual({ displayName: 'Example IdP', email: 'ann@idp.example' });
      expect(req.session.username).toBeUndefined();
      expect(created).toEqual([]);
    });

    test('a sign-in alone never connects it: it is carried across the new session and the person is asked', async () => {
      const am = await started();
      const req = fakeReq();
      await outsideSignIn(am, req, verified);

      const done = await am.completeSignIn(req, passwordSignIn, { method: 'password', returnTo: '/view/Home' });
      expect(req.session.regenerate).toHaveBeenCalledTimes(1);
      expect(done).toEqual({ next: '/login/connect/confirm' });
      expect(req.session.username).toBe('ann');
      expect(req.session.pendingConnection).toEqual(expect.objectContaining({ subject: `${idp.issuer}#ann-123`, returnTo: '/view/Home' }));
      expect(await am.connectedIdentities(subject('ann'), 'ann')).toEqual([]);
      expect(auditEvents.filter(e => e.action === 'credential-add')).toEqual([]);
    });

    test('confirmed, it is connected to the signed-in account, audited, and then signs that account in', async () => {
      const am = await started();
      const req = fakeReq();
      await outsideSignIn(am, req, verified);
      await am.completeSignIn(req, passwordSignIn, { method: 'password' });

      const next = await am.confirmPendingConnection(req, subject('ann'));
      expect(next).toBe('/profile?success=' + encodeURIComponent('Your Example IdP account is connected. You can now sign in with it.'));
      expect(req.session.pendingConnection).toBeUndefined();
      expect(await am.connectedIdentities(subject('ann'), 'ann')).toEqual([expect.objectContaining({ email: 'ann@idp.example' })]);
      expect(auditEvents).toContainEqual(expect.objectContaining({
        action: 'credential-add', user: 'ann', resource: 'ann',
        metadata: expect.objectContaining({ kind: 'identity', how: 'confirmed after sign-in' })
      }));

      const again = fakeReq();
      expect(await outsideSignIn(am, again)).toEqual({ outcome: 'signed-in', next: '/wanted' });
      expect(again.session.username).toBe('ann');
    });

    test('declined, it is dropped and the person goes where their sign-in was going', async () => {
      const am = await started();
      const req = fakeReq();
      await outsideSignIn(am, req, verified);
      await am.completeSignIn(req, passwordSignIn, { method: 'password', returnTo: '/view/Home' });
      expect(am.declinePendingConnection(req)).toBe('/view/Home');
      expect(req.session.pendingConnection).toBeUndefined();
      await expect(am.confirmPendingConnection(req, subject('ann'))).resolves.toMatch(/^\/profile\?error=/);
      expect(await am.connectedIdentities(subject('ann'), 'ann')).toEqual([]);
    });

    test('shared browser: someone else\'s waiting identity is never connected to the next person who signs in', async () => {
      const am = await started();
      // A starts an outside sign-in and walks away; B (ann) signs in with a password on the same browser.
      const req = fakeReq();
      await outsideSignIn(am, req, { sub: 'person-a', email: 'a@idp.example', email_verified: true });
      expect((await am.completeSignIn(req, passwordSignIn, { method: 'password' })).next).toBe('/login/connect/confirm');
      // B ignores the question: nothing connected, and it expires.
      expect(await am.connectedIdentities(subject('ann'), 'ann')).toEqual([]);
      (req.session.pendingConnection as { expiresAt: number }).expiresAt = Date.now() - 1;
      expect(am.pendingConnection(req)).toBeNull();
      // B declines a fresh one: nothing connected either.
      const other = fakeReq();
      await outsideSignIn(am, other, { sub: 'person-a', email: 'a@idp.example', email_verified: true });
      await am.completeSignIn(other, passwordSignIn, { method: 'password' });
      am.declinePendingConnection(other);
      expect(await am.connectedIdentities(subject('ann'), 'ann')).toEqual([]);
      // And A's identity still signs nobody in.
      expect((await outsideSignIn(am, fakeReq(), { sub: 'person-a' })).outcome).toBe('connect-first');
    });

    test('expired before the sign-in, it is dropped; expired at the confirmation, nothing is connected', async () => {
      const am = await started();
      const req = fakeReq();
      await outsideSignIn(am, req, verified);
      (req.session.pendingConnection as { expiresAt: number }).expiresAt = Date.now() - 1;
      expect(am.pendingConnection(req)).toBeNull();
      expect(req.session.pendingConnection).toBeUndefined();

      const late = fakeReq();
      await outsideSignIn(am, late, verified);
      (late.session.pendingConnection as { expiresAt: number }).expiresAt = Date.now() - 1;
      expect(await am.completeSignIn(late, passwordSignIn, { method: 'password' })).toEqual({});
      expect(late.session.pendingConnection).toBeUndefined();

      const atConfirm = fakeReq();
      await outsideSignIn(am, atConfirm, verified);
      await am.completeSignIn(atConfirm, passwordSignIn, { method: 'password' });
      (atConfirm.session.pendingConnection as { expiresAt: number }).expiresAt = Date.now() - 1;
      expect(decodeURIComponent(await am.confirmPendingConnection(atConfirm, subject('ann')))).toMatch(/^\/profile\?error=That connection waited too long/);
      expect(await am.connectedIdentities(subject('ann'), 'ann')).toEqual([]);
    });

    test('confirming needs the signed-in person: a signed-out request, or another account, is refused', async () => {
      const am = await started();
      const req = fakeReq();
      await outsideSignIn(am, req, verified);
      await expect(am.confirmPendingConnection(req, { username: 'anonymous', roles: [], isAuthenticated: false })).rejects.toThrow(/Permission denied/);
      await am.completeSignIn(req, passwordSignIn, { method: 'password' });
      await expect(am.confirmPendingConnection(req, subject('sam'))).rejects.toThrow(/Permission denied/);
      expect(await am.connectedIdentities(subject('ann'), 'ann')).toEqual([]);
      expect(await am.connectedIdentities(subject('sam'), 'sam')).toEqual([]);
    });

    test('connected to another account meanwhile: nothing is connected, and the person is told plainly', async () => {
      const am = await started();
      const req = fakeReq();
      await outsideSignIn(am, req, verified);
      await am.completeSignIn(req, passwordSignIn, { method: 'password' });
      expect(await am.connectIdentity(subject('sam'), 'sam', 'oidc:idp',
        await callback(am, () => am.startConnect(subject('sam'), 'sam', 'oidc:idp', { deviceState: BROWSER })))).toBe('connected');

      const next = await am.confirmPendingConnection(req, subject('ann'));
      expect(decodeURIComponent(next)).toBe('/profile?error=Your Example IdP account was not connected: it is already connected to another account here.');
      expect(await am.connectedIdentities(subject('ann'), 'ann')).toEqual([]);
    });

    test('cancelled, it is dropped and the next sign-in asks nothing', async () => {
      const am = await started();
      const req = fakeReq();
      await outsideSignIn(am, req, verified);
      am.dropPendingConnection(req);
      expect(am.pendingConnection(req)).toBeNull();
      expect(await am.completeSignIn(req, passwordSignIn, { method: 'password' })).toEqual({});
    });

    test('signing out drops it', async () => {
      const am = await started();
      const req = fakeReq();
      await outsideSignIn(am, req, verified);
      await am.completeSignIn(req, passwordSignIn, { method: 'password' });
      endSession({ getManager: () => null }, req.session, 'logout', {});
      expect(req.session.pendingConnection).toBeUndefined();
    });

    test('a new one replaces the old: one at a time', async () => {
      const am = await started();
      const req = fakeReq();
      await outsideSignIn(am, req, verified);
      await outsideSignIn(am, req, { sub: 'ann-456' });
      expect(req.session.pendingConnection).toEqual(expect.objectContaining({ subject: `${idp.issuer}#ann-456`, email: '' }));
      expect(am.pendingConnection(req)).toEqual({ displayName: 'Example IdP', email: '' });
    });

    test('no enumeration: the answer is the same whether or not an account has that email, and email is never looked up', async () => {
      const am = await started();
      const known = fakeReq();
      const unknown = fakeReq();
      const a = await outsideSignIn(am, known, { email: 'ann@example.com', email_verified: true });
      const b = await outsideSignIn(am, unknown, { sub: 'nobody-1', email: 'nobody@example.com', email_verified: true });
      expect(a).toEqual(b);
      expect(a).toEqual({ outcome: 'connect-first' });
      expect(Object.keys(known.session).sort()).toEqual(Object.keys(unknown.session).sort());
      expect(known.session.username).toBeUndefined();
      expect(emailLookups).toBe(0);
      expect(created).toEqual([]);
    });

    test.each([
      [false, true, true],
      [true, false, true],
      [true, true, false]
    ])('no account is created unless all three allow it (instance %s, provider %s, registration %s)', async (instance, own, registration) => {
      config['ngdpbase.auth.oidc.providers'] = { idp: provider({ 'auto-provision': own }) };
      config['ngdpbase.auth.oidc.auto-provision'] = instance;
      config['ngdpbase.application.registration'] = registration;
      const am = await started();
      const req = fakeReq();
      expect(await outsideSignIn(am, req, { email: 'new@idp.example', email_verified: true })).toEqual({ outcome: 'connect-first' });
      expect(created).toEqual([]);
      expect(req.session.pendingConnection).toBeDefined();
    });

    test('with all three on, an account is created like registration\'s, the identity connected, and the person signed in', async () => {
      config = { ...config, ...PROVISION, 'ngdpbase.auth.oidc.providers': { idp: provider({ 'auto-provision': true }) } };
      const am = await started();
      const req = fakeReq();
      expect(await outsideSignIn(am, req, { email: 'New.Person@IdP.example', email_verified: true })).toEqual({ outcome: 'created', next: '/wanted' });

      expect(created).toHaveLength(1);
      const [{ input, ctx }] = created;
      // No roles from the provider: createUser's default, which registration's is.
      expect(Object.keys(input).sort()).toEqual(['displayName', 'email', 'isActive', 'isExternal', 'password', 'username']);
      expect(input).toEqual(expect.objectContaining({ username: 'new-person', email: 'new.person@idp.example', displayName: 'new-person', isExternal: true, isActive: true }));
      expect(input.password).toBe(''); // no password: an outside account signs in only through its connected identity
      expect(ctx).toEqual(expect.objectContaining({ reason: 'provisioned by oidc:idp' }));

      expect(req.session.username).toBe('new-person');
      expect(req.session.isAuthenticated).toBe(true);
      expect(req.session.signIn).toEqual(expect.objectContaining({ provider: 'oidc:idp' }));
      expect(req.session.pendingConnection).toBeUndefined();
      expect(await am.connectedIdentities(subject('new-person'), 'new-person')).toEqual([expect.objectContaining({ email: 'new.person@idp.example' })]);

      // And it signs that account in from now on.
      const again = fakeReq();
      expect(await outsideSignIn(am, again, { email: 'new.person@idp.example', email_verified: true })).toEqual({ outcome: 'signed-in', next: '/wanted' });
      expect(created).toHaveLength(1);
    });

    test('an account created whose identity then cannot be connected is removed again, by the deletion path, and nobody signs in', async () => {
      config = { ...config, ...PROVISION, 'ngdpbase.auth.oidc.providers': { idp: provider({ 'auto-provision': true }) } };
      const am = await started();
      vi.spyOn(am as unknown as { attachIdentity: () => Promise<string> }, 'attachIdentity').mockResolvedValue('connected-elsewhere');
      const req = fakeReq();
      expect(await outsideSignIn(am, req, { email: 'new@idp.example', email_verified: true })).toEqual({ outcome: 'refused' });
      expect(created.map(c => c.input.username)).toEqual(['new']);
      expect(deleted).toEqual([{ username: 'new', ctx: expect.objectContaining({ reason: expect.stringMatching(/could not be connected/) }) }]);
      expect(req.session.username).toBeUndefined();
    });

    test('an email that already belongs to an account creates nothing: the email step, with the plain email-taken message', async () => {
      config = { ...config, ...PROVISION, 'ngdpbase.auth.oidc.providers': { idp: provider({ 'auto-provision': true }) } };
      const am = await started();
      const req = fakeReq();
      expect(await outsideSignIn(am, req, { email: 'ann@example.com', email_verified: true })).toEqual({
        outcome: 'connect-first',
        error: 'That email address is already used by another account. Please use another.'
      });
      expect(created).toEqual([]);
      expect(req.session.username).toBeUndefined();
      expect(am.pendingConnection(req)).toEqual({ displayName: 'Example IdP', email: 'ann@example.com' });
    });

    test('an unverified email creates nothing: the email step', async () => {
      config = { ...config, ...PROVISION, 'ngdpbase.auth.oidc.providers': { idp: provider({ 'auto-provision': true }) } };
      const am = await started();
      const req = fakeReq();
      expect(await outsideSignIn(am, req, { email: 'new@idp.example', email_verified: false })).toEqual({ outcome: 'connect-first' });
      expect(created).toEqual([]);
      expect(am.pendingConnection(req)).toEqual({ displayName: 'Example IdP', email: '' });
    });

    test('a replayed callback opens no second session', async () => {
      const am = await started();
      const creds = await callback(am, () => am.startFlow('oidc:idp', { deviceState: BROWSER }));
      const first = fakeReq();
      expect(await am.finishOutsideSignIn(first, 'oidc:idp', creds)).toEqual({ outcome: 'connect-first' });
      const second = fakeReq();
      expect(await am.finishOutsideSignIn(second, 'oidc:idp', creds)).toEqual({ outcome: 'refused' });
      expect(second.session.pendingConnection).toBeUndefined();
    });
  });
});
