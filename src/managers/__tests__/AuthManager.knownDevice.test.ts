/**
 * #1523 slice 1c — known devices. A remembered browser's device key skips the
 * second-factor prompt only when the factors entered already reach the
 * highest required-aal among the person's roles (operator, 2026-11-01); it is
 * not a factor (Q4), remembering is opt-in and recorded as consent (Q5), and
 * the browser is identified by a signature over a one-time challenge (the
 * 2026-10-04 design). A real FileCredentialsProvider in a temp directory; the
 * temp directory is all that is removed.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import AuthManager, { KNOWN_DEVICE_SIGNED_PREFIX } from '../AuthManager.js';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins.js';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider.js';
import { REMEMBER_BROWSER_CONSENT_SCOPE } from '../../types/Consent.js';

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const FIREFOX_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:131.0) Gecko/20100101 Firefox/131.0';
const FROM = { ip: '203.0.113.9', userAgent: CHROME_WIN, platformHint: '"Windows"' };
const first = (username: string) => ({ success: true, username, provider: 'password', factors: [{ provider: 'password', amr: ['pwd'], aal: 1 as const, at: new Date().toISOString() }] });
const ctx = (username: string) => ({ username, roles: ['reader'], isAuthenticated: true });

describe('known devices (#1523 slice 1c)', () => {
  let dir: string;
  let file: string;
  let config: Record<string, unknown>;
  let roles: Record<string, string[]>;
  let consentDoc: { id: string; version: string } | null;
  let accepted: Array<{ username: string; scope: string; subject?: string }>;
  let consentRefuses: boolean;
  let auth: Array<{ context: Record<string, unknown>; result: string; reason: string }>;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];

  const started = async () => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k in config ? config[k] : d),
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? file : d),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://wiki.example.com',
        getApplicationName: () => 'Willeke Family'
      },
      PolicyDecisionPoint: { permits: () => Promise.resolve(false) },
      PolicyInformationPoint: { subjectFor: (u: string) => Promise.resolve(roles[u] ? { username: u, roles: roles[u], isAuthenticated: true } : null) },
      RoleManager: { roleRequiredAal: () => ({ admin: 2, reader: 1 }), operatorRequiredAal: () => ({}) },
      UserManager: {
        getUser: (u: string) => Promise.resolve(roles[u] ? { username: u, email: `${u}@example.com` } : null),
        hasPassword: () => Promise.resolve(true)
      },
      PluginManager: TEST_PLUGIN_MANAGER,
      AuditManager: {
        logAuditEvent: () => Promise.resolve('evt'),
        logAuthentication: (context: Record<string, unknown>, result: string, reason: string) => { auth.push({ context, result, reason }); return Promise.resolve('evt'); }
      },
      ConsentManager: {
        documents: (scope: string) => Promise.resolve(scope === REMEMBER_BROWSER_CONSENT_SCOPE && consentDoc ? [consentDoc] : []),
        accept: (c: { username: string }, scope: string, _seen: unknown, _how: string, subject?: string) => {
          if (consentRefuses) return Promise.reject(new Error('refused'));
          accepted.push({ username: c.username, scope, subject });
          return Promise.resolve([]);
        }
      }
    };
    const manager = new AuthManager({ getManager: (n: string) => managers[n] ?? null } as never);
    await manager.initialize();
    return manager;
  };

  /** A browser key pair as WebCrypto would make it: the public half as SPKI. */
  const browserKey = () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    return { spki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), privateKey };
  };
  const signChallenge = (privateKey: KeyObject, challenge: string) =>
    sign('sha256', Buffer.from(KNOWN_DEVICE_SIGNED_PREFIX + challenge, 'utf8'), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');

  /** Remember a browser for `username` the way the routes do, after a two-step sign-in. */
  const remembered = async (am: AuthManager, username: string, userAgent = CHROME_WIN, platformHint = '"Windows"') => {
    const key = browserKey();
    const saved = await am.rememberBrowser(ctx(username), { publicKey: key.spki, version: '1', userAgent, platformHint, amr: ['pwd', 'email'] });
    return { ...key, deviceId: saved?.deviceId ?? '' };
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1523c-'));
    file = path.join(dir, 'users', 'credentials.json');
    process.env[CREDENTIALS_KEY_ENV] = 'test-credentials-key-not-a-secret';
    config = {};
    roles = { molly: ['reader'], admin: ['admin'] };
    consentDoc = { id: 'remember-browser-page', version: '1' };
    accepted = [];
    consentRefuses = false;
    auth = [];
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
  });

  it('an AAL1 role on a remembered browser skips the prompt, signed in with only the password and the known-device flag', async () => {
    const am = await started();
    const device = await remembered(am, 'molly');
    expect(device.deviceId).not.toBe('');
    const handle = await am.beginTwoStep(first('molly'), { binding: 'b' });
    const challenge = am.knownDeviceChallenge(handle, 'b');
    expect(challenge).toBeTruthy();
    expect(await am.proveKnownDevice(handle, 'b', device.deviceId, signChallenge(device.privateKey, challenge), FROM)).toBe(true);
    const done = am.completeTwoStep(handle, 'b');
    expect(done?.result.knownDevice).toBe(true);
    const record = am.signInRecord(done.result);
    expect(record).toMatchObject({ amr: ['pwd'], aal: 1, knownDevice: true });
  });

  it('records the known-device flag in the sign-in audit record', async () => {
    const am = await started();
    const req = { session: { regenerate: (cb: (e?: unknown) => void) => cb(), save: (cb: (e?: unknown) => void) => cb() } as Record<string, unknown>, ip: FROM.ip, get: () => CHROME_WIN };
    await am.completeSignIn(req as never, { ...first('molly'), knownDevice: true }, { method: 'password on a remembered browser' });
    const success = auth.find((a) => a.result === 'success');
    expect(success?.context).toMatchObject({ loginMethod: 'password on a remembered browser', knownDevice: true });
    expect((req.session.signIn as { knownDevice?: boolean; aal: number }).knownDevice).toBe(true);
    expect((req.session.signIn as { aal: number }).aal).toBe(1);
  });

  it('an AAL2 role is always prompted, on a remembered browser too', async () => {
    const am = await started();
    const device = await remembered(am, 'admin');
    const handle = await am.beginTwoStep(first('admin'), { binding: 'b' });
    expect(am.knownDeviceChallenge(handle, 'b')).toBeNull();
    expect(await am.proveKnownDevice(handle, 'b', device.deviceId, signChallenge(device.privateKey, 'anything'), FROM)).toBe(false);
    expect(am.completeTwoStep(handle, 'b')).toBeNull();
    const pending = am.pendingSignIn(handle, 'b');
    expect(am.rememberOffered(pending)).toBe(false);
  });

  it('nothing is remembered without consent: no consent document, or the record refused, leaves no device row', async () => {
    consentDoc = null;
    let am = await started();
    expect((await remembered(am, 'molly')).deviceId).toBe('');
    consentDoc = { id: 'remember-browser-page', version: '1' };
    consentRefuses = true;
    am = await started();
    expect((await remembered(am, 'molly')).deviceId).toBe('');
    expect(am.rememberedDevices('molly')).toHaveLength(0);
    // And a page that changed since it was shown is no consent to the new wording.
    consentRefuses = false;
    const key = browserKey();
    expect(await am.rememberBrowser(ctx('molly'), { publicKey: key.spki, version: '0', userAgent: CHROME_WIN, platformHint: '"Windows"', amr: ['pwd'] })).toBeNull();
  });

  it('remembering records a consent bound to the device id, before the row', async () => {
    const am = await started();
    const device = await remembered(am, 'molly');
    expect(accepted).toEqual([{ username: 'molly', scope: REMEMBER_BROWSER_CONSENT_SCOPE, subject: device.deviceId }]);
    expect(am.rememberedDevices('molly').map((d) => d.row.subject)).toEqual([device.deviceId]);
  });

  it('the remember box only carries forward after a real second factor, and only where it could skip', async () => {
    const am = await started();
    const handle = await am.beginTwoStep(first('molly'), { binding: 'b' });
    am.noteRemember(handle, 'b', '1');
    expect(am.completeTwoStep(handle, 'b')).toBeNull(); // no second factor yet
    const adminHandle = await am.beginTwoStep(first('admin'), { binding: 'c' });
    am.noteRemember(adminHandle, 'c', '1');
    expect(am.pendingSignIn(adminHandle, 'c')?.remember).toBeUndefined();
  });

  it("another user's device does not count", async () => {
    const am = await started();
    roles.sam = ['reader'];
    const samDevice = await remembered(am, 'sam');
    const handle = await am.beginTwoStep(first('molly'), { binding: 'b' });
    await remembered(am, 'molly');
    const challenge = am.knownDeviceChallenge(handle, 'b');
    expect(await am.proveKnownDevice(handle, 'b', samDevice.deviceId, signChallenge(samDevice.privateKey, challenge), FROM)).toBe(false);
    expect(am.completeTwoStep(handle, 'b')).toBeNull();
    expect(auth.some((a) => a.result === 'failure' && /remembered browser not accepted/.test(a.reason))).toBe(true);
  });

  it('a mismatched browser or system does not count', async () => {
    const am = await started();
    const device = await remembered(am, 'molly');
    const handle = await am.beginTwoStep(first('molly'), { binding: 'b' });
    let challenge = am.knownDeviceChallenge(handle, 'b');
    expect(await am.proveKnownDevice(handle, 'b', device.deviceId, signChallenge(device.privateKey, challenge), { ...FROM, userAgent: FIREFOX_MAC, platformHint: undefined })).toBe(false);
    challenge = am.knownDeviceChallenge(handle, 'b');
    expect(await am.proveKnownDevice(handle, 'b', device.deviceId, signChallenge(device.privateKey, challenge), { ...FROM, platformHint: '"Linux"' })).toBe(false);
    expect(am.completeTwoStep(handle, 'b')).toBeNull();
  });

  it('a wrong signature, or a reused challenge, does not count', async () => {
    const am = await started();
    const device = await remembered(am, 'molly');
    const other = browserKey();
    const handle = await am.beginTwoStep(first('molly'), { binding: 'b' });
    let challenge = am.knownDeviceChallenge(handle, 'b');
    expect(await am.proveKnownDevice(handle, 'b', device.deviceId, signChallenge(other.privateKey, challenge), FROM)).toBe(false);
    // The challenge was spent by the failed attempt.
    expect(await am.proveKnownDevice(handle, 'b', device.deviceId, signChallenge(device.privateKey, challenge), FROM)).toBe(false);
    challenge = am.knownDeviceChallenge(handle, 'b');
    expect(await am.proveKnownDevice(handle, 'b', device.deviceId, signChallenge(device.privateKey, challenge), FROM)).toBe(true);
  });

  it('a remembered browser past its period prompts again', async () => {
    config['ngdpbase.auth.known-device.remember-days'] = 1;
    const am = await started();
    const device = await remembered(am, 'molly');
    const later = Date.now() + 2 * 86_400_000;
    expect(am.rememberedDevices('molly', later)).toHaveLength(0);
    vi.useFakeTimers({ now: later, toFake: ['Date'] });
    try {
      const handle = await am.beginTwoStep(first('molly'), { binding: 'b' });
      expect(am.knownDeviceChallenge(handle, 'b')).toBeNull();
      expect(await am.proveKnownDevice(handle, 'b', device.deviceId, signChallenge(device.privateKey, 'x'), FROM)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('remember-days 0 turns remembering off', async () => {
    config['ngdpbase.auth.known-device.remember-days'] = 0;
    const am = await started();
    expect((await remembered(am, 'molly')).deviceId).toBe('');
  });

  it('refuses a key that is not ECDSA P-256, and a browser it cannot tell', async () => {
    const am = await started();
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
    expect(await am.rememberBrowser(ctx('molly'), { publicKey: rsa, version: '1', userAgent: CHROME_WIN, platformHint: '"Windows"', amr: ['pwd'] })).toBeNull();
    expect(await am.rememberBrowser(ctx('molly'), { publicKey: browserKey().spki, version: '1', userAgent: 'curl/8.0', amr: ['pwd'] })).toBeNull();
  });
});
