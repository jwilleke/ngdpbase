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
  let users: Record<string, { passwordSet?: boolean; allowedAuthMethods?: string[] }>;
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
        getUser: (u: string) => Promise.resolve(users[u] ? { ...users[u] } : null),
        hasPassword: (u: string) => Promise.resolve(Boolean(users[u]?.passwordSet))
      },
      AuditManager: {
        logAuditEvent: () => Promise.resolve('evt'),
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
    users = { ann: { passwordSet: true }, sam: {} };
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
});
