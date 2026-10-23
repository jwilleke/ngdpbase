/**
 * #1882 — every sign-in ends with the STORED username.
 *
 * Usernames are looked up case-insensitively (#1436), so "ADMIN" finds
 * admin's record and admin's password verifies. The sign-in used to carry the
 * typed "ADMIN" on into the session: a twin identity with no roles, and a
 * personal vault provisioned under that casing. The provider now names the
 * stored record, and AuthManager canonicalises every sign-in against the user
 * store at the doors (`authenticate`, `beginTwoStep`, `completeSignIn`),
 * refusing a name no stored account has.
 *
 * A real FileUserProvider and FileCredentialsProvider in a temp directory, the
 * real PasswordAuthProvider registered by AuthManager. Teardown removes only
 * that temp directory, never a data tree.
 */
vi.unmock('../../providers/FileUserProvider');
vi.unmock('./src/providers/FileUserProvider');
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import AuthManager from '../AuthManager';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';
import { hashPassword } from '../../utils/passwordHash';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

const { default: FileUserProvider } = await vi.importActual<{ default: typeof import('../../providers/FileUserProvider').default }>(
  '../../providers/FileUserProvider'
);

// Made when the test runs, never a literal in the source (#1758).
const PW = `pw-${randomUUID()}`;

describe('sign-in ends with the stored username (#1882)', () => {
  let dir: string;
  let sent: Array<{ to: string; text: string }>;
  let audit: { logAuthentication: ReturnType<typeof vi.fn> };
  let recordSignIn: ReturnType<typeof vi.fn>;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1882-'));
    process.env[CREDENTIALS_KEY_ENV] = 'test-credentials-key-not-a-secret';
    sent = [];
    fs.writeFileSync(path.join(dir, 'users.json'), JSON.stringify({
      admin: { username: 'admin', email: 'admin@example.test', password: await hashPassword(PW), roles: ['admin'], isActive: true }
    }), 'utf8');
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only this test's own temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** `typedProvider`: the password method replaced by one that vouches for whatever name it was given. */
  const started = async (opts: { typedProvider?: boolean } = {}) => {
    const config = {
      getProperty: (k: string, d: unknown) =>
        k === 'ngdpbase.user.provider.files.users' ? 'users.json' : k === 'ngdpbase.user.provider.files.sessions' ? 'sessions.json'
          : k === 'ngdpbase.auth.password.enabled' && opts.typedProvider ? false : d,
      getCustomProperty: () => undefined,
      getResolvedDataPath: (k: string) => (k === 'ngdpbase.auth.credentials.file' ? path.join(dir, 'credentials.json') : dir),
      isBaseUrlExplicit: () => true,
      getBaseURL: () => 'https://site.example.test',
      getApplicationName: () => 'ngdpbase'
    };
    const store = new FileUserProvider({ getManager: (n: string) => (n === 'ConfigurationManager' ? config : null) });
    await store.initialize();
    recordSignIn = vi.fn().mockResolvedValue(undefined);
    // The parts of UserManager sign-in uses, over the real store.
    const userManager = {
      getUser: async (u: string) => {
        const found = await store.getUser(u);
        if (!found) return undefined;
        const { password: _hash, ...rest } = found;
        return rest;
      },
      storedPasswordHash: async (u: string) => (await store.getUser(u))?.password ?? null,
      upgradePasswordHash: vi.fn().mockResolvedValue(undefined),
      hasPassword: () => Promise.resolve(true),
      recordSignIn
    };
    audit = { logAuthentication: vi.fn().mockResolvedValue('a1') };
    const managers: Record<string, unknown> = {
      ConfigurationManager: config,
      UserManager: userManager,
      PluginManager: TEST_PLUGIN_MANAGER,
      AuditManager: { ...audit, logAuditEvent: () => Promise.resolve('evt') },
      PolicyDecisionPoint: { permits: (s: { username: string }, action: string) => Promise.resolve(action === 'account-security' && s.username === 'admin') },
      EmailManager: { send: (m: { to: string; text: string }) => { sent.push(m); return Promise.resolve(); }, getProviderName: () => 'test' }
    };
    const am = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await am.initialize();
    if (opts.typedProvider) {
      expect(am.registerProvider({
        id: 'password', displayName: 'typed', factor: { amr: ['pwd'], aal: 1, primary: true },
        verify: (c: { username?: string }) => Promise.resolve({ username: c.username })
      })).toBe(true);
    }
    const unlocked: string[] = [];
    am.setVaultUnlocker((username) => { unlocked.push(username); return Promise.resolve(`handle-for-${username}`); });
    return { am, userManager, unlocked };
  };

  function fakeReq() {
    const session: Record<string, unknown> = {
      regenerate: vi.fn((cb: (err?: unknown) => void) => {
        for (const k of Object.keys(session)) if (k !== 'regenerate' && k !== 'save') delete session[k];
        cb();
      }),
      save: vi.fn((cb: (err?: unknown) => void) => cb())
    };
    return { req: { session, ip: '203.0.113.9', get: () => 'TestAgent' } as never, session };
  }

  const successUsers = () => audit.logAuthentication.mock.calls.filter((c) => c[1] === 'success').map((c) => (c[0] as { username: string }).username);

  test('"ADMIN" for stored "admin": the session is admin, with admin\'s roles, and nothing opens under "ADMIN"', async () => {
    const { am, userManager, unlocked } = await started();
    const result = await am.authenticate('password', { username: 'ADMIN', password: PW });
    expect(result).toMatchObject({ success: true, username: 'admin' });

    const { req, session } = fakeReq();
    await am.completeSignIn(req, result, { method: 'password', unlockWith: { password: PW } });

    expect(session.username).toBe('admin');
    expect((await userManager.getUser(session.username as string))?.roles).toEqual(['admin']);
    expect(unlocked).toEqual(['admin']);
    expect(session.privateStoreHandle).toBe('handle-for-admin');
    expect(successUsers()).toEqual(['admin']);
    expect(recordSignIn).toHaveBeenCalledWith('admin');
  });

  test('a provider that hands back the typed casing is canonicalised by authenticate', async () => {
    const { am } = await started({ typedProvider: true });
    expect(await am.authenticate('password', { username: 'ADMIN', password: PW })).toMatchObject({ success: true, username: 'admin' });
  });

  test('a name no stored account has is refused, even when a provider vouches for it', async () => {
    const { am } = await started({ typedProvider: true });
    expect(await am.authenticate('password', { username: 'ADMlN', password: PW })).toEqual({ success: false });
    expect(audit.logAuthentication.mock.calls.filter((c) => c[1] === 'failure')).toHaveLength(1);
  });

  test('completeSignIn canonicalises a result built elsewhere, and refuses one with no stored account (no session)', async () => {
    const { am, unlocked } = await started();
    const typed = { success: true, username: ' ADMIN ', provider: 'password', factors: [{ provider: 'password', amr: ['pwd'], aal: 1 as const, at: new Date().toISOString() }] };

    const ok = fakeReq();
    await am.completeSignIn(ok.req, typed, { method: 'password', unlockWith: { password: PW } });
    expect(ok.session.username).toBe('admin');
    expect(unlocked).toEqual(['admin']);

    const refused = fakeReq();
    await expect(am.completeSignIn(refused.req, { ...typed, username: 'ghost' }, { method: 'password', unlockWith: { password: PW } })).rejects.toThrow();
    expect(refused.session.regenerate).not.toHaveBeenCalled();
    expect(refused.session.username).toBeUndefined();
    expect(refused.session.isAuthenticated).toBeUndefined();
    expect(unlocked).toEqual(['admin']);
    expect(successUsers()).toEqual(['admin']);
  });

  test('two-step: "ADMIN" finds admin\'s second factor, the pending sign-in is admin\'s, and the session is admin', async () => {
    const { am, unlocked } = await started();
    expect(await am.startEmailFactorEnrolment({ username: 'admin', roles: ['admin'], isAuthenticated: true }, 'admin')).toBe('sent');
    const enrol = /confirm\?t=([\w-]+)/.exec(sent.at(-1).text)[1];
    expect(await am.confirmEmailFactorEnrolment({ username: 'admin', roles: ['admin'], isAuthenticated: true }, enrol)).toBe(true);

    const first = await am.authenticate('password', { username: 'ADMIN', password: PW });
    expect(am.secondFactorsFor(first.username)).toHaveLength(1);
    expect(am.needsSecondStep(first)).toBe(true);
    const keys = await am.unlockVaults(first.username, PW);
    expect(unlocked).toEqual(['admin']);

    // Handed the typed casing anyway, beginTwoStep holds the stored one.
    const handle = await am.beginTwoStep({ ...first, username: 'ADMIN' }, { binding: 'b', privateStoreHandle: keys });
    expect(am.pendingSignIn(handle, 'b')?.username).toBe('admin');
    expect(await am.sendEmailApproval(handle, 'b')).toBe('sent');
    const approve = /approve\?t=([\w-]+)/.exec(sent.at(-1).text)[1];
    expect(await am.approveByToken(approve)).toBe('admin');
    const done = am.completeTwoStep(handle, 'b')!;

    const { req, session } = fakeReq();
    await am.completeSignIn(req, done.result, { method: 'password and email link', privateStoreHandle: done.privateStoreHandle });
    expect(session.username).toBe('admin');
    expect(session.privateStoreHandle).toBe('handle-for-admin');
    expect(successUsers()).toEqual(['admin']);
  });

  test('two-step refuses to hold a sign-in no stored account has', async () => {
    const { am } = await started();
    await expect(am.beginTwoStep({ success: true, username: 'ghost', provider: 'password', factors: [] }, { binding: 'b' })).rejects.toThrow();
  });
});
