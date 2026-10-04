/**
 * #1570 / #1574 — OidcManager: off means not loaded; on needs an explicit
 * base-url; derived keys are refused; keys are generated into the instance
 * .env; discovery is served under /oidc behind Express's prefix-stripping
 * mount, the way app.ts mounts it. A temp instance directory per test; the
 * temp directory is all that is removed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import OidcManager, { OIDC_COOKIE_KEYS_ENV, OIDC_JWKS_ENV, OIDC_MOUNT, aalOfAcr, apiResourceFor, delegablePermissions, issuerFor, operatorOidcConfig } from '../OidcManager';

const ENV_NAMES = [OIDC_JWKS_ENV, OIDC_COOKIE_KEYS_ENV];

describe('OidcManager (#1570)', () => {
  let dir: string;
  let custom: Record<string, unknown>;
  let baseUrl: string;
  let explicit: boolean;
  let users: Record<string, { username: string; displayName: string; email?: string; isActive: boolean; roles?: string[]; passwordChangedAt?: string }>;
  const saved: Record<string, string | undefined> = {};

  const started = async (): Promise<OidcManager> => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in custom ? custom[k] : d),
        getCustomProperties: () => custom,
        isBaseUrlExplicit: () => explicit,
        getBaseURL: () => baseUrl,
        getInstanceDataFolder: () => dir
      },
      UserManager: { getUser: (u: string) => Promise.resolve(users[u]) }
    };
    const manager = new OidcManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  const served = (handler: NonNullable<ReturnType<OidcManager['start']>>) => {
    const app = express();
    app.use(OIDC_MOUNT, (req, res) => void handler(req, res));
    return app;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1570-'));
    custom = { 'oidc-auth-server.enabled': true };
    baseUrl = 'https://wiki.example.com';
    explicit = true;
    users = {
      molly: { username: 'molly', displayName: 'Molly Example', email: 'molly@example.com', isActive: true, roles: ['admin'] },
      gone: { username: 'gone', displayName: 'Gone', isActive: false }
    };
    for (const name of ENV_NAMES) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of ENV_NAMES) {
      if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    }
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('off: reports disabled, writes nothing, mounts nothing', async () => {
    custom = {};
    const manager = await started();
    expect(manager.getManagerStatus().state).toBe('disabled');
    expect(manager.getIssuer()).toBe('');
    expect(manager.start({ trustProxy: false })).toBeNull();
    expect(fs.existsSync(path.join(dir, '.env'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'oidc'))).toBe(false);
  });

  test('on without an explicit base-url: degraded, naming the key, nothing mounted', async () => {
    explicit = false;
    const manager = await started();
    const status = manager.getManagerStatus();
    expect(status.state).toBe('degraded');
    expect(status.configKey).toBe('ngdpbase.application.base-url');
    expect(manager.getIssuer()).toBe('');
    expect(manager.start({ trustProxy: false })).toBeNull();
  });

  test('a derived key set by hand is refused, as one decision (#1574)', async () => {
    custom['oidc-auth-server.trust-proxy'] = true;
    const manager = await started();
    expect(manager.getManagerStatus().state).toBe('degraded');
    expect(manager.getManagerStatus().reason).toMatch(/oidc-auth-server\.trust-proxy is set by ngdpbase/);
  });

  test('an unknown package key is refused by the package loader', async () => {
    custom['oidc-auth-server.no-such-setting'] = 1;
    const manager = await started();
    expect(manager.getManagerStatus().state).toBe('degraded');
    expect(manager.getManagerStatus().reason).toMatch(/no-such-setting is not a known setting/);
  });

  test('a secret written into the config file is refused (environment-only)', async () => {
    custom['oidc-auth-server.cookie-keys'] = 'a-cookie-key-that-must-not-live-in-a-file';
    const manager = await started();
    expect(manager.getManagerStatus().state).toBe('degraded');
    expect(manager.getManagerStatus().reason).toMatch(/owned by the environment/);
  });

  test('on: generates both keys into the instance .env once, owner-only, and reuses them', async () => {
    await started();
    const envFile = path.join(dir, '.env');
    const content = fs.readFileSync(envFile, 'utf8');
    expect(fs.statSync(envFile).mode & 0o777).toBe(0o600);
    expect(content).toMatch(new RegExp(`^${OIDC_JWKS_ENV}=\\{"keys":\\[`, 'm'));
    expect(content).toMatch(new RegExp(`^${OIDC_COOKIE_KEYS_ENV}=\\S{43}$`, 'm'));
    const jwks = JSON.parse(process.env[OIDC_JWKS_ENV]) as { keys: Array<{ d?: string; kid?: string }> };
    expect(jwks.keys[0].d).toBeTruthy();

    for (const name of ENV_NAMES) delete process.env[name];
    await started();
    expect(fs.readFileSync(envFile, 'utf8')).toBe(content);
  });

  test('serves discovery for <base-url>/oidc behind an Express mount', async () => {
    const manager = await started();
    expect(manager.getIssuer()).toBe('https://wiki.example.com/oidc');
    const handler = manager.start({ trustProxy: true });
    expect(handler).not.toBeNull();
    expect(manager.getManagerStatus().state).toBe('ready');

    const res = await request(served(handler))
      .get('/oidc/.well-known/openid-configuration')
      .set('Host', 'wiki.example.com')
      .set('X-Forwarded-Proto', 'https');
    expect(res.status).toBe(200);
    expect(res.body.issuer).toBe('https://wiki.example.com/oidc');
    expect(res.body.authorization_endpoint).toBe('https://wiki.example.com/oidc/auth');
    expect(res.body.acr_values_supported).toEqual(expect.arrayContaining(['aal1', 'aal2', 'phr']));
  });

  // The package pins the issuer's host (oidc-auth-server 0.3.1): a forged Host must not reach
  // discovery, or a shared cache could hand clients someone else's endpoints.
  test('a forged Host does not change what discovery advertises', async () => {
    const manager = await started();
    const res = await request(served(manager.start({ trustProxy: true })))
      .get('/oidc/.well-known/openid-configuration')
      .set('Host', 'evil.example')
      .set('X-Forwarded-Proto', 'https');
    expect(res.body.authorization_endpoint).toBe('https://wiki.example.com/oidc/auth');
  });

  test('without trust proxy, an https issuer refuses protocol requests over plain HTTP', async () => {
    const manager = await started();
    const res = await request(served(manager.start({ trustProxy: false }))).get('/oidc/auth?client_id=x');
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/trust-proxy/);
  });

  test('http is allowed on localhost only', async () => {
    baseUrl = 'http://localhost:3000';
    expect((await started()).start({ trustProxy: false })).not.toBeNull();

    baseUrl = 'http://wiki.example.com';
    const remote = await started();
    expect(remote.getManagerStatus().state).toBe('degraded');
    expect(remote.getManagerStatus().reason).toMatch(/https/);
  });

  test('findAccount: claims without roles; a disabled or missing account fails closed', async () => {
    const manager = await started();
    const claims = await manager.findAccount('molly');
    expect(claims).toEqual({ preferred_username: 'molly', name: 'Molly Example', email: 'molly@example.com' });
    expect(claims).not.toHaveProperty('roles');
    expect(await manager.findAccount('gone')).toBeUndefined();
    expect(await manager.findAccount('nobody')).toBeUndefined();
  });

  test('findAccount refuses a sign-in older than the last password change (#1592)', async () => {
    const manager = await started();
    users.molly.passwordChangedAt = new Date(2_000_000 * 1000).toISOString();
    expect(await manager.findAccount('molly', { acr: 'aal2', amr: ['hwk'], authTime: 1_999_999 })).toBeUndefined();
    expect(await manager.findAccount('molly', { acr: 'aal2', amr: ['hwk'] })).toBeUndefined();
    expect(await manager.findAccount('molly', { acr: 'aal2', amr: ['hwk'], authTime: 2_000_001 })).toMatchObject({ preferred_username: 'molly' });
    // No sign-in on the request: the sign-in itself, not a token from before.
    expect(await manager.findAccount('molly')).toMatchObject({ preferred_username: 'molly' });
    delete users.molly.passwordChangedAt;
    expect(await manager.findAccount('molly', { authTime: 1 })).toMatchObject({ preferred_username: 'molly' });
  });

  test('backup carries the grant roster and says it cannot be restored; restore refuses', async () => {
    const manager = await started();
    const backup = await manager.backup();
    expect(backup.data).toEqual({ restorable: false, grants: [] });
    await expect(manager.restore(backup)).rejects.toThrow(/not restored/);
  });
});

describe('issuer and operator config (#1574)', () => {
  test('issuerFor appends the mount without doubling a slash', () => {
    expect(issuerFor('https://wiki.example.com/')).toBe('https://wiki.example.com/oidc');
    expect(issuerFor('https://example.com/wiki')).toBe('https://example.com/wiki/oidc');
  });

  test('operatorOidcConfig keeps package keys, drops ngdpbase\'s switch, refuses derived keys', () => {
    const { config, problems } = operatorOidcConfig({
      'oidc-auth-server.enabled': true,
      'oidc-auth-server.device-flow.enabled': true,
      'oidc-auth-server.issuer': 'https://elsewhere.example.com',
      'ngdpbase.application.name': 'x'
    });
    expect(config).toEqual({ 'oidc-auth-server.device-flow.enabled': true });
    expect(problems).toEqual([expect.stringMatching(/^oidc-auth-server\.issuer is set by ngdpbase/)]);
  });
});

describe('API delegation helpers (#1576)', () => {
  test('aalOfAcr: phishing-resistant reads as 2, unknown as 1', () => {
    expect([aalOfAcr('aal1'), aalOfAcr('aal2'), aalOfAcr('aal3'), aalOfAcr('phr'), aalOfAcr('phrh'), aalOfAcr(undefined)]).toEqual([1, 2, 3, 2, 2, 1]);
  });

  test('apiResourceFor and delegablePermissions', () => {
    expect(apiResourceFor('https://wiki.example.com/')).toBe('https://wiki.example.com/api');
    expect(delegablePermissions({ 'page-read': {}, 'admin-users': {}, 'token-mint': {}, 'page-edit': {} })).toEqual(['page-edit', 'page-read']);
    expect(delegablePermissions(undefined)).toEqual([]);
  });
});

