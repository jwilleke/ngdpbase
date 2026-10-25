/**
 * #2073 — a user's own email changes only when they click a link sent to the
 * new address (operator, 2026-10-25). AuthManager sends the link, keeps it
 * (single use, expiring, bound to the account and the address), and on the
 * confirm checks the rules again and saves through UserManager under the
 * system context. Nobody is signed in; the request and the confirm are
 * audited with names, never an address.
 *
 * Sabotaged once each (2026-10-25), and watched go red:
 * - the link not spent on use → "single use";
 * - the expiry not checked → "expires";
 * - the confirm's re-check of a turned-off account removed → "the rules are checked again";
 * - the address put in the audit metadata → "audited with names only";
 * - mail-less sites sending anyway → "a site that cannot send email";
 * - the cooldown not checked → "a second link too soon is not sent";
 * - the cap not checked → "no more than the cap in a window".
 */
import AuthManager from '../AuthManager';
import { UserCreateError } from '../../utils/userCreateError';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';

interface Sent { to: string; subject: string; text: string }

function setup(opts: { mail?: boolean; failing?: boolean; ttl?: number; settings?: Record<string, number> } = {}) {
  const accounts: Record<string, { username: string; email: string; isActive?: boolean; profileLocked?: boolean }> = {
    pat: { username: 'pat', email: 'pat@old.example' },
    dee: { username: 'dee', email: '' }
  };
  const sent: Sent[] = [];
  const audit: Array<Record<string, unknown>> = [];
  const updates: Array<{ username: string; patch: Record<string, unknown>; ctx: Record<string, unknown> }> = [];
  const offered: string[] = [];
  let refuseUpdate: Error | null = null;
  const managers: Record<string, unknown> = {
    ConfigurationManager: {
      // The throttle is off unless a test sets it, so the other tests can ask more than once.
      getProperty: (k: string, d: unknown) => (k === 'ngdpbase.auth.email-change.ttl-minutes' ? opts.ttl ?? d : k === 'ngdpbase.system.principal' ? 'svc'
        : k in (opts.settings ?? {}) ? opts.settings?.[k] : k === 'ngdpbase.auth.email-change.cooldown-seconds' ? 0 : d),
      isBaseUrlExplicit: () => true,
      getBaseURL: () => 'https://site.example',
      getApplicationName: () => 'Test Site'
    },
    ...(opts.mail === false ? {} : {
      EmailManager: {
        send: (m: Sent) => { sent.push(m); return Promise.resolve(); },
        isDeliveryFailing: () => opts.failing === true
      }
    }),
    UserManager: {
      getUser: (u: string) => Promise.resolve(accounts[u] ? { ...accounts[u] } : undefined),
      updateUser: (username: string, patch: Record<string, unknown>, ctx: Record<string, unknown>) => {
        if (refuseUpdate) return Promise.reject(refuseUpdate);
        updates.push({ username, patch, ctx });
        Object.assign(accounts[username], patch);
        return Promise.resolve(accounts[username]);
      }
    },
    IdentityManager: { offerSignUpLink: (_ctx: unknown, u: string) => { offered.push(u); return Promise.resolve('sent'); } },
    AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audit.push(e); return Promise.resolve('a'); } },
    PluginManager: TEST_PLUGIN_MANAGER
  };
  const am = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
  const pat = { username: 'pat', isAuthenticated: true, roles: ['reader'] };
  const tokenFrom = (m: Sent | undefined): string => /\/account\/email\/confirm\?t=([A-Za-z0-9_-]+)/.exec(m?.text ?? '')?.[1] ?? '';
  return { am, accounts, sent, audit, updates, offered, pat, tokenFrom, refuse: (e: Error | null) => { refuseUpdate = e; } };
}

describe('a user\'s own email change waits for its link (#2073)', () => {
  test('a link goes to the new address, the old one is told with no link, and the account keeps its old email', async () => {
    const t = setup();
    expect(await t.am.requestEmailChange(t.pat, 'pat', ' pat@new.example ', 'profile')).toBe('sent');
    expect(t.sent.map((m) => m.to)).toEqual(['pat@new.example', 'pat@old.example']);
    expect(t.tokenFrom(t.sent[0])).not.toBe('');
    expect(t.sent[1].text).not.toMatch(/\/account\/email\/confirm/);
    expect(t.accounts.pat.email).toBe('pat@old.example');
    expect(t.updates).toEqual([]);
    expect(t.am.pendingEmailChange('pat')).toBe('pat@new.example');
  });

  test('clicking it saves the new email through UserManager under the system context, and signs nobody in', async () => {
    const t = setup();
    await t.am.requestEmailChange(t.pat, 'pat', 'pat@new.example', 'profile');
    const token = t.tokenFrom(t.sent[0]);
    expect(t.am.emailChangeOffer(token)).toEqual({ username: 'pat', address: 'pat@new.example' });
    expect(await t.am.confirmEmailChange(token)).toEqual({ outcome: 'changed', username: 'pat' });
    expect(t.updates).toEqual([{ username: 'pat', patch: { email: 'pat@new.example' }, ctx: expect.objectContaining({ username: 'system', origin: 'boot' }) }]);
    expect(t.am.pendingEmailChange('pat')).toBeNull();
  });

  test('single use: a link works once', async () => {
    const t = setup();
    await t.am.requestEmailChange(t.pat, 'pat', 'pat@new.example', 'profile');
    const token = t.tokenFrom(t.sent[0]);
    expect((await t.am.confirmEmailChange(token)).outcome).toBe('changed');
    expect(await t.am.confirmEmailChange(token)).toEqual({ outcome: 'expired' });
    expect(t.updates).toHaveLength(1);
  });

  test('expires: after the configured minutes nothing changes', async () => {
    const t = setup({ ttl: 1 });
    vi.useFakeTimers();
    try {
      await t.am.requestEmailChange(t.pat, 'pat', 'pat@new.example', 'profile');
      const token = t.tokenFrom(t.sent[0]);
      vi.advanceTimersByTime(61_000);
      expect(t.am.emailChangeOffer(token)).toBeNull();
      expect(await t.am.confirmEmailChange(token)).toEqual({ outcome: 'expired' });
      expect(t.updates).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a newer request replaces the older link', async () => {
    const t = setup();
    await t.am.requestEmailChange(t.pat, 'pat', 'first@new.example', 'profile');
    const first = t.tokenFrom(t.sent[0]);
    await t.am.requestEmailChange(t.pat, 'pat', 'second@new.example', 'profile');
    expect(await t.am.confirmEmailChange(first)).toEqual({ outcome: 'expired' });
    expect(t.am.pendingEmailChange('pat')).toBe('second@new.example');
  });

  test('the rules are checked again at the click: a turned-off or shared account, or UserManager\'s refusal, changes nothing', async () => {
    for (const change of [{ isActive: false }, { profileLocked: true }]) {
      const t = setup();
      await t.am.requestEmailChange(t.pat, 'pat', 'pat@new.example', 'profile');
      Object.assign(t.accounts.pat, change);
      expect(await t.am.confirmEmailChange(t.tokenFrom(t.sent[0]))).toMatchObject({ outcome: 'refused' });
      expect(t.updates).toEqual([]);
    }
    const t = setup();
    await t.am.requestEmailChange(t.pat, 'pat', 'root@site.example', 'profile');
    t.refuse(new UserCreateError('admin-email-shared', 'root holds it'));
    expect(await t.am.confirmEmailChange(t.tokenFrom(t.sent[0]))).toEqual({ outcome: 'refused', message: 'That email address cannot be used. Please use another.' });
  });

  test('only the account itself asks; an unchanged address sends nothing', async () => {
    const t = setup();
    await expect(t.am.requestEmailChange({ username: 'sam', isAuthenticated: true, roles: [] }, 'pat', 'x@new.example', 'profile')).rejects.toThrow(/Permission denied/);
    expect(await t.am.requestEmailChange(t.pat, 'pat', 'PAT@old.example', 'profile')).toBe('unchanged');
    expect(t.sent).toEqual([]);
  });

  test('a site that cannot send email sends nothing and keeps no link', async () => {
    for (const opts of [{ mail: false }, { failing: true }]) {
      const t = setup(opts);
      expect(await t.am.requestEmailChange(t.pat, 'pat', 'pat@new.example', 'profile')).toBe('unavailable');
      expect(t.sent).toEqual([]);
      expect(t.am.pendingEmailChange('pat')).toBeNull();
    }
  });

  test('audited with names only: the request and the confirm name the account, never an address', async () => {
    const t = setup();
    await t.am.requestEmailChange(t.pat, 'pat', 'pat@new.example', 'profile');
    await t.am.confirmEmailChange(t.tokenFrom(t.sent[0]));
    expect(t.audit.map((e) => e.eventType)).toEqual(['emailchange-request', 'emailchange-confirm']);
    expect(t.audit[0]).toMatchObject({ user: 'pat', resource: 'pat', metadata: expect.objectContaining({ username: 'pat', via: 'profile' }) });
    expect(JSON.stringify(t.audit)).not.toMatch(/example/);
  });

  test('a registration\'s first email, once confirmed, is offered its contact record (#1930)', async () => {
    const t = setup();
    const dee = { username: 'dee', isAuthenticated: false, roles: [] };
    expect(await t.am.requestEmailChange(dee, 'dee', 'dee@new.example', 'registration')).toBe('sent');
    expect(t.sent.map((m) => m.to)).toEqual(['dee@new.example']);
    await t.am.confirmEmailChange(t.tokenFrom(t.sent[0]));
    expect(t.offered).toEqual(['dee']);
  });

  describe('throttled per account (#2073)', () => {
    const SETTINGS = { 'ngdpbase.auth.email-change.cooldown-seconds': 60, 'ngdpbase.auth.email-change.max-per-window': 3, 'ngdpbase.auth.email-change.window-minutes': 60 };

    test('a second link too soon is not sent; after the cooldown it is', async () => {
      vi.useFakeTimers();
      try {
        const t = setup({ settings: SETTINGS });
        expect(await t.am.requestEmailChange(t.pat, 'pat', 'a@new.example', 'profile')).toBe('sent');
        const mails = t.sent.length;
        expect(await t.am.requestEmailChange(t.pat, 'pat', 'b@new.example', 'profile')).toBe('throttled');
        expect(t.sent).toHaveLength(mails);
        expect(t.am.pendingEmailChange('pat')).toBe('a@new.example');
        vi.advanceTimersByTime(61_000);
        expect(await t.am.requestEmailChange(t.pat, 'pat', 'b@new.example', 'profile')).toBe('sent');
        // Another account is not held back by pat's.
        t.accounts.sam = { username: 'sam', email: '' };
        expect(await t.am.requestEmailChange({ username: 'sam', isAuthenticated: true, roles: [] }, 'sam', 's@new.example', 'profile')).toBe('sent');
      } finally {
        vi.useRealTimers();
      }
    });

    test('no more than the cap in a window; the window passing lets one through again', async () => {
      vi.useFakeTimers();
      try {
        const t = setup({ settings: { ...SETTINGS, 'ngdpbase.auth.email-change.cooldown-seconds': 0 } });
        for (const n of [1, 2, 3]) expect(await t.am.requestEmailChange(t.pat, 'pat', `${n}@new.example`, 'profile')).toBe('sent');
        const mails = t.sent.length;
        expect(await t.am.requestEmailChange(t.pat, 'pat', '4@new.example', 'profile')).toBe('throttled');
        expect(t.sent).toHaveLength(mails);
        expect(t.audit.filter((e) => e.eventType === 'emailchange-request')).toHaveLength(3);
        vi.advanceTimersByTime(61 * 60_000);
        expect(await t.am.requestEmailChange(t.pat, 'pat', '4@new.example', 'profile')).toBe('sent');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
