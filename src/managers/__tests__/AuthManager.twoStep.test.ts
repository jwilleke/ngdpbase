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
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

const subject = (username: string) => ({ username, roles: ['reader'], isAuthenticated: true }) as never;
const FIRST = { success: true, username: 'molly', provider: 'password', factors: [{ provider: 'password', amr: ['pwd'], aal: 1 as const, at: new Date().toISOString() }] };

describe('two-step sign-in (#1523)', () => {
  let dir: string;
  let file: string;
  let sent: Array<{ to: string; subject: string; text: string }>;
  let mailOn: boolean;
  let mailFails: boolean;
  let audit: Array<Record<string, unknown>>;
  let config: Record<string, unknown>;
  let consent: { pendingFor: ReturnType<typeof vi.fn> } | null;
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
      PolicyDecisionPoint: { permits: (s: { username: string }, action: string) => Promise.resolve(action === 'account-security' && ['molly', 'sam'].includes(s.username)) },
      UserManager: {
        getUser: (u: string) => Promise.resolve({ molly: { username: 'molly', email: 'molly@example.com', preferences: { timezone: 'America/New_York', locale: 'en-US', timeFormat: '24h' } }, sam: { username: 'sam', email: '' } }[u] ?? null),
        hasPassword: () => Promise.resolve(true)
      },
      EmailManager: mailOn ? { send: (m: { to: string; subject: string; text: string }) => { if (mailFails) return Promise.reject(new Error('smtp down')); sent.push(m); return Promise.resolve(); }, getProviderName: () => 'test' } : null,
      PluginManager: TEST_PLUGIN_MANAGER,
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve('evt'); } },
      ConsentManager: consent
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
    mailFails = false;
    audit = [];
    config = {};
    consent = null;
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
    const handle = await am.beginTwoStep(FIRST, { binding: 'browser-1', ip: '1.2.3.4', userAgent: 'Chrome' });
    expect(am.pendingSignIn(handle, 'another-browser')).toBeNull();
    expect(await am.sendEmailApproval(handle, 'browser-1')).toBe('sent');
    expect(sent.at(-1).to).toBe('molly@example.com');
    expect(await am.sendEmailApproval(handle, 'browser-1')).toBe('too-soon');

    const token = linkToken();
    expect(await am.approvalDetails(token)).toMatchObject({ username: 'molly', ip: '1.2.3.4', userAgent: 'Chrome' });
    expect(am.completeTwoStep(handle, 'browser-1')).toBeNull();
    expect(await am.approveByToken(token)).toBe('molly');
    expect(await am.approveByToken(token)).toBeNull();

    expect(am.completeTwoStep(handle, 'another-browser')).toBeNull();
    const done = am.completeTwoStep(handle, 'browser-1');
    expect(done?.result.factors?.map((f) => f.provider)).toEqual(['password', 'email-link']);
    expect(am.signInRecord(done!.result)).toMatchObject({ amr: ['pwd', 'email'], aal: 1, acr: 'aal1' });
    expect(am.completeTwoStep(handle, 'browser-1')).toBeNull();
  });

  test('#1532: the message and the page say which site, when in the person\'s own time zone, and from what browser', async () => {
    const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-02T18:02:00Z'));
      const am = await enrolled();
      const handle = await am.beginTwoStep(FIRST, { binding: 'b', ip: '1.2.3.4', userAgent: CHROME_WINDOWS });
      expect(await am.sendEmailApproval(handle, 'b')).toBe('sent');
      const mail = sent.at(-1);
      expect(mail.subject).toBe('Approve or deny a sign-in to Willeke Family');
      // Sabotage check: formatting in UTC instead of molly's zone shows 18:02 and turns this red.
      expect(mail.text).toMatch(/^A sign-in request for Willeke Family was sent at .*2026.*14:02 EDT from Chrome on Windows at IP address 1\.2\.3\.4\.$/m);
      expect(mail.text).toMatch(/^Was this you\? Open to approve or deny: https:\/\/wiki\.example\.com\/login\/approve\?t=/m);
      expect(await am.approvalDetails(linkToken())).toMatchObject({
        site: 'Willeke Family', device: 'Chrome on Windows', when: expect.stringMatching(/14:02 EDT/)
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test('#1532: a browser it cannot name is left out of the message, not guessed', async () => {
    const am = await enrolled();
    const handle = await am.beginTwoStep(FIRST, { binding: 'b', userAgent: 'curl/8.4.0' });
    await am.sendEmailApproval(handle, 'b');
    expect(sent.at(-1).text).toMatch(/^A sign-in request for Willeke Family was sent at [^\n]* [A-Z]{2,5}\.$/m);
    expect(await am.approvalDetails(linkToken())).toMatchObject({ device: null });
  });

  test('#1916: an approval email that cannot be sent says so, leaves no live link, and does not block a retry', async () => {
    const am = await enrolled();
    const handle = await am.beginTwoStep(FIRST, { binding: 'b' });
    mailFails = true;
    expect(await am.sendEmailApproval(handle, 'b')).toBe('failed');
    expect(am.pendingSignIn(handle, 'b')?.lastSentAt).toBeUndefined();
    mailFails = false;
    expect(await am.sendEmailApproval(handle, 'b')).toBe('sent');
  });

  test('"this wasn\'t me" refuses the waiting sign-in for good', async () => {
    const am = await enrolled();
    const handle = await am.beginTwoStep(FIRST, { binding: 'b' });
    await am.sendEmailApproval(handle, 'b');
    const token = linkToken();
    expect(await am.denyByToken(token)).toBe('molly');
    expect(am.pendingSignIn(handle, 'b')?.denied).toBe(true);
    expect(await am.approveByToken(token)).toBeNull();
    expect(am.completeTwoStep(handle, 'b')).toBeNull();
  });

  test('a pending sign-in expires after 10 minutes', async () => {
    vi.useFakeTimers();
    try {
      const am = await enrolled();
      const handle = await am.beginTwoStep(FIRST, { binding: 'b' });
      vi.advanceTimersByTime(10 * 60_000 + 1);
      expect(am.pendingSignIn(handle, 'b')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('#1532: where it came from — the IP address and roughly where', () => {
    test('the message and the page say the IP and the place; every value is escaped in HTML', async () => {
      const am = await enrolled();
      const handle = await am.beginTwoStep(FIRST, { binding: 'b', ip: '81.2.69.160', userAgent: 'curl/8', location: 'Columbus, <b>United</b> States' });
      await am.sendEmailApproval(handle, 'b');
      const mail = sent.at(-1) as unknown as { text: string; html: string };
      expect(mail.text).toMatch(/ from IP address 81\.2\.69\.160, near Columbus, <b>United<\/b> States\.$/m);
      // Sabotage check: dropping escapeHtml on the place puts a live <b> tag in the email and turns this red.
      expect(mail.html).toContain('near Columbus, &lt;b&gt;United&lt;/b&gt; States.');
      expect(mail.html).not.toContain('<b>');
      const details = await am.approvalDetails(linkToken());
      expect(details).toMatchObject({ ip: '81.2.69.160', location: 'Columbus, <b>United</b> States' });
      expect(details!.sentenceHtml).toContain('<strong>Willeke Family</strong>');
      expect(details!.sentenceHtml).toContain('&lt;b&gt;United&lt;/b&gt;');
    });

    test('with no location source, no place is said', async () => {
      const am = await enrolled();
      const handle = await am.beginTwoStep(FIRST, { binding: 'b', ip: '81.2.69.160' });
      await am.sendEmailApproval(handle, 'b');
      expect(sent.at(-1).text).toMatch(/ from IP address 81\.2\.69\.160\.$/m);
      expect(sent.at(-1).text).not.toContain('near');
    });

    test('approximateLocation reads the configuration when asked: Cloudflare headers only when behind Cloudflare', async () => {
      const am = await enrolled();
      const req = { ip: '203.0.113.9', get: (h: string) => ({ 'cf-ipcity': 'Columbus', 'cf-ipcountry': 'US' } as Record<string, string>)[h] };
      expect(await am.approximateLocation(req)).toBeNull();
      config['ngdpbase.server.behind-cloudflare'] = true;
      expect(await am.approximateLocation(req)).toBe('Columbus, United States');
    });
  });

  describe('#1532: which sign-ins take the second step', () => {
    const factor = (provider: string, amr: string[], aal: 1 | 2 | 3) => ({ provider, amr, aal, at: new Date().toISOString() });

    test('a password, or an outside provider at AAL1: yes, when a second factor is enrolled', async () => {
      const am = await enrolled();
      expect(am.needsSecondStep(FIRST)).toBe(true);
      expect(am.needsSecondStep({ success: true, username: 'molly', provider: 'oidc:idp', factors: [factor('oidc:idp', [], 1)] })).toBe(true);
    });

    test('an email link, a passkey, or an outside provider at AAL2: no', async () => {
      const am = await enrolled();
      expect(am.needsSecondStep({ success: true, username: 'molly', provider: 'magic-link', factors: [factor('magic-link', ['email'], 1)] })).toBe(false);
      expect(am.needsSecondStep({ success: true, username: 'molly', provider: 'passkey', factors: [{ ...factor('passkey', ['hwk', 'user'], 2), acr: 'phr' as const }] })).toBe(false);
      expect(am.needsSecondStep({ success: true, username: 'molly', provider: 'oidc:idp', factors: [factor('oidc:idp', ['pwd', 'mfa'], 2)] })).toBe(false);
    });

    test('no second factor enrolled, or a failed first step: no', async () => {
      const am = await started();
      expect(am.needsSecondStep(FIRST)).toBe(false);
      expect(am.needsSecondStep({ success: false })).toBe(false);
    });
  });

  describe('#1532: every step of the approval is audited, as one trail', () => {
    const steps = () => audit.filter((e) => String(e.eventType).startsWith('signinapproval-'));

    test('request, open, approve: each tied to the waiting sign-in by an id, never the handle or the link token', async () => {
      const am = await enrolled();
      const handle = await am.beginTwoStep(FIRST, { binding: 'b', ip: '81.2.69.160', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36', location: 'Columbus, United States' });
      await am.sendEmailApproval(handle, 'b');
      const token = linkToken();
      const id = am.pendingSignIn(handle, 'b')!.id;
      await am.approvalDetails(token, { ip: '198.51.100.7', userAgent: 'Mozilla/5.0 (iPhone) Safari/605.1' });
      await am.approveByToken(token, { ip: '198.51.100.7', userAgent: 'Mozilla/5.0 (iPhone) Safari/605.1' });
      const trail = steps();
      expect(trail.map((e) => e.eventType)).toEqual(['signinapproval-request', 'signinapproval-open', 'signinapproval-approve']);
      for (const e of trail) {
        expect(e).toMatchObject({ user: 'molly', resource: id, resourceType: 'sign-in', metadata: expect.objectContaining({ pendingSignIn: id }) });
        // Sabotage check: recording the handle or the token as the id turns these red.
        expect(JSON.stringify(e)).not.toContain(handle);
        expect(JSON.stringify(e)).not.toContain(token);
      }
      expect(trail[0]).toMatchObject({ ipAddress: '81.2.69.160', result: 'success', metadata: expect.objectContaining({ location: 'Columbus, United States', browser: 'Chrome on Windows' }) });
      expect(trail[1]).toMatchObject({ ipAddress: '198.51.100.7', metadata: expect.objectContaining({ device: 'Safari on iPhone' }) });
      expect(trail[2]).toMatchObject({ ipAddress: '198.51.100.7', result: 'success' });
    });

    test('deny', async () => {
      const am = await enrolled();
      const handle = await am.beginTwoStep(FIRST, { binding: 'b' });
      await am.sendEmailApproval(handle, 'b');
      await am.denyByToken(linkToken(), { ip: '198.51.100.7' });
      expect(steps().at(-1)).toMatchObject({ eventType: 'signinapproval-deny', result: 'deny', severity: 'high', ipAddress: '198.51.100.7' });
    });

    test('throttle: a second message asked for within the minute', async () => {
      const am = await enrolled();
      const handle = await am.beginTwoStep(FIRST, { binding: 'b' });
      await am.sendEmailApproval(handle, 'b');
      expect(await am.sendEmailApproval(handle, 'b')).toBe('too-soon');
      expect(steps().map((e) => e.eventType)).toEqual(['signinapproval-request', 'signinapproval-throttle']);
    });

    test('sendfail: the transport failed', async () => {
      const am = await enrolled();
      const handle = await am.beginTwoStep(FIRST, { binding: 'b' });
      mailFails = true;
      expect(await am.sendEmailApproval(handle, 'b')).toBe('failed');
      expect(steps()).toEqual([expect.objectContaining({ eventType: 'signinapproval-sendfail', result: 'error', metadata: expect.objectContaining({ reason: 'the message could not be sent' }) })]);
    });

    test('abandon: the waiting browser cancelled; the sign-in is gone, and recorded once', async () => {
      const am = await enrolled();
      const handle = await am.beginTwoStep(FIRST, { binding: 'b' });
      await am.abandonTwoStep(handle, 'b', { ip: '81.2.69.160' });
      expect(am.pendingSignIn(handle, 'b')).toBeNull();
      expect(steps()).toEqual([expect.objectContaining({ eventType: 'signinapproval-abandon', ipAddress: '81.2.69.160', metadata: expect.objectContaining({ state: 'waiting' }) })]);
      await am.abandonTwoStep(handle, 'b');
      expect(steps()).toHaveLength(1);
    });

    test('expire: recorded once when the time runs out, without anyone looking', async () => {
      vi.useFakeTimers();
      try {
        const am = await enrolled();
        const handle = await am.beginTwoStep(FIRST, { binding: 'b', ip: '81.2.69.160' });
        await am.sendEmailApproval(handle, 'b');
        // Sabotage check: without the timer in beginTwoStep nothing is recorded until someone looks, and this is red.
        await vi.advanceTimersByTimeAsync(10 * 60_000 + 5);
        expect(steps().map((e) => e.eventType)).toEqual(['signinapproval-request', 'signinapproval-expire']);
        expect(steps().at(-1)).toMatchObject({ ipAddress: '81.2.69.160', metadata: expect.objectContaining({ state: 'waiting', messageSent: true }) });
        expect(am.pendingSignIn(handle, 'b')).toBeNull();
        expect(steps()).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
  /**
   * #1532 with #1603: a sign-in that takes the approval step is approved
   * first; the terms are asked only when it completes (completeSignIn), never
   * while it waits. Sabotage: asking in beginTwoStep would call pendingFor
   * before the approval and turn this red.
   */
  test('the approval step comes first, then the terms prompt at completion', async () => {
    consent = { pendingFor: vi.fn(async () => [{ id: 'terms-of-service', version: '1' }]) };
    const am = await enrolled();
    expect(am.needsSecondStep(FIRST)).toBe(true);
    const handle = await am.beginTwoStep(FIRST, { binding: 'b' });
    expect(await am.sendEmailApproval(handle, 'b')).toBe('sent');
    expect(await am.approveByToken(linkToken())).toBe('molly');
    expect(consent.pendingFor).not.toHaveBeenCalled();

    const done = am.completeTwoStep(handle, 'b');
    const session: Record<string, unknown> = {
      regenerate: (cb: (err?: unknown) => void) => cb(),
      save: (cb: (err?: unknown) => void) => cb()
    };
    const req = { session, ip: '1.2.3.4', get: () => undefined } as never;
    const completed = await am.completeSignIn(req, done!.result, { method: 'password and email link', returnTo: '/view/Main' });
    expect(consent.pendingFor).toHaveBeenCalledWith('molly');
    expect(completed.next).toBe(`/consent?returnTo=${encodeURIComponent('/view/Main')}`);
    expect(session).toMatchObject({ username: 'molly', isAuthenticated: true, consentPending: true });
  });
});
