/**
 * #1523 — two-step sign-in in AuthManager: the pending sign-in (bound to its
 * browser, single-use, short-lived), the email-link second factor (a link
 * opens a page; only the button approves), and enrolling the email as a second
 * factor (the address must prove it receives mail). A real
 * FileCredentialsProvider in a temp directory; the temp directory is all that
 * is removed.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AuthManager from '../AuthManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

const subject = (username: string) => ({ username, roles: ['reader'], isAuthenticated: true }) as never;
const FIRST = { success: true, username: 'molly', provider: 'password', factors: [{ provider: 'password', amr: ['pwd'], aal: 1 as const, at: new Date().toISOString() }] };

describe('two-step sign-in (#1523)', () => {
  let dir: string;
  let file: string;
  let sent: Array<{ to: string; subject: string; text: string }>;
  let mailOn: boolean;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];

  const started = async () => {
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (_k: string, d: unknown) => d,
        getCustomProperty: () => undefined,
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? file : d),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://wiki.example.com'
      },
      PolicyDecisionPoint: { permits: (s: { username: string }, action: string) => Promise.resolve(action === 'account-security' && ['molly', 'sam'].includes(s.username)) },
      UserManager: {
        getUser: (u: string) => Promise.resolve({ molly: { username: 'molly', email: 'molly@example.com' }, sam: { username: 'sam', email: '' } }[u] ?? null),
        hasPassword: () => Promise.resolve(true)
      },
      EmailManager: mailOn ? { send: (m: { to: string; subject: string; text: string }) => { sent.push(m); return Promise.resolve(); }, getProviderName: () => 'test' } : null,
      AuditManager: { logAuditEvent: () => Promise.resolve('evt') }
    };
    const manager = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  /** Enrol molly's email as a second factor the real way: start, then confirm from the link. */
  const enrolled = async () => {
    const am = await started();
    expect(await am.startEmailFactorEnrolment(subject('molly'), 'molly')).toBe('sent');
    const token = /confirm\?t=([\w-]+)/.exec(sent.at(-1).text)[1];
    expect(await am.confirmEmailFactorEnrolment(subject('molly'), token)).toBe(true);
    return am;
  };

  const linkToken = (): string => /approve\?t=([\w-]+)/.exec(sent.at(-1).text)[1];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1523-2step-'));
    file = path.join(dir, 'users', 'credentials.json');
    process.env[CREDENTIALS_KEY_ENV] = 'test-credentials-key-not-a-secret';
    sent = [];
    mailOn = true;
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('no second factor enrolled: none offered, so the sign-in stays one step', async () => {
    const am = await started();
    expect(am.secondFactorsFor('molly')).toEqual([]);
  });

  test('enrolling: the address must answer a link, by the same person; then it is offered, masked', async () => {
    const am = await started();
    expect(await am.startEmailFactorEnrolment(subject('molly'), 'molly')).toBe('sent');
    expect(sent[0].to).toBe('molly@example.com');
    const token = /confirm\?t=([\w-]+)/.exec(sent[0].text)[1];
    expect(await am.confirmEmailFactorEnrolment(subject('sam'), token)).toBe(false);
    expect(am.secondFactorsFor('molly')).toEqual([]);

    expect(await am.startEmailFactorEnrolment(subject('molly'), 'molly')).toBe('sent');
    const second = /confirm\?t=([\w-]+)/.exec(sent[1].text)[1];
    expect(await am.confirmEmailFactorEnrolment(subject('molly'), second)).toBe(true);
    expect(await am.confirmEmailFactorEnrolment(subject('molly'), second)).toBe(false);
    expect(am.secondFactorsFor('molly')).toEqual([{ id: 'email-link', label: 'Email link', target: 'm***@example.com' }]);
    expect(await am.startEmailFactorEnrolment(subject('sam'), 'sam')).toBe('no-email');
  });

  test('without mail, an enrolled email is not offered — never a factor that cannot work', async () => {
    const am = await enrolled();
    mailOn = false;
    const off = await started();
    expect(off.secondFactorsFor('molly')).toEqual([]);
    expect(am.secondFactorsFor('molly')).toHaveLength(1);
  });

  test('approve from the link: the sign-in completes with both factors, once, for the browser that started it', async () => {
    const am = await enrolled();
    const handle = am.beginTwoStep(FIRST, { binding: 'browser-1', ip: '1.2.3.4', userAgent: 'Chrome' });
    expect(am.pendingSignIn(handle, 'another-browser')).toBeNull();
    expect(await am.sendEmailApproval(handle, 'browser-1')).toBe('sent');
    expect(sent.at(-1).to).toBe('molly@example.com');
    expect(await am.sendEmailApproval(handle, 'browser-1')).toBe('too-soon');

    const token = linkToken();
    expect(am.approvalDetails(token)).toMatchObject({ username: 'molly', ip: '1.2.3.4', userAgent: 'Chrome' });
    expect(am.completeTwoStep(handle, 'browser-1')).toBeNull();
    expect(am.approveByToken(token)).toBe('molly');
    expect(am.approveByToken(token)).toBeNull();

    expect(am.completeTwoStep(handle, 'another-browser')).toBeNull();
    const done = am.completeTwoStep(handle, 'browser-1');
    expect(done?.result.factors?.map((f) => f.provider)).toEqual(['password', 'email-link']);
    expect(am.signInRecord(done!.result)).toMatchObject({ amr: ['pwd', 'email'], aal: 1, acr: 'aal1' });
    expect(am.completeTwoStep(handle, 'browser-1')).toBeNull();
  });

  test('"this wasn\'t me" refuses the waiting sign-in for good', async () => {
    const am = await enrolled();
    const handle = am.beginTwoStep(FIRST, { binding: 'b' });
    await am.sendEmailApproval(handle, 'b');
    const token = linkToken();
    expect(am.denyByToken(token)).toBe('molly');
    expect(am.pendingSignIn(handle, 'b')?.denied).toBe(true);
    expect(am.approveByToken(token)).toBeNull();
    expect(am.completeTwoStep(handle, 'b')).toBeNull();
  });

  test('a pending sign-in expires after 10 minutes', async () => {
    vi.useFakeTimers();
    try {
      const am = await enrolled();
      const handle = am.beginTwoStep(FIRST, { binding: 'b' });
      vi.advanceTimersByTime(10 * 60_000 + 1);
      expect(am.pendingSignIn(handle, 'b')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
