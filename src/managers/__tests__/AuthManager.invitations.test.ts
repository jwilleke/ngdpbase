/**
 * #2049 — invitations: a one-time email link for an account made without a
 * password. Sent, resent, cancelled and expired under `user-create`; used
 * once, signing the user in through completeSignIn; stored hashed in the
 * credentials store, so it survives a restart; each step audited. A real
 * FileCredentialsProvider in a temp directory; the temp directory is all
 * that is removed.
 *
 * Sabotage done once each, and seen red (then restored):
 * - useInvitation not spending the row → "single use" and "two at once" failed;
 *   spending it without reading remove()'s answer → "two at once" failed;
 * - invitationTokenHash returning the token → "hashed at rest" failed;
 * - inviteUser's mayInvite check removed → "only user-create" failed;
 * - liveInvitation without the expiry check → "expired" failed;
 * - inviteUser not checking invitationsUnavailable → "email not set up" failed;
 * - no invitation-send record → "send", "refuse on failure" and "send that fails" failed;
 * - no invitation-use record → "use" and "single use" failed;
 * - resend not ending the old link → "resend" failed;
 * - FileCredentialsProvider.add not saving → "survives a restart" and "hashed at rest" failed;
 * - closeAccess without its invitations step → "deleting the account" failed.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AuthManager from '../AuthManager';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

interface Account { username: string; email?: string; displayName?: string; isActive?: boolean; isExternal?: boolean; lastLogin?: string; loginCount?: number; password?: string; createdAt?: string }

const subject = (username: string) => ({ username, roles: [username === 'admin' ? 'admin' : 'reader'], isAuthenticated: true, ipAddress: '198.51.100.1' }) as never;
const ADMIN = subject('admin');
const READER = subject('reader');

function fakeReq() {
  const session: Record<string, unknown> = {
    id: 'pre', csrfToken: 'pre-token',
    regenerate: vi.fn((cb: (err?: unknown) => void) => {
      for (const k of Object.keys(session)) if (k !== 'regenerate' && k !== 'save') delete session[k];
      session.id = 'fresh';
      cb();
    }),
    save: vi.fn((cb: (err?: unknown) => void) => cb())
  };
  return { session, ip: '203.0.113.9', get: (h: string) => (h.toLowerCase() === 'user-agent' ? 'TestAgent/1.0' : undefined) } as never as { session: Record<string, unknown> };
}

describe('invitations (#2049)', () => {
  let dir: string;
  let file: string;
  let config: Record<string, unknown>;
  let accounts: Record<string, Account>;
  let sent: Array<{ ctx: { username?: string }; to: string; subject: string; text: string; html?: string }>;
  let mail: { enabled: boolean; failing: boolean; rejects: boolean };
  let audit: Array<Record<string, unknown>>;
  let auditFailsFor: string | null;
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
      PolicyDecisionPoint: {
        permits: (s: { username: string }, action: string) => Promise.resolve(s.username === 'admin' && ['user-create', 'user-edit'].includes(action)),
        holds: (s: { username: string }, action: string) => Promise.resolve(s.username === 'admin' && ['user-read', 'user-create', 'user-edit'].includes(action))
      },
      UserManager: {
        getUser: (u: string) => Promise.resolve(accounts[u] ? { ...accounts[u] } : undefined),
        hasPassword: (u: string) => Promise.resolve(Boolean(accounts[u]?.password)),
        recordSignIn: (u: string) => { if (accounts[u]) { accounts[u].loginCount = (accounts[u].loginCount ?? 0) + 1; accounts[u].lastLogin = new Date().toISOString(); } return Promise.resolve(); },
        deleteUserSessions: () => Promise.resolve(0)
      },
      EmailManager: {
        isEnabled: () => mail.enabled,
        isDeliveryFailing: () => mail.failing,
        sendTo: (ctx: { username?: string }, to: string, subj: string, text: string, html?: string) => {
          if (mail.rejects) return Promise.reject(new Error('smtp down'));
          sent.push({ ctx, to, subject: subj, text, html });
          return Promise.resolve();
        }
      },
      PluginManager: TEST_PLUGIN_MANAGER,
      AuditManager: {
        logAuditEvent: (e: Record<string, unknown>) => {
          if (auditFailsFor && e.eventType === auditFailsFor) return Promise.reject(new Error('audit disk full'));
          audit.push(e);
          return Promise.resolve('evt');
        },
        flushAuditQueue: () => Promise.resolve(),
        logAuthentication: (c: Record<string, unknown>, result: string, reason: string) => { audit.push({ eventType: `authentication-${result}`, ...c, reason }); return Promise.resolve('a'); }
      }
    };
    const manager = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  const linkToken = (i = -1): string => /\/invitation\?t=([\w-]+)/.exec(sent.at(i).text)[1];
  const events = (type: string) => audit.filter((e) => e.eventType === type);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-2049-invite-'));
    file = path.join(dir, 'users', 'credentials.json');
    process.env[CREDENTIALS_KEY_ENV] = 'test-credentials-key-not-a-secret';
    config = {};
    accounts = {
      admin: { username: 'admin', email: 'admin@example.com', password: 'hash', loginCount: 3, lastLogin: '2026-10-01T00:00:00Z' },
      newbie: { username: 'newbie', email: 'newbie@example.com', displayName: 'New Bie', loginCount: 0, createdAt: '2026-10-25T00:00:00Z' }
    };
    sent = [];
    mail = { enabled: true, failing: false, rejects: false };
    audit = [];
    auditFailsFor = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('send: an email with a one-time link, through EmailManager with the sender\'s context, recorded first', async () => {
    const am = await started();
    const out = await am.inviteUser(ADMIN, 'newbie');
    expect(out).toMatchObject({ outcome: 'sent', invitation: { username: 'newbie', createdBy: 'admin' } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'newbie@example.com', subject: 'You are invited to Willeke Family' });
    expect(sent[0].ctx).toBe(ADMIN);
    expect(sent[0].text).toContain('https://wiki.example.com/invitation?t=');
    expect(sent[0].text).toContain('works once');
    const [send] = events('invitation-send');
    expect(send).toMatchObject({ user: 'admin', resource: 'newbie', resourceType: 'user' });
    expect(JSON.stringify(send)).not.toContain(linkToken());
  });

  test('hashed at rest: the file holds the token\'s SHA-256, never the token', async () => {
    const am = await started();
    await am.inviteUser(ADMIN, 'newbie');
    const token = linkToken();
    const stored = fs.readFileSync(file, 'utf8');
    expect(stored).not.toContain(token);
    expect(stored).toContain(createHash('sha256').update(token).digest('hex'));
  });

  test('only a holder of user-create may send, resend or cancel', async () => {
    const am = await started();
    await expect(am.inviteUser(READER, 'newbie')).rejects.toThrow('Permission denied');
    expect(sent).toHaveLength(0);
    expect(fs.existsSync(file)).toBe(false);
    await am.inviteUser(ADMIN, 'newbie');
    await expect(am.cancelInvitation(READER, 'newbie')).rejects.toThrow('Permission denied');
    await expect(am.listInvitations(READER)).rejects.toThrow('Permission denied');
    expect(await am.invitationFor(linkToken())).toMatchObject({ username: 'newbie' });
  });

  test('use: opening shows it and changes nothing; using signs the user in once, at AAL1 as an email link, to the setup page', async () => {
    const am = await started();
    await am.inviteUser(ADMIN, 'newbie');
    const token = linkToken();
    expect(await am.invitationFor(token)).toMatchObject({ username: 'newbie', displayName: 'New Bie' });
    expect(await am.invitationFor(token)).not.toBeNull();

    const req = fakeReq();
    expect(await am.useInvitation(req as never, token)).toBe('/account/setup');
    expect(req.session.username).toBe('newbie');
    expect(req.session.isAuthenticated).toBe(true);
    expect(req.session.signIn).toMatchObject({ provider: 'invitation', amr: ['email'], aal: 1 });
    expect(events('invitation-use')).toEqual([expect.objectContaining({ user: 'newbie', ipAddress: '203.0.113.9', resource: 'newbie' })]);
    expect(events('authentication-success')).toEqual([expect.objectContaining({ username: 'newbie', loginMethod: 'invitation' })]);
  });

  test('single use: a second open or use of the same link is refused', async () => {
    const am = await started();
    await am.inviteUser(ADMIN, 'newbie');
    const token = linkToken();
    expect(await am.useInvitation(fakeReq() as never, token)).toBe('/account/setup');
    expect(await am.invitationFor(token)).toBeNull();
    const second = fakeReq();
    expect(await am.useInvitation(second as never, token)).toBeNull();
    expect(second.session.username).toBeUndefined();
    expect(events('invitation-use')).toHaveLength(1);
  });

  test('two uses at once: exactly one signs in', async () => {
    const am = await started();
    await am.inviteUser(ADMIN, 'newbie');
    const token = linkToken();
    const results = await Promise.all([am.useInvitation(fakeReq() as never, token), am.useInvitation(fakeReq() as never, token)]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  test('the terms come first when there are terms to accept, then the setup page', async () => {
    const am = await started();
    (am as unknown as { engine: { getManager: (n: string) => unknown } }).engine = {
      getManager: ((orig) => (n: string) => n === 'ConsentManager' ? { pendingFor: () => Promise.resolve([{ id: 'terms' }]) } : orig(n))(
        (am as unknown as { engine: { getManager: (n: string) => unknown } }).engine.getManager)
    };
    await am.inviteUser(ADMIN, 'newbie');
    expect(await am.useInvitation(fakeReq() as never, linkToken())).toBe('/consent?returnTo=%2Faccount%2Fsetup');
  });

  test('expired: refused after ttl-days, removed, and recorded as invitation-expire once', async () => {
    config['ngdpbase.auth.invitation.ttl-days'] = 2;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    const am = await started();
    const out = await am.inviteUser(ADMIN, 'newbie');
    expect(out.outcome === 'sent' && out.invitation.expiresAt).toBe('2026-10-27T12:00:00.000Z');
    const token = linkToken();
    vi.setSystemTime(new Date('2026-10-27T12:00:01Z'));
    expect(await am.invitationFor(token)).toBeNull();
    expect(await am.useInvitation(fakeReq() as never, token)).toBeNull();
    expect(await am.listInvitations(ADMIN)).toEqual([]);
    expect(events('invitation-expire')).toEqual([expect.objectContaining({ resource: 'newbie' })]);
  });

  test('expiry is swept when the list is read, even if the link is never opened', async () => {
    config['ngdpbase.auth.invitation.ttl-days'] = 1;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    const am = await started();
    await am.inviteUser(ADMIN, 'newbie');
    expect(await am.listInvitations(ADMIN)).toHaveLength(1);
    vi.setSystemTime(new Date('2026-10-27T00:00:00Z'));
    expect(await am.listInvitations(ADMIN)).toEqual([]);
    expect(events('invitation-expire')).toHaveLength(1);
  });

  test('survives a restart: a new AuthManager on the same store accepts the link', async () => {
    const first = await started();
    await first.inviteUser(ADMIN, 'newbie');
    const token = linkToken();
    const second = await started();
    expect(await second.invitationFor(token)).toMatchObject({ username: 'newbie' });
    expect(await second.listInvitations(ADMIN)).toEqual([expect.objectContaining({ username: 'newbie', createdBy: 'admin' })]);
    expect(await second.useInvitation(fakeReq() as never, token)).toBe('/account/setup');
  });

  test('resend: a new link, and the old one stops working', async () => {
    const am = await started();
    await am.inviteUser(ADMIN, 'newbie');
    const old = linkToken();
    await am.inviteUser(ADMIN, 'newbie');
    const fresh = linkToken();
    expect(fresh).not.toBe(old);
    expect(await am.invitationFor(old)).toBeNull();
    expect(await am.invitationFor(fresh)).not.toBeNull();
    expect(await am.listInvitations(ADMIN)).toHaveLength(1);
    expect(events('invitation-cancel')).toEqual([expect.objectContaining({ user: 'admin', resource: 'newbie', reason: 'replaced' })]);
  });

  test('cancel: the link stops working, recorded; cancelling nothing says so', async () => {
    const am = await started();
    await am.inviteUser(ADMIN, 'newbie');
    const token = linkToken();
    expect(await am.cancelInvitation(ADMIN, 'newbie')).toBe(true);
    expect(await am.invitationFor(token)).toBeNull();
    expect(await am.useInvitation(fakeReq() as never, token)).toBeNull();
    expect(await am.cancelInvitation(ADMIN, 'newbie')).toBe(false);
    expect(events('invitation-cancel')).toEqual([expect.objectContaining({ user: 'admin', resource: 'newbie', reason: 'cancelled' })]);
  });

  test('email not set up, or failing: nothing is kept or sent, and the answer says why', async () => {
    mail.enabled = false;
    const am = await started();
    expect(await am.inviteUser(ADMIN, 'newbie')).toEqual({ outcome: 'email-unavailable', reason: expect.stringContaining('Email is not set up') });
    expect(am.invitationsUnavailable()).toContain('Email is not set up');
    mail.enabled = true;
    mail.failing = true;
    expect(await am.inviteUser(ADMIN, 'newbie')).toEqual({ outcome: 'email-unavailable', reason: expect.stringContaining('not working') });
    expect(sent).toHaveLength(0);
    expect(events('invitation-send')).toHaveLength(0);
    expect(await am.listInvitations(ADMIN)).toEqual([]);
  });

  test('a send that fails removes the link again, recorded as cancelled (not-sent), and says the admin can set a password', async () => {
    mail.rejects = true;
    const am = await started();
    const out = await am.inviteUser(ADMIN, 'newbie');
    expect(out).toEqual({ outcome: 'send-failed', reason: expect.stringContaining('set a password') });
    expect(await am.listInvitations(ADMIN)).toEqual([]);
    expect(events('invitation-send')).toHaveLength(1);
    expect(events('invitation-cancel')).toEqual([expect.objectContaining({ reason: 'not-sent' })]);
  });

  test('refuse on failure: when invitation-send cannot be recorded, no link exists and nothing is sent', async () => {
    auditFailsFor = 'invitation-send';
    const am = await started();
    await expect(am.inviteUser(ADMIN, 'newbie')).rejects.toThrow();
    expect(sent).toHaveLength(0);
    expect(await am.listInvitations(ADMIN)).toEqual([]);
  });

  test('an account with a way in already, or no email, is not invited', async () => {
    const am = await started();
    expect(await am.inviteUser(ADMIN, 'admin')).toMatchObject({ outcome: 'not-invitable', reason: 'The account already has a password.' });
    accounts.nomail = { username: 'nomail', loginCount: 0 };
    expect(await am.inviteUser(ADMIN, 'nomail')).toMatchObject({ outcome: 'not-invitable' });
    expect(await am.inviteUser(ADMIN, 'ghost')).toMatchObject({ outcome: 'not-invitable' });
    expect(sent).toHaveLength(0);
  });

  test('a turned-off account cannot use its invitation', async () => {
    const am = await started();
    await am.inviteUser(ADMIN, 'newbie');
    accounts.newbie.isActive = false;
    expect(await am.invitationFor(linkToken())).toBeNull();
    expect(await am.useInvitation(fakeReq() as never, linkToken())).toBeNull();
  });

  test('not a sign-in method: never listed with the account\'s credentials; deleting the account cancels it', async () => {
    const am = await started();
    await am.inviteUser(ADMIN, 'newbie');
    expect(await am.listCredentials(ADMIN, 'newbie')).toEqual([]);
    await am.closeAccess('newbie', 'delete', ADMIN);
    expect(await am.invitationFor(linkToken())).toBeNull();
    expect(events('invitation-cancel')).toEqual([expect.objectContaining({ reason: 'account-deleted' })]);
  });
});
