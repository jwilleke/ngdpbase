/**
 * #2356 — what an account can add or use toward a stronger sign-in, for the
 * banners and the confirm page: the site's factors, narrowed to the account's
 * allowed sign-in methods and what it already has. Never a decision: the
 * level it can reach (`aalReachFor`) is unchanged. A real AuthManager with a
 * FileCredentialsProvider in a temp directory (the only thing removed);
 * which credentials an account holds is stubbed.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AuthManager from '../AuthManager.js';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider.js';

const FACTORS = [
  { authproviderid: 'passkey', primary: true, amr: ['swk', 'user'], aal: 2, acr: 'phr', enabled: true, preference: 1 },
  { authproviderid: 'password', primary: true, amr: ['pwd'], aal: 1, enabled: true },
  { authproviderid: 'totp', primary: false, amr: ['otp'], aal: 1, enabled: true, preference: 3 },
  { authproviderid: 'example-id', primary: true, aal: 2, enabled: true }
];

describe('strongerSignInWays (#2356)', () => {
  let dir: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  let accounts: Record<string, { allowedAuthMethods?: string[]; hasPassword: boolean; has: string[] }>;

  const started = async (baseUrl: string, { outside = false } = {}) => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k === 'ngdpbase.auth.factors' ? FACTORS : k === 'ngdpbase.application-name' ? 'Wiki' : d),
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? path.join(dir, 'credentials.json') : d),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => baseUrl
      },
      PolicyDecisionPoint: { permits: () => Promise.resolve(true) },
      UserManager: {
        getUser: (u: string) => Promise.resolve(accounts[u] ? { username: u, allowedAuthMethods: accounts[u].allowedAuthMethods } : null),
        hasPassword: (u: string) => Promise.resolve(Boolean(accounts[u]?.hasPassword))
      },
      AuditManager: { logAuditEvent: () => Promise.resolve('a') }
    };
    const am = new AuthManager({ getManager: (n: string) => managers[n] ?? null } as never);
    await am.initialize();
    if (outside) {
      expect(am.registerProvider({ id: 'example-id', displayName: 'Example ID', factor: { amr: ['mfa'], aal: 2, primary: true }, verify: () => Promise.resolve(null) } as never)).toBe(true);
    }
    // Which credentials each account holds: the store's rows, stubbed.
    vi.spyOn(am, 'hasCredential').mockImplementation((u: string, kind: string) => Boolean(accounts[u]?.has.includes(kind)));
    vi.spyOn(am, 'stepUpTotpOffered').mockImplementation((u: string) => Boolean(accounts[u]?.has.includes('totp')));
    return am;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2356-'));
    process.env[CREDENTIALS_KEY_ENV] = 'test-credentials-key-not-a-secret';
    accounts = {
      all: { hasPassword: true, has: [] },
      nopasskey: { allowedAuthMethods: ['password', 'totp'], hasPassword: true, has: ['passkey'] },
      noapp: { allowedAuthMethods: ['password', 'passkey'], hasPassword: true, has: ['totp'] },
      pwdonly: { allowedAuthMethods: ['password'], hasPassword: true, has: [] },
      outsider: { allowedAuthMethods: ['password', 'example-id'], hasPassword: true, has: [] }
    };
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    vi.restoreAllMocks();
  });

  test('https, allowed everything, nothing added: a passkey and the app can be added', async () => {
    const am = await started('https://wiki.example.com');
    expect(await am.strongerSignInWays('all')).toEqual({ addPasskey: true, addTotp: true, usePasskey: false, useTotp: false, password: true, outside: [] });
    accounts.all.has = ['passkey', 'totp'];
    expect(await am.strongerSignInWays('all')).toMatchObject({ addPasskey: false, addTotp: false, usePasskey: true, useTotp: true });
  });

  test('allowed methods exclude passkeys: never added or used, even with one on the account', async () => {
    const am = await started('https://wiki.example.com');
    expect(await am.strongerSignInWays('nopasskey')).toMatchObject({ addPasskey: false, usePasskey: false, addTotp: true });
  });

  test('allowed methods exclude the app: never added or used, even with one on the account', async () => {
    const am = await started('https://wiki.example.com');
    expect(await am.strongerSignInWays('noapp')).toMatchObject({ addTotp: false, useTotp: false, addPasskey: true });
  });

  test('passkeys cannot work on the address (#2345 still): no passkey for anyone', async () => {
    const am = await started('http://wiki.example.com');
    accounts.all.has = ['passkey'];
    expect(await am.strongerSignInWays('all')).toMatchObject({ addPasskey: false, usePasskey: false, addTotp: true });
  });

  test('nothing to add or use: all false, so the banner points to an administrator', async () => {
    const am = await started('https://wiki.example.com');
    expect(await am.strongerSignInWays('pwdonly')).toEqual({ addPasskey: false, addTotp: false, usePasskey: false, useTotp: false, password: true, outside: [] });
  });

  test('an outside provider that gives the level is named; the app is not', async () => {
    const am = await started('http://wiki.example.com', { outside: true });
    expect(await am.strongerSignInWays('outsider')).toEqual({ addPasskey: false, addTotp: false, usePasskey: false, useTotp: false, password: true, outside: ['Example ID'] });
    // Only an allowed one: an account not allowed it is not told to use it.
    expect((await am.strongerSignInWays('pwdonly')).outside).toEqual([]);
  });

  test('a password the account does not have is not counted', async () => {
    const am = await started('https://wiki.example.com');
    accounts.all.hasPassword = false;
    expect((await am.strongerSignInWays('all')).password).toBe(false);
  });

  test('the level each account reaches is unchanged by this (aalReachFor)', async () => {
    const am = await started('https://wiki.example.com');
    expect(await am.aalReachFor('nopasskey')).toEqual({ now: 1, ifEnrolled: 2 });
    expect(await am.aalReachFor('noapp')).toEqual({ now: 1, ifEnrolled: 2 });
    expect(await am.aalReachFor('pwdonly')).toEqual({ now: 1, ifEnrolled: 1 });
    accounts.all.has = ['passkey'];
    expect(await am.aalReachFor('all')).toEqual({ now: 2, ifEnrolled: 2 });
  });
});
