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
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';
import { guardedFetch } from '../../http/guardedFetch.js';
import { fakeIssuer, flowFrom, type FakeIssuer } from '../../providers/__tests__/__fixtures__/fakeOidcIssuer';
import { endSession } from '../../utils/sessionEnd';
import { decodeProtectedHeader, exportPKCS8, generateKeyPair } from 'jose';
import { envRefName, mapConfigValue } from '../../utils/configPaths';

// #1889: getProperty resolves a $NAME anywhere in a value, as the real one does, so a
// provider map read through it would hold the secret itself, never the reference.
const resolved = (value: unknown): unknown => mapConfigValue(value, (node) => (envRefName(node) ? process.env[envRefName(node) as string] ?? '' : undefined));

/** A client-secret value written straight into config (not a $NAME reference), made up per run. */
const NOT_AN_ENV_REFERENCE = `literal-${crypto.randomUUID()}`;

const BROWSER = 'browser-a';
/** What the microsoft preset must fill: the consumers tenant's issuer, as its discovery document names it. */
const MICROSOFT_CONSUMERS_ISSUER = 'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0';
const SECRET_ENV = 'NGDPBASE_TEST_OIDC_CLIENT_SECRET';
const subject = (username: string) => ({ username, roles: ['reader'], isAuthenticated: true }) as never;

describe('AuthManager outside sign-in (#1743)', () => {
  let dir: string;
  let file: string;
  let idp: FakeIssuer;
  let config: Record<string, unknown>;
  let users: Record<string, { passwordSet?: boolean; allowedAuthMethods?: string[]; email?: string; isActive?: boolean }>;
  let created: Array<{ input: Record<string, unknown>; ctx: Record<string, unknown> }>;
  let emailLookups: number;
  let auditEvents: Array<Record<string, unknown>>;
  let deleted: Array<{ username: string; ctx: Record<string, unknown> }>;
  let authAudit: Array<{ ctx: Record<string, unknown>; result: string; reason: string }>;
  let stale: boolean;
  /** #1633: each role's required-aal, all set by the operator (so never lowered); none unless a test sets them. */
  let roleLevels: Record<string, number> | null;
  /** #1532: mail for the email-link second factor; null (no mail) unless a test turns it on. Console-like: nothing is sent. */
  let mailbox: Array<{ to: string; text: string }> | null;
  const saved = { key: process.env[CREDENTIALS_KEY_ENV], secret: process.env[SECRET_ENV] };

  const started = async (): Promise<AuthManager> => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => resolved(k in config ? config[k] : d),
        getUnresolvedProperty: (k: string, d: unknown) => (k in config ? config[k] : d),
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? file : d),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://wiki.example.com',
        getApplicationName: () => 'Example Site'
      },
      PolicyDecisionPoint: {
        permits: (_s: unknown, action: string) => Promise.resolve(!stale && action === 'account-security'),
        holds: (_s: unknown, action: string) => Promise.resolve(action === 'account-security')
      },
      UserManager: {
        // undefined for nobody, as UserManager answers (deriveUsername relies on it).
        getUser: (u: string) => Promise.resolve(users[u] ? { username: u, ...users[u] } : undefined),
        hasPassword: (u: string) => Promise.resolve(Boolean(users[u]?.passwordSet)),
        getUserByEmail: () => { emailLookups++; return Promise.resolve(undefined); },
        // #2073: every account on an address, as UserManager answers; two may share one.
        getUsersByEmail: (email: string) => {
          return Promise.resolve(Object.entries(users).filter(([, u]) => u.email?.toLowerCase() === email.toLowerCase()).map(([username, u]) => ({ username, ...u })));
        },
        // The account-creation door; since #2073 it takes an email another account has.
        createUser: async (input: Record<string, unknown>, ctx: Record<string, unknown>) => {
          await Promise.resolve();
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
      ...(mailbox ? { EmailManager: { send: (m: { to: string; text: string }) => { mailbox.push(m); return Promise.resolve(); }, getProviderName: () => 'test' } } : {}),
      ...(roleLevels ? { RoleManager: { roleRequiredAal: () => roleLevels, operatorRequiredAal: () => roleLevels } } : {}),
      PluginManager: TEST_PLUGIN_MANAGER,
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
    roleLevels = null;
    mailbox = null;
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
      expect(am.outsideProviders()).toEqual([{ id: 'oidc:idp', name: 'idp', displayName: 'Example IdP', icon: { kind: 'fa', className: 'fas fa-right-to-bracket' } }]);
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
      ['a preset that does not exist', { issuer: undefined, preset: 'nonesuch' }],
      ['no client id', { 'client-id': '' }],
      ['enabled not set', { enabled: undefined }]
    ])('is not registered with %s', async (_what, overrides) => {
      config['ngdpbase.auth.oidc.providers'] = { idp: provider(overrides) };
      expect((await started()).outsideProviders()).toEqual([]);
    });

    test('the google preset fills the issuer and the name', async () => {
      config['ngdpbase.auth.oidc.providers'] = { google: { preset: 'google', 'client-id': 'g', 'client-secret': `$${SECRET_ENV}`, enabled: true } };
      const am = await started();
      expect(am.outsideProviders()).toEqual([{ id: 'oidc:google', name: 'google', displayName: 'Google', icon: { kind: 'builtin', id: 'google' } }]);
    });

    test('the microsoft preset fills the personal-accounts issuer and the name', async () => {
      idp = await fakeIssuer(MICROSOFT_CONSUMERS_ISSUER);
      vi.mocked(guardedFetch).mockImplementation((url, options) => idp.respond(url, options));
      config['ngdpbase.auth.oidc.providers'] = { microsoft: { preset: 'microsoft', 'client-id': idp.clientId, 'client-secret': `$${SECRET_ENV}`, enabled: true } };
      const am = await started();
      expect(am.outsideProviders()).toEqual([{ id: 'oidc:microsoft', name: 'microsoft', displayName: 'Microsoft', icon: { kind: 'fa', className: 'fab fa-microsoft' } }]);
      // Discovery is read at <issuer>/.well-known/openid-configuration, and its issuer matches the preset's.
      expect(new URL(await am.startFlow('oidc:microsoft', { deviceState: BROWSER })).href.startsWith(`${MICROSOFT_CONSUMERS_ISSUER}/authorize?`)).toBe(true);
      expect(vi.mocked(guardedFetch)).toHaveBeenCalledWith(`${MICROSOFT_CONSUMERS_ISSUER}/.well-known/openid-configuration`, expect.anything());
    });

    describe('the apple preset (slice 4b)', () => {
      const APPLE = 'https://appleid.apple.com';
      const KEY_ENV = 'NGDPBASE_TEST_APPLE_KEY';
      /** The authorization code the fake issuer is handed back; any value redeems. */
      const AUTH_CODE = 'code-1';
      const apple = (overrides: Record<string, unknown> = {}) => ({
        preset: 'apple', 'client-id': idp.clientId, 'team-id': 'TEAM123456', 'key-id': 'KEY1234567', 'private-key': `$${KEY_ENV}`, enabled: true, ...overrides
      });
      const pkcs8 = async (alg: 'ES256' | 'RS256') => exportPKCS8((await generateKeyPair(alg, { extractable: true })).privateKey);

      beforeEach(async () => {
        idp = await fakeIssuer(APPLE);
        idp.discovery = { ...idp.discovery, token_endpoint_auth_methods_supported: ['client_secret_post'] };
        vi.mocked(guardedFetch).mockImplementation((url, options) => idp.respond(url, options));
        process.env[KEY_ENV] = await pkcs8('ES256');
      });
      afterEach(() => { delete process.env[KEY_ENV]; });

      test('fills Apple\'s issuer and name, needs no client-secret, POSTs its callback and signs its client secret', async () => {
        config['ngdpbase.auth.oidc.providers'] = { apple: apple(), idp: provider() };
        const am = await started();
        expect(am.outsideProviders()).toContainEqual({ id: 'oidc:apple', name: 'apple', displayName: 'Apple', icon: { kind: 'fa', className: 'fab fa-apple' } });
        expect(am.callbackIsPosted('oidc:apple')).toBe(true);
        expect(am.callbackIsPosted('oidc:idp')).toBe(false);
        expect(am.callbackIsPosted('oidc:nonesuch')).toBe(false);
        const flow = flowFrom(await am.startFlow('oidc:apple', { deviceState: BROWSER }));
        expect(flow.params.get('response_mode')).toBe('form_post');
        expect(flow.params.get('redirect_uri')).toMatch(/^https:\/\/[^/]+\/auth\/oauth\/apple\/callback$/);
        idp.idToken = await idp.sign({ sub: 'ann-123', nonce: flow.nonce });
        await am.authenticate('oidc:apple', { token: AUTH_CODE, state: flow.state, deviceState: BROWSER });
        expect(decodeProtectedHeader(idp.tokenRequests[0].form.get('client_secret') ?? '')).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
      });

      test('a key written on one line with \\n escapes is accepted', async () => {
        process.env[KEY_ENV] = (await pkcs8('ES256')).replace(/\n/g, '\\n');
        config['ngdpbase.auth.oidc.providers'] = { apple: apple() };
        expect((await started()).outsideProviders().map(p => p.id)).toEqual(['oidc:apple']);
      });

      test.each([
        ['a literal private key', { 'private-key': NOT_AN_ENV_REFERENCE }],
        ['a private key whose variable is not set', { 'private-key': '$NGDPBASE_TEST_UNSET_VARIABLE' }],
        ['no team id', { 'team-id': '' }],
        ['no key id', { 'key-id': undefined }]
      ])('is not registered with %s', async (_what, overrides) => {
        config['ngdpbase.auth.oidc.providers'] = { apple: apple(overrides) };
        expect((await started()).outsideProviders()).toEqual([]);
      });

      test('is not registered with a key Apple does not sign with (RSA)', async () => {
        process.env[KEY_ENV] = await pkcs8('RS256');
        config['ngdpbase.auth.oidc.providers'] = { apple: apple() };
        expect((await started()).outsideProviders()).toEqual([]);
      });
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
      expect(am.outsideProviders()).toEqual([{ id: 'oidc:google', name: 'google', displayName: 'Google', icon: { kind: 'builtin', id: 'google' } }]);
      expect(am.getFactors().map(f => f.provider)).toEqual(['password', 'oidc:google']);

      config['ngdpbase.auth.oidc.providers'] = { google: { preset: 'google', 'client-id': 'g2', 'client-secret': `$${SECRET_ENV}`, enabled: true, 'display-name': 'Google (new)' } };
      expect((await started()).outsideProviders()).toEqual([{ id: 'oidc:google', name: 'google', displayName: 'Google (new)', icon: { kind: 'builtin', id: 'google' } }]);
    });

    test('an entry\'s icon reaches what views are given, resolved (#1781)', async () => {
      config['ngdpbase.auth.oidc.providers'] = {
        idp: provider({ icon: 'https://idp.example.com/favicon.ico' }),
        other: provider({ icon: 'fa-users' }),
        bad: provider({ icon: 'javascript:alert(1)' })
      };
      const am = await started();
      expect(am.outsideProviders().map(p => [p.name, p.icon])).toEqual([
        ['idp', { kind: 'image', src: 'https://idp.example.com/favicon.ico' }],
        ['other', { kind: 'fa', className: 'fas fa-users' }],
        ['bad', { kind: 'fa', className: 'fas fa-right-to-bracket' }]
      ]);
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
      expect(identity).toEqual(expect.objectContaining({ label: 'Example IdP', email: 'ann@example.com', provider: { id: 'oidc:idp', name: 'idp', displayName: 'Example IdP', icon: { kind: 'fa', className: 'fas fa-right-to-bracket' } } }));
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

    test('no enumeration: the answer is the same whether or not one account has that email; an email never signs anyone in', async () => {
      const am = await started();
      const known = fakeReq();
      const unknown = fakeReq();
      const a = await outsideSignIn(am, known, { email: 'ann@example.com', email_verified: true });
      const b = await outsideSignIn(am, unknown, { sub: 'nobody-1', email: 'nobody@example.com', email_verified: true });
      expect(a).toEqual(b);
      expect(a).toEqual({ outcome: 'connect-first' });
      expect(Object.keys(known.session).sort()).toEqual(Object.keys(unknown.session).sort());
      expect(known.session.username).toBeUndefined();
      // #2073: the email is looked up only to tell a shared one apart (getUsersByEmail), never to pick an account.
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
      // The header's Register button asks the same rule.
      expect(am.outsideSignUpOpen()).toBe(false);
    });

    test('sign-up is open when an enabled provider may create accounts, by the same rule', async () => {
      config = { ...config, ...PROVISION, 'ngdpbase.auth.oidc.providers': { idp: provider({ 'auto-provision': true }) } };
      expect((await started()).outsideSignUpOpen()).toBe(true);

      // A provider that is not enabled is not registered, so its auto-provision opens nothing.
      config['ngdpbase.auth.oidc.providers'] = { idp: provider({ 'auto-provision': true, enabled: false }) };
      expect((await started()).outsideSignUpOpen()).toBe(false);

      // Read when asked: turning registration off closes it at once.
      config['ngdpbase.auth.oidc.providers'] = { idp: provider({ 'auto-provision': true }) };
      const am = await started();
      config['ngdpbase.application.registration'] = false;
      expect(am.outsideSignUpOpen()).toBe(false);
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

    test('an email that already belongs to an account creates nothing: the email step, saying to sign in to that account first', async () => {
      config = { ...config, ...PROVISION, 'ngdpbase.auth.oidc.providers': { idp: provider({ 'auto-provision': true }) } };
      const am = await started();
      const req = fakeReq();
      expect(await outsideSignIn(am, req, { email: 'ann@example.com', email_verified: true })).toEqual({
        outcome: 'connect-first',
        error: 'An account here already uses that email. Sign in to it another way, then connect this sign-in.'
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

    /*
     * #2073. Sabotaged once each (2026-10-25), and watched go red: a shared email
     * held for the email step instead of asking; the one-account email step
     * dropped (an account was created beside it); the offered-accounts check,
     * the still-holds-the-email check and the provider-allowed check each removed.
     */
    describe('an email several accounts share (#2073)', () => {
      const shared = { email: 'Couple@Example.com', email_verified: true };
      beforeEach(() => {
        users = { ann: { passwordSet: true, email: 'couple@example.com' }, bob: { passwordSet: true, email: 'couple@example.com' }, cal: { email: 'couple@example.com', isActive: false }, sam: {} };
      });

      test('asks which account, every time; the choice signs that account in, connects nothing and is not remembered', async () => {
        config = { ...config, ...PROVISION, 'ngdpbase.auth.oidc.providers': { idp: provider({ 'auto-provision': true }) } };
        const am = await started();
        for (const chosen of ['bob', 'ann']) {
          const req = fakeReq();
          expect(await outsideSignIn(am, req, shared)).toEqual({ outcome: 'choose-account' });
          expect(req.session.pendingConnection).toBeUndefined();
          expect(req.session.username).toBeUndefined();
          // A turned-off account is not offered.
          expect(am.outsideChoice(req)).toEqual({ displayName: 'Example IdP', choices: ['ann', 'bob'] });
          expect(await am.finishOutsideChoice(req, chosen)).toEqual({ outcome: 'signed-in', next: '/wanted' });
          expect(req.session.username).toBe(chosen);
          expect(req.session.outsideChoice).toBeUndefined();
        }
        expect(created).toEqual([]);
        expect(await am.connectedIdentities(subject('ann'), 'ann')).toEqual([]);
        expect(await am.connectedIdentities(subject('bob'), 'bob')).toEqual([]);
      });

      test('an account not offered, an expired choice or a used one is refused, and nobody signs in', async () => {
        const am = await started();
        const req = fakeReq();
        expect(await outsideSignIn(am, req, shared)).toEqual({ outcome: 'choose-account' });
        expect(await am.finishOutsideChoice(req, 'sam')).toEqual({ outcome: 'refused' });
        expect(req.session.username).toBeUndefined();

        // An account that took the address after the choice was offered was not offered: refused.
        const joined = fakeReq();
        await outsideSignIn(am, joined, shared);
        users.dan = { email: 'couple@example.com' };
        expect(await am.finishOutsideChoice(joined, 'dan')).toEqual({ outcome: 'refused' });
        expect(joined.session.username).toBeUndefined();
        delete users.dan;
        expect(await am.finishOutsideChoice(req, 'ann')).toEqual({ outcome: 'refused' }); // used: the refusal spent it

        const late = fakeReq();
        await outsideSignIn(am, late, shared);
        (late.session.outsideChoice as { expiresAt: number }).expiresAt = Date.now() - 1;
        expect(am.outsideChoice(late)).toBeNull();
        expect(await am.finishOutsideChoice(late, 'ann')).toEqual({ outcome: 'refused' });

        // An account that left the address meanwhile is refused too.
        const moved = fakeReq();
        await outsideSignIn(am, moved, shared);
        users.bob.email = 'bob@example.com';
        expect(await am.finishOutsideChoice(moved, 'bob')).toEqual({ outcome: 'refused' });
        expect(moved.session.username).toBeUndefined();
      });

      test('an account that may not use the provider is refused', async () => {
        users.bob.allowedAuthMethods = ['password'];
        const am = await started();
        const req = fakeReq();
        await outsideSignIn(am, req, shared);
        expect(await am.finishOutsideChoice(req, 'bob')).toEqual({ outcome: 'refused' });
        expect(req.session.username).toBeUndefined();
      });

      test('an identity already connected to one account still goes straight in, without asking', async () => {
        const am = await started();
        expect(await am.connectIdentity(subject('ann'), 'ann', 'oidc:idp',
          await callback(am, () => am.startConnect(subject('ann'), 'ann', 'oidc:idp', { deviceState: BROWSER }), shared))).toBe('connected');
        const req = fakeReq();
        expect(await outsideSignIn(am, req, shared)).toEqual({ outcome: 'signed-in', next: '/wanted' });
        expect(req.session.username).toBe('ann');
        expect(req.session.outsideChoice).toBeUndefined();
      });
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

  describe('an outside provider\'s own second factor (#1633)', () => {
    const MFA = { amr: ['pwd', 'mfa'] };
    /** A step-up permission, a 5-minute window, and an admin role at AAL2. */
    const stepUp = () => {
      config['ngdpbase.auth.step-up'] = { 'max-age-minutes': 5 };
      config['ngdpbase.permissions.definitions'] = { 'account-security': { 'step-up': true } };
      roleLevels = { admin: 2, reader: 1 };
    };
    const trust = (on: boolean | undefined) => {
      config['ngdpbase.auth.oidc.providers'] = { idp: provider(on === undefined ? {} : { 'trust-mfa': on }) };
    };
    /** Connect ann's identity, then sign in with it, the issuer reporting `claims`. */
    const signInWith = async (claims: Record<string, unknown>) => {
      const am = await started();
      expect(await am.connectIdentity(subject('ann'), 'ann', 'oidc:idp',
        await callback(am, () => am.startConnect(subject('ann'), 'ann', 'oidc:idp', { deviceState: BROWSER })))).toBe('connected');
      const req = fakeReq();
      const done = await am.finishOutsideSignIn(req, 'oidc:idp', await callback(am, () => am.startFlow('oidc:idp', { deviceState: BROWSER }), claims));
      expect(done.outcome).toBe('signed-in');
      return { am, signIn: req.session.signIn as import('../AuthManager').SignInRecord };
    };

    test('trusted and reporting mfa: AAL2, so a role at AAL2 is kept and step-up is satisfied within the window', async () => {
      stepUp();
      trust(true);
      const { am, signIn } = await signInWith(MFA);
      expect(signIn.aal).toBe(2);
      expect(signIn.factors).toEqual([expect.objectContaining({ provider: 'oidc:idp', amr: ['pwd', 'mfa'], aal: 2 })]);
      expect(am.rolesAtSignIn(['admin', 'reader'], signIn.aal)).toEqual({ kept: ['admin', 'reader'], steppedDown: [] });
      expect(am.stepUpNeeded('account-security', signIn, ['admin'], false)).toBe(false);
      // Outside the window the same sign-in no longer counts.
      expect(am.stepUpNeeded('account-security', signIn, ['admin'], false, Date.now() + 6 * 60_000)).toBe(true);
    });

    test.each([
      ['off (unset)', undefined],
      ['off (false)', false]
    ])('untrusted (%s) and reporting mfa: AAL1, the role steps down and step-up asks', async (_what, on) => {
      stepUp();
      trust(on);
      const { am, signIn } = await signInWith(MFA);
      expect(signIn.aal).toBe(1);
      expect(signIn.factors).toEqual([expect.objectContaining({ amr: [], aal: 1 })]);
      expect(am.rolesAtSignIn(['admin', 'reader'], signIn.aal)).toEqual({ kept: ['reader'], steppedDown: ['admin'] });
      expect(am.stepUpNeeded('account-security', signIn, ['admin'], false)).toBe(true);
    });

    test('trusted and reporting a hardware key with a PIN: AAL3 and phishing-resistant, so a role at AAL3 is kept', async () => {
      trust(true);
      roleLevels = { admin: 3, reader: 1 };
      const { am, signIn } = await signInWith({ amr: ['hwk', 'pin'] });
      expect(signIn.aal).toBe(3);
      expect(signIn.acr).toBe('phrh');
      expect(signIn.factors).toEqual([expect.objectContaining({ provider: 'oidc:idp', amr: ['hwk', 'pin'], aal: 3, acr: 'phrh' })]);
      expect(am.rolesAtSignIn(['admin', 'reader'], signIn.aal)).toEqual({ kept: ['admin', 'reader'], steppedDown: [] });
    });

    test('trusted and reporting the AAL3 acr: AAL3, not phishing-resistant', async () => {
      trust(true);
      const { signIn } = await signInWith({ amr: ['pwd'], acr: 'http://idmanagement.gov/ns/assurance/aal/3' });
      expect(signIn.aal).toBe(3);
      expect(signIn.acr).toBe('aal3');
    });

    test('untrusted and reporting a hardware key with a PIN: AAL1', async () => {
      trust(false);
      const { signIn } = await signInWith({ amr: ['hwk', 'pin'] });
      expect(signIn.aal).toBe(1);
      expect(signIn.acr).toBe('aal1');
    });

    test('trusted, a password alone is AAL1', async () => {
      trust(true);
      const { signIn } = await signInWith({ amr: ['pwd'] });
      expect(signIn.aal).toBe(1);
      expect(signIn.factors).toEqual([expect.objectContaining({ amr: ['pwd'], aal: 1 })]);
    });

    test('trusted, nothing reported is AAL1', async () => {
      trust(true);
      expect((await signInWith({})).signIn.aal).toBe(1);
    });

    test('a crafted amr that is not an array is ignored', async () => {
      trust(true);
      const { signIn } = await signInWith({ amr: 'mfa' });
      expect(signIn.aal).toBe(1);
      expect(signIn.factors).toEqual([expect.objectContaining({ amr: [], aal: 1 })]);
      expect(authAudit.at(-1)?.ctx.reported).toEqual({ amr: [], trusted: true });
    });

    test('the audit record of the sign-in carries what was reported, trusted or not; never a token', async () => {
      trust(false);
      await signInWith({ amr: ['pwd', 'mfa', 42], acr: 'urn:example:loa:2' });
      const success = authAudit.filter(a => a.result === 'success').at(-1);
      expect(success?.reason).toBe('signed in: oidc:idp');
      expect(success?.ctx.reported).toEqual({ amr: ['pwd', 'mfa'], acr: 'urn:example:loa:2', trusted: false });
      expect(JSON.stringify(authAudit)).not.toMatch(/eyJ/);
    });

    describe('the mapping (outsideLevel)', () => {
      const level = async (amr: unknown[], acr?: string, trusted = true) =>
        (await started()).outsideLevel({ amr: amr as string[], ...(acr ? { acr } : {}), trusted });

      test.each([
        [['hwk', 'pin'], 3, 'phrh'],
        [['hwk', 'fpt'], 3, 'phrh'],
        [['hwk', 'face'], 3, 'phrh'],
        [['hwk', 'user'], 3, 'phrh'],
        [['hwk', 'mfa'], 3, 'phrh'],
        [['pwd', 'hwk'], 3, 'phrh'],
        [['mfa'], 2, undefined],
        [['pwd', 'otp'], 2, undefined],
        [['swk', 'pin'], 2, undefined],
        [['swk', 'user'], 1, undefined],
        [['pwd', 'sms'], 2, undefined],
        [['hwk'], 1, undefined],
        [['hwk', 'otp'], 1, undefined],
        [['pwd'], 1, undefined],
        [['otp'], 1, undefined],
        [['pwd', 'kba'], 1, undefined],
        [['pwd', 'email'], 1, undefined],
        [['pwd', 'push'], 1, undefined],
        [[], 1, undefined]
      ])('amr %j is AAL%i, phishing resistance %s', async (amr, aal, acr) => {
        const got = await level(amr);
        expect(got.aal).toBe(aal);
        expect(got.acr).toBe(acr);
      });

      test('only RFC 8176 values are kept as the factor\'s amr', async () => {
        expect((await level(['pwd', 'email', 'push', 'magic', 'mfa'])).amr).toEqual(['pwd', 'mfa']);
      });

      test.each([
        ['http://idmanagement.gov/ns/assurance/aal/2', 2],
        ['http://idmanagement.gov/ns/assurance/aal/3', 3],
        ['http://idmanagement.gov/ns/assurance/aal/1', 1],
        ['phr', 1],
        ['urn:example:aal2', 1]
      ])('acr %s is AAL%i, as reported, and never phishing resistance', async (acr, aal) => {
        const got = await level(['pwd'], acr);
        expect(got.aal).toBe(aal);
        expect(got.acr).toBeUndefined();
      });

      test('a lower acr never lowers what the amr shows', async () => {
        expect(await level(['hwk', 'pin'], 'http://idmanagement.gov/ns/assurance/aal/2')).toEqual({ amr: ['hwk', 'pin'], aal: 3, acr: 'phrh' });
      });

      test.each([
        [['pwd', 'mfa'], 'http://idmanagement.gov/ns/assurance/aal/3'],
        [['hwk', 'pin'], undefined]
      ])('untrusted, nothing counts: amr %j, acr %s', async (amr, acr) => {
        expect(await level(amr, acr, false)).toEqual({ amr: [], aal: 1 });
      });
    });

    test('trust leaves what is offered, and what an account can reach, at AAL1', async () => {
      trust(true);
      const am = await started();
      expect(am.getFactors()).toContainEqual({ provider: 'oidc:idp', primary: true, amr: [], aal: 1 });
      config['ngdpbase.auth.factors'] = [{ authproviderid: 'oidc:idp' }];
      expect((await started()).reachableAal()).toBe(1);
    });

    test('an account created by an outside sign-in also gets the trusted level', async () => {
      trust(true);
      config['ngdpbase.auth.oidc.providers'] = { idp: provider({ 'trust-mfa': true, 'auto-provision': true }) };
      Object.assign(config, { 'ngdpbase.auth.oidc.auto-provision': true, 'ngdpbase.application.registration': true });
      const am = await started();
      const req = fakeReq();
      const done = await am.finishOutsideSignIn(req, 'oidc:idp', await callback(am, () => am.startFlow('oidc:idp', { deviceState: BROWSER }), { ...MFA, email: 'new@idp.example', email_verified: true }));
      expect(done.outcome).toBe('created');
      expect((req.session.signIn as { aal: number }).aal).toBe(2);
      expect(authAudit.filter(a => a.result === 'success').at(-1)?.ctx.reported).toEqual({ amr: ['pwd', 'mfa'], trusted: true });
    });
  });
  describe('#1532: an outside sign-in at AAL1 takes the second step, as a password does', () => {
    /** Ann's identity connected and her email enrolled as a second factor, the real way (the link from the mailbox). */
    const enrolledAnn = async (): Promise<AuthManager> => {
      mailbox = [];
      const am = await started();
      expect(await am.connectIdentity(subject('ann'), 'ann', 'oidc:idp',
        await callback(am, () => am.startConnect(subject('ann'), 'ann', 'oidc:idp', { deviceState: BROWSER })))).toBe('connected');
      expect(await am.startEmailFactorEnrolment(subject('ann'), 'ann')).toBe('sent');
      const token = /confirm\?t=([\w-]+)/.exec(mailbox.at(-1).text)[1];
      expect(await am.confirmEmailFactorEnrolment(subject('ann'), token)).toBe(true);
      return am;
    };

    test('untrusted (AAL1): no session, a pending sign-in for this browser, which completes with both factors after approval', async () => {
      const am = await enrolledAnn();
      const req = fakeReq();
      const done = await am.finishOutsideSignIn(req, 'oidc:idp', await callback(am, () => am.startFlow('oidc:idp', { deviceState: BROWSER }), { amr: ['pwd', 'mfa'] }));
      expect(done).toEqual({ outcome: 'second-step', handle: expect.any(String), binding: expect.any(String), next: '/' });
      if (done.outcome !== 'second-step') return;
      // Sabotage check: dropping the needsSecondStep branch in finishOutsideSignIn signs ann in here and turns this red.
      expect(req.session.username).toBeUndefined();
      expect(req.session.signIn).toBeUndefined();
      const pending = am.pendingSignIn(done.handle, done.binding);
      expect(pending).toMatchObject({ username: 'ann', requestIp: '203.0.113.9' });

      expect(await am.sendEmailApproval(done.handle, done.binding)).toBe('sent');
      expect(mailbox.at(-1).text).toMatch(/ from IP address 203\.0\.113\.9\.$/m);
      const link = /approve\?t=([\w-]+)/.exec(mailbox.at(-1).text)[1];
      expect(await am.approveByToken(link)).toBe('ann');
      const finished = am.completeTwoStep(done.handle, done.binding)!;
      expect(finished.result.factors?.map((f) => f.provider)).toEqual(['oidc:idp', 'email-link']);
      expect(auditEvents.map((e) => e.eventType)).toEqual(expect.arrayContaining(['signinapproval-request', 'signinapproval-approve']));
    });

    test('trusted and reporting mfa (AAL2): signed in at once, no second step', async () => {
      config['ngdpbase.auth.oidc.providers'] = { idp: provider({ 'trust-mfa': true }) };
      const am = await enrolledAnn();
      const req = fakeReq();
      const done = await am.finishOutsideSignIn(req, 'oidc:idp', await callback(am, () => am.startFlow('oidc:idp', { deviceState: BROWSER }), { amr: ['pwd', 'mfa'] }));
      expect(done.outcome).toBe('signed-in');
      expect(req.session.username).toBe('ann');
      expect((req.session.signIn as { aal: number }).aal).toBe(2);
    });

    test('no second factor enrolled: signed in at once, as before', async () => {
      mailbox = [];
      const am = await started();
      expect(await am.connectIdentity(subject('ann'), 'ann', 'oidc:idp',
        await callback(am, () => am.startConnect(subject('ann'), 'ann', 'oidc:idp', { deviceState: BROWSER })))).toBe('connected');
      const req = fakeReq();
      const done = await am.finishOutsideSignIn(req, 'oidc:idp', await callback(am, () => am.startFlow('oidc:idp', { deviceState: BROWSER })));
      expect(done.outcome).toBe('signed-in');
      expect(req.session.username).toBe('ann');
    });
  });
});
