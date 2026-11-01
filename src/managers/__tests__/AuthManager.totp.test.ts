/**
 * #421 — enrolling an authenticator app through AuthManager: the seed is kept
 * only sealed, a wrong code enrols nothing, the confirming code is spent, and
 * TOTP is not yet offered at sign-in. A real FileCredentialsProvider in a temp
 * directory; the temp directory is all that is removed. No seed is printed.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Secret, TOTP } from 'otpauth';
import AuthManager from '../AuthManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

const KEY = 'test-credentials-key-not-a-secret';
const subject = (username: string, isAuthenticated = true) => ({ username, roles: ['reader'], isAuthenticated }) as never;

describe('AuthManager TOTP enrolment (#421)', () => {
  let dir: string;
  let file: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  let audit: Array<Record<string, unknown>>;
  let notices: Array<Record<string, unknown>>;
  let users: Record<string, { password?: string; isExternal?: boolean }>;

  const started = async (granted: Record<string, string[]> = { molly: ['account-security'], admin: ['account-security', 'user-edit'] }, opts: { staleSignIn?: boolean } = {}) => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (_k: string, d: unknown) => d,
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? file : d),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://wiki.example.com'
      },
      // `holds` is policy only; `permits` adds the fresh-sign-in rule (#1635), so a
      // stale sign-in is refused by `permits` and still holds the permission.
      PolicyDecisionPoint: {
        permits: (s: { username: string }, action: string) => Promise.resolve(!opts.staleSignIn && (granted[s.username] ?? []).includes(action)),
        holds: (s: { username: string }, action: string) => Promise.resolve((granted[s.username] ?? []).includes(action))
      },
      // The real contract: getUser() never returns the password (it is stripped),
      // and hasPassword() is the door that sees it. The earlier mock returned
      // the password from getUser(), so the last-way-in rule passed here while
      // refusing every real account (#1524).
      UserManager: {
        getUser: (u: string) => Promise.resolve(users[u] ? { ...users[u], password: undefined } : null),
        hasPassword: (u: string) => Promise.resolve(Boolean(users[u] && !users[u].isExternal && users[u].password))
      },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve('evt'); } },
      NotificationManager: { notifyAdmins: (n: Record<string, unknown>) => { notices.push(n); return Promise.resolve('n1'); } }
    };
    const manager = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1524-am-'));
    file = path.join(dir, 'users', 'credentials.json');
    process.env[CREDENTIALS_KEY_ENV] = KEY;
    audit = [];
    notices = [];
    users = { molly: { password: 'scrypt$x' }, sam: { password: '', isExternal: true }, pat: { password: 'scrypt$x', allowedAuthMethods: ['password'] } as never };
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const codeFor = (seed: string, at = Date.now()) => new TOTP({ secret: Secret.fromBase32(seed), digits: 6, period: 30, algorithm: 'SHA1' }).generate({ timestamp: at });
  const wrongCode = (seed: string) => (codeFor(seed) === '000000' ? '111111' : '000000');

  test('an offer is a key, an otpauth URI and an SVG QR code; nothing is stored until confirmed', async () => {
    const am = await started();
    expect(am.totpAvailable()).toBe(true);
    const offer = await am.totpEnrolmentStart(subject('molly'), 'molly');
    expect(offer.seed).toMatch(/^[A-Z2-7]{32}$/);
    expect(offer.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(offer.qrSvg).toMatch(/^<svg/);
    expect(offer.pending).not.toContain(offer.seed); // what the session keeps is sealed
    expect(await am.listCredentials(subject('molly'), 'molly')).toEqual([]);
  });

  test('a confirmed enrolment is stored sealed and audited without its secret', async () => {
    const am = await started();
    const { seed, pending } = await am.totpEnrolmentStart(subject('molly'), 'molly');
    const id = await am.totpEnrolmentConfirm(subject('molly'), 'molly', pending, codeFor(seed), 'Phone app');
    expect(id).toEqual(expect.any(String));
    expect(await am.listCredentials(subject('molly'), 'molly')).toEqual([expect.objectContaining({ id, kind: 'totp', label: 'Phone app' })]);
    expect(fs.readFileSync(file, 'utf8')).not.toContain(seed);
    const added = audit.find(e => e.action === 'credential-add');
    expect(added).toEqual(expect.objectContaining({ user: 'molly', resource: 'molly' }));
    expect(JSON.stringify(audit)).not.toContain(seed);
  });

  test('a wrong code enrols nothing', async () => {
    const am = await started();
    const { seed, pending } = await am.totpEnrolmentStart(subject('molly'), 'molly');
    expect(await am.totpEnrolmentConfirm(subject('molly'), 'molly', pending, wrongCode(seed), 'App')).toBeNull();
    expect(await am.listCredentials(subject('molly'), 'molly')).toEqual([]);
  });

  test('the confirming code is spent; a second app is refused until the first is removed', async () => {
    const am = await started();
    const { seed, pending } = await am.totpEnrolmentStart(subject('molly'), 'molly');
    const code = codeFor(seed);
    const id = await am.totpEnrolmentConfirm(subject('molly'), 'molly', pending, code, 'App');
    const totp = (am as unknown as { totp: { verify(c: object): Promise<unknown> } }).totp;
    expect(await totp.verify({ username: 'molly', code })).toBeNull();
    await expect(am.totpEnrolmentStart(subject('molly'), 'molly')).rejects.toThrow(/already has an authenticator app/);
    expect(await am.removeCredential(subject('molly'), 'molly', id)).toBe(true);
    expect(audit).toContainEqual(expect.objectContaining({ action: 'credential-remove', resource: 'molly' }));
    await expect(am.totpEnrolmentStart(subject('molly'), 'molly')).resolves.toBeTruthy();
  });

  test('only the person themselves (account-security) or a user admin; and not an account limited to other methods', async () => {
    const am = await started({ molly: ['account-security'], pat: ['account-security'] });
    await expect(am.totpEnrolmentStart(subject('molly'), 'sam')).rejects.toThrow(/Permission denied/);
    await expect(am.totpEnrolmentStart(subject('pat'), 'pat')).rejects.toThrow(/cannot sign in with an authenticator app/);
  });

  test('a pending seed opens only for the account it was offered to, and only sealed', async () => {
    const am = await started({ molly: ['account-security'], sam: ['account-security'] });
    users.sam = { password: 'scrypt$x' };
    const { seed, pending } = await am.totpEnrolmentStart(subject('molly'), 'molly');
    expect(await am.totpEnrolmentConfirm(subject('sam'), 'sam', pending, codeFor(seed), 'App')).toBeNull();
    expect(await am.totpEnrolmentConfirm(subject('molly'), 'molly', seed, codeFor(seed), 'App')).toBeNull(); // the plain seed is not accepted
    expect(await am.listCredentials(subject('sam'), 'sam')).toEqual([]);
    expect(await am.listCredentials(subject('molly'), 'molly')).toEqual([]);
  });

  test('a totp row cannot be added unsealed through addCredential', async () => {
    const am = await started();
    await expect(am.addCredential(subject('molly'), 'molly', { kind: 'totp', subject: 's', secret: 'plain', label: 'x' })).rejects.toThrow(/totpEnrolmentConfirm/);
  });

  test('not offered at sign-in yet (slice 2b): totp is not a registered provider', async () => {
    const am = await started();
    expect(am.isEnabled('totp')).toBe(false);
  });

  test('without the credentials key there is no enrolment', async () => {
    delete process.env[CREDENTIALS_KEY_ENV];
    const am = await started();
    expect(am.totpAvailable()).toBe(false);
    await expect(am.totpEnrolmentStart(subject('molly'), 'molly')).rejects.toThrow(/not available/);
  });
});
