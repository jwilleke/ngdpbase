/**
 * #421 slice 2b — the authenticator app's code at sign-in. After a password,
 * an account with an authenticator app is held as a pending sign-in until a
 * right code completes it with both factors (AAL2); a wrong code leaves it
 * waiting and is recorded as a failed sign-in; an account with no app is not
 * asked; a remembered browser skips the prompt only where the roles allow it
 * (#1523 slice 1c). A real FileCredentialsProvider in a temp directory; the
 * temp directory is all that is removed. No seed is printed.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Secret, TOTP } from 'otpauth';
import AuthManager from '../AuthManager.js';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins.js';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider.js';

const KEY = 'test-credentials-key-not-a-secret';
const FACTORS = [
  { authproviderid: 'password', primary: true, amr: ['pwd'], aal: 1, enabled: true },
  { authproviderid: 'totp', primary: false, amr: ['otp'], aal: 1, enabled: true, preference: 3 }
];
const first = (username: string) => ({ success: true, username, provider: 'password', factors: [{ provider: 'password', amr: ['pwd'], aal: 1 as const, at: new Date().toISOString() }] });
const subject = (username: string) => ({ username, roles: ['reader'], isAuthenticated: true }) as never;
const codeFor = (seed: string, at: number) => new TOTP({ secret: Secret.fromBase32(seed), digits: 6, period: 30, algorithm: 'SHA1' }).generate({ timestamp: at });

describe('the authenticator app at sign-in (#421 slice 2b)', () => {
  let dir: string;
  let file: string;
  let roles: Record<string, string[]>;
  let auth: Array<{ context: Record<string, unknown>; result: string; reason: string }>;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];

  const started = async () => {
    const config: Record<string, unknown> = { 'ngdpbase.auth.factors': FACTORS };
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in config ? config[k] : d),
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? file : d),
        isBaseUrlExplicit: () => false,
        getBaseURL: () => 'http://wiki.example.com',
        getApplicationName: () => 'Willeke Family'
      },
      PolicyDecisionPoint: { permits: (_s: unknown, a: string) => Promise.resolve(a === 'account-security') },
      PolicyInformationPoint: { subjectFor: (u: string) => Promise.resolve(roles[u] ? { username: u, roles: roles[u], isAuthenticated: true } : null) },
      RoleManager: { roleRequiredAal: () => ({ admin: 2, reader: 1 }), operatorRequiredAal: () => ({}) },
      UserManager: {
        getUser: (u: string) => Promise.resolve(roles[u] ? { username: u } : null),
        hasPassword: () => Promise.resolve(true)
      },
      PluginManager: TEST_PLUGIN_MANAGER,
      AuditManager: {
        logAuditEvent: () => Promise.resolve('evt'),
        logAuthentication: (context: Record<string, unknown>, result: string, reason: string) => { auth.push({ context, result, reason }); return Promise.resolve('evt'); }
      }
    };
    const manager = new AuthManager({ getManager: (n: string) => managers[n] ?? null } as never);
    await manager.initialize();
    return manager;
  };

  /** Enrol an app for `username`; returns its seed. The confirming code spends this step, so sign-in uses the next. */
  const enrolled = async (am: AuthManager, username: string): Promise<string> => {
    const { seed, pending } = await am.totpEnrolmentStart(subject(username), username);
    expect(await am.totpEnrolmentConfirm(subject(username), username, pending, codeFor(seed, Date.now()), 'Phone')).toEqual(expect.any(String));
    return seed;
  };
  const nextCode = (seed: string) => codeFor(seed, Date.now() + 30_000);
  const wrong = (seed: string) => (nextCode(seed) === '000000' ? '111111' : '000000');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-421-signin-'));
    file = path.join(dir, 'users', 'credentials.json');
    process.env[CREDENTIALS_KEY_ENV] = KEY;
    roles = { molly: ['reader'], jim: ['admin'], sam: ['reader'] };
    auth = [];
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a right code completes the pending sign-in with both factors, at AAL2', async () => {
    const am = await started();
    const seed = await enrolled(am, 'molly');
    expect(am.needsSecondStep(first('molly'))).toBe(true);
    const handle = await am.beginTwoStep(first('molly'), { binding: 'b1' });
    const pending = am.pendingSignIn(handle, 'b1');
    expect(am.secondFactorsFor('molly', pending ?? undefined)).toEqual([{ id: 'totp', label: 'Authenticator app', target: '' }]);
    expect(am.completeTwoStep(handle, 'b1')).toBeNull(); // nothing entered yet
    expect(await am.approveByTotp(handle, 'b1', nextCode(seed))).toBe('approved');
    const done = am.completeTwoStep(handle, 'b1');
    expect(done?.result.factors?.map(f => f.provider)).toEqual(['password', 'totp']);
    expect(am.signInRecord(done?.result as never)?.aal).toBe(2);
    expect(am.pendingSignIn(handle, 'b1')).toBeNull(); // single use
  });

  test('a wrong code leaves the sign-in waiting and is recorded as a failed sign-in; the right one then works', async () => {
    const am = await started();
    const seed = await enrolled(am, 'molly');
    const handle = await am.beginTwoStep(first('molly'), { binding: 'b1' });
    expect(await am.approveByTotp(handle, 'b1', wrong(seed), { ip: '203.0.113.9' })).toBe('wrong');
    expect(await am.approveByTotp(handle, 'b1', 'abc')).toBe('wrong');
    expect(am.completeTwoStep(handle, 'b1')).toBeNull();
    expect(auth).toContainEqual(expect.objectContaining({ result: 'failure', context: expect.objectContaining({ username: 'molly', loginMethod: 'totp', ipAddress: '203.0.113.9' }) }));
    expect(await am.approveByTotp(handle, 'b1', nextCode(seed))).toBe('approved');
    expect(am.completeTwoStep(handle, 'b1')).not.toBeNull();
  });

  test('the code is checked only for the browser that started the sign-in, and not twice', async () => {
    const am = await started();
    const seed = await enrolled(am, 'molly');
    const handle = await am.beginTwoStep(first('molly'), { binding: 'b1' });
    expect(await am.approveByTotp(handle, 'other', nextCode(seed))).toBe('unavailable');
    expect(await am.approveByTotp(handle, 'b1', nextCode(seed))).toBe('approved');
    expect(await am.approveByTotp(handle, 'b1', nextCode(seed))).toBe('unavailable');
  });

  test('an account with no authenticator app is not asked, and a code does nothing for it', async () => {
    const am = await started();
    await enrolled(am, 'molly');
    expect(am.secondFactorsFor('sam')).toEqual([]);
    expect(am.needsSecondStep(first('sam'))).toBe(false);
    const handle = await am.beginTwoStep(first('sam'), { binding: 'b1' });
    expect(await am.approveByTotp(handle, 'b1', '123456')).toBe('unavailable');
  });

  test('a role not requiring AAL2: asked for the code, and a remembered browser may skip it', async () => {
    const am = await started();
    await enrolled(am, 'molly');
    const handle = await am.beginTwoStep(first('molly'), { binding: 'b1' });
    const pending = am.pendingSignIn(handle, 'b1');
    expect(pending?.requiredAal).toBe(1);
    expect(am.knownDeviceMaySkip(pending as never)).toBe(true);
    (pending as { knownDevice?: string }).knownDevice = 'device-1'; // what proveKnownDevice sets
    const done = am.completeTwoStep(handle, 'b1');
    expect(done?.result.knownDevice).toBe(true);
    expect(done?.result.factors?.map(f => f.provider)).toEqual(['password']); // not a factor
  });

  test('a role requiring AAL2: the app reaches it, and a remembered browser never skips the code', async () => {
    const am = await started();
    const seed = await enrolled(am, 'jim');
    expect(await am.aalCapFor('jim')).toBe(2);
    const handle = await am.beginTwoStep(first('jim'), { binding: 'b1' });
    const pending = am.pendingSignIn(handle, 'b1');
    expect(pending?.requiredAal).toBe(2);
    expect(am.knownDeviceMaySkip(pending as never)).toBe(false);
    (pending as { knownDevice?: string }).knownDevice = 'device-1';
    expect(am.completeTwoStep(handle, 'b1')).toBeNull();
    expect(await am.approveByTotp(handle, 'b1', nextCode(seed))).toBe('approved');
    expect(am.signInRecord(am.completeTwoStep(handle, 'b1')?.result as never)?.aal).toBe(2);
  });

  test('an admin allowed an app but without one is told to add it, not cut off', async () => {
    const am = await started();
    expect(await am.aalReachFor('jim')).toEqual({ now: 1, ifEnrolled: 2 });
    expect(am.rolesAwaitingEnrolment(['admin'], await am.aalReachFor('jim'))).toEqual(['admin']);
  });
});
