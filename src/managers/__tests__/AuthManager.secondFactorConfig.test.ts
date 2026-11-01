/**
 * #1523 slice 1a — second factors governed by `ngdpbase.auth.factors`: an
 * entry switched off is never asked for; the factors are offered by Q2
 * (operator, 2026-10-31: those that reach the person's required level first,
 * then by `preference`, lower first), an order that survives the
 * configuration merge; `email-link` is an alias of the `magic-link` entry
 * (Q3); and an inert `"amr": ["trust"]` is warned about (Q10). A real
 * FileCredentialsProvider in a temp directory; the temp directory is all that
 * is removed.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AuthManager from '../AuthManager';
import logger from '../../utils/logger';
import { deepMergeConfigs } from '../../utils/configFiles';
import { TEST_PLUGIN_MANAGER } from '../../test-support/plugins';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

const SHIPPED = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../config/app-default-config.json'), 'utf8')) as Record<string, unknown>;
const SHIPPED_FACTORS = SHIPPED['ngdpbase.auth.factors'] as Array<Record<string, unknown>>;

const subject = (username: string) => ({ username, roles: ['reader'], isAuthenticated: true }) as never;
const PASSWORD = { provider: 'password', amr: ['pwd'], aal: 1 as const, at: new Date().toISOString() };
const FIRST = { success: true, username: 'molly', provider: 'password', factors: [PASSWORD] };

/** A TOTP-like provider: a second factor only, `otp` (have). Built in #421; a stand-in here. */
const totp = { id: 'totp', displayName: 'Authenticator app', factor: { amr: ['otp'], aal: 1 as const, primary: false }, verify: () => Promise.resolve(null) };

describe('#1523 slice 1a: second factors governed by ngdpbase.auth.factors', () => {
  let dir: string;
  let file: string;
  let sent: Array<{ to: string; subject: string; text: string }>;
  let custom: Record<string, unknown>;
  let roles: string[];
  let logged: string[];
  let allowedAuthMethods: string[] | undefined;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];

  /** The site's merged configuration: the shipped file, then the operator's custom file, by the real merge. */
  const merged = (): Record<string, unknown> => deepMergeConfigs(SHIPPED, custom);

  const started = async () => {
    const config = merged();
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k === 'ngdpbase.auth.factors' ? config[k] : d),
        getCustomProperty: (k: string) => custom[k],
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? file : d),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://wiki.example.com',
        getApplicationName: () => 'Willeke Family'
      },
      PolicyDecisionPoint: { permits: (s: { username: string }, action: string) => Promise.resolve(action === 'account-security' && s.username === 'molly') },
      UserManager: {
        getUser: (u: string) => Promise.resolve(u === 'molly' ? { username: 'molly', email: 'molly@example.com', allowedAuthMethods } : null),
        hasPassword: () => Promise.resolve(true)
      },
      PolicyInformationPoint: { subjectFor: (u: string) => Promise.resolve(u === 'molly' ? { username: 'molly', roles, isAuthenticated: true } : null) },
      RoleManager: { roleRequiredAal: () => ({ admin: 2, reader: 1 }), operatorRequiredAal: () => ({}) },
      EmailManager: { send: (m: { to: string; subject: string; text: string }) => { sent.push(m); return Promise.resolve(); }, getProviderName: () => 'test' },
      PluginManager: TEST_PLUGIN_MANAGER,
      AuditManager: { logAuditEvent: () => Promise.resolve('evt') }
    };
    const manager = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  /** Molly's email enrolled as a second factor the real way, then the site started with `custom`. */
  const enrolled = async () => {
    const am = await started();
    expect(await am.startEmailFactorEnrolment(subject('molly'), 'molly')).toBe('sent');
    const token = /confirm\?t=([\w-]+)/.exec(sent.at(-1).text)[1];
    expect(await am.confirmEmailFactorEnrolment(subject('molly'), token)).toBe(true);
    return started();
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1523-1a-'));
    file = path.join(dir, 'users', 'credentials.json');
    process.env[CREDENTIALS_KEY_ENV] = 'test-credentials-key-not-a-secret';
    sent = [];
    custom = {};
    roles = ['reader'];
    logged = [];
    allowedAuthMethods = undefined;
    vi.spyOn(logger, 'warn').mockImplementation(((...args: unknown[]) => { logged.push(args.map(String).join(' ')); return logger; }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('the email link is governed by its entry', () => {
    test('shipped: an enrolled email link is offered, so a password sign-in takes the second step', async () => {
      const am = await enrolled();
      expect(am.secondFactorsFor('molly')).toEqual([{ id: 'email-link', label: 'Email link', target: 'm***@example.com' }]);
      expect(am.needsSecondStep(FIRST)).toBe(true);
    });

    test.each([
      ['magic-link'],
      ['email-link']
    ])('the %s entry enabled: false: nobody is asked for it, and a password sign-in is one step', async (id) => {
      const am0 = await enrolled();
      expect(am0.needsSecondStep(FIRST)).toBe(true);
      custom['ngdpbase.auth.factors'] = [{ authproviderid: id, primary: true, enabled: false }];
      const am = await started();
      expect(am.secondFactorsFor('molly')).toEqual([]);
      expect(am.needsSecondStep(FIRST)).toBe(false);
      // Sabotage check: sendEmailApproval ignoring the entry would still mail a link.
      const handle = await am.beginTwoStep(FIRST, { binding: 'b' });
      expect(await am.sendEmailApproval(handle, 'b')).toBe('unavailable');
    });

    test('switched off, it is not offered for enrolment either', async () => {
      expect((await started()).emailSecondFactorAvailable()).toBe(true);
      custom['ngdpbase.auth.factors'] = [{ authproviderid: 'magic-link', primary: true, enabled: false }];
      const am = await started();
      expect(am.emailSecondFactorAvailable()).toBe(false);
      expect(await am.startEmailFactorEnrolment(subject('molly'), 'molly')).toBe('unavailable');
      expect(sent).toEqual([]);
    });

    test('an entry that is not listed is not offered: the factors list is what the site offers', async () => {
      await enrolled();
      custom['ngdpbase.auth.factors'] = null;
      const am = await started();
      expect(am.secondFactorsFor('molly')).toEqual([]);
      expect(am.needsSecondStep(FIRST)).toBe(false);
    });

    test.each([
      [['password', 'email-link']],
      [['password', 'magic-link']]
    ])('the retired required-factors %j: the old id is read as magic-link (Q3), so it is still two steps', async (legacy) => {
      await enrolled();
      custom['ngdpbase.auth.required-factors'] = legacy;
      const am = await started();
      expect(am.secondFactorsFor('molly').map(f => f.id)).toEqual(['email-link']);
      expect(am.needsSecondStep(FIRST)).toBe(true);
    });

    test.each([
      ['enabled: false', { 'ngdpbase.auth.factors': [{ authproviderid: 'magic-link', primary: true, enabled: false }] }],
      ['not listed', { 'ngdpbase.auth.factors': null }],
      ['not in the retired required-factors', { 'ngdpbase.auth.required-factors': ['password'] }]
    ])('the magic-link entry %s while an email second factor is enrolled: one warning at boot', async (_why, config) => {
      await enrolled();
      logged = [];
      Object.assign(custom, config);
      await started();
      const warnings = logged.filter(l => l.includes('enrolled email second factor'));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('magic-link');
      expect(warnings[0]).toContain('no longer asked for');
    });

    test('the retired required-factors without magic-link: its warning says the email second factor is off', async () => {
      custom['ngdpbase.auth.required-factors'] = ['password', 'passkey'];
      await started();
      const retired = logged.filter(l => l.includes('required-factors is retired'));
      expect(retired).toHaveLength(1);
      expect(retired[0]).toContain('email second factor is off');
      logged = [];
      custom['ngdpbase.auth.required-factors'] = ['password', 'email-link'];
      await started();
      expect(logged.filter(l => l.includes('email second factor is off'))).toEqual([]);
    });

    test('a custom factors entry without a string authproviderid: one warning each, saying the shipped list was replaced', async () => {
      await enrolled();
      logged = [];
      custom['ngdpbase.auth.factors'] = [
        { authproviderid: 'password', primary: true },
        { authProviderId: 'passkey', primary: true }
      ];
      const am = await started();
      expect(am.getFactors().map(f => f.provider)).toEqual(['password']);
      const dropped = logged.filter(l => l.includes('no string authproviderid'));
      expect(dropped).toHaveLength(1);
      expect(dropped[0]).toContain('authProviderId');
      expect(dropped[0]).toContain('replaces the shipped list');
      // The effect on enrolled accounts is named too.
      expect(logged.filter(l => l.includes('enrolled email second factor'))).toHaveLength(1);
    });

    test('no warning when the entry is on, or when no account has an email second factor', async () => {
      await enrolled();
      expect(logged.filter(l => l.includes('enrolled email second factor'))).toEqual([]);
      custom['ngdpbase.auth.factors'] = [{ authproviderid: 'magic-link', primary: true, enabled: false }];
      fs.rmSync(file, { force: true });
      logged = [];
      await started();
      expect(logged.filter(l => l.includes('enrolled email second factor'))).toEqual([]);
    });

    test('the email link is not offered after a sign-in that used it', async () => {
      const am = await enrolled();
      expect(am.secondFactorOrder({ provider: 'magic-link', factors: [] }, 1)).not.toContain('magic-link');
    });
  });

  describe('the order: reaching the required level first, then preference (Q2)', () => {
    test('shipped preferences: passkey, then the email link', () => {
      const pref = (id: string) => SHIPPED_FACTORS.find(e => e.authproviderid === id)?.preference as number;
      expect(pref('passkey')).toBeLessThan(pref('magic-link'));
    });

    test('a person at AAL1: every factor reaches it, so preference alone decides', async () => {
      custom['ngdpbase.auth.factors'] = [{ authproviderid: 'totp', primary: false, preference: 3, enabled: true }];
      const am = await started();
      am.registerProvider(totp);
      expect(am.secondFactorOrder(FIRST, 1)).toEqual(['passkey', 'magic-link', 'totp']);
    });

    test('a person at AAL2: a factor that reaches it with the password (TOTP) comes before one that never can (the email link)', async () => {
      custom['ngdpbase.auth.factors'] = [{ authproviderid: 'totp', primary: false, preference: 3, enabled: true }];
      const am = await started();
      am.registerProvider(totp);
      // Sabotage check: sorting by preference alone puts magic-link (2) before totp (3) and turns this red.
      expect(am.secondFactorOrder(FIRST, 2)).toEqual(['passkey', 'totp', 'magic-link']);
    });

    test('the order survives the configuration merge: preference decides, not where an entry lands in the list', async () => {
      // The merge keeps the shipped entries' places and appends new ones, so
      // totp lands last; its preference puts it first.
      custom['ngdpbase.auth.factors'] = [
        { authproviderid: 'magic-link', primary: true, preference: 9, enabled: true },
        { authproviderid: 'totp', primary: false, preference: 0, enabled: true }
      ];
      expect((merged()['ngdpbase.auth.factors'] as Array<{ authproviderid: string }>).map(e => e.authproviderid).at(-1)).toBe('totp');
      const am = await started();
      am.registerProvider(totp);
      expect(am.secondFactorOrder(FIRST, 1)).toEqual(['totp', 'passkey', 'magic-link']);
    });

    test('an entry with no preference comes after those with one; a disabled one is left out', async () => {
      custom['ngdpbase.auth.factors'] = [
        { authproviderid: 'magic-link', primary: true, enabled: true },
        { authproviderid: 'totp', primary: false, preference: 3, enabled: true }
      ];
      const am = await started();
      am.registerProvider(totp);
      expect(am.secondFactorOrder(FIRST, 1)).toEqual(['passkey', 'totp', 'magic-link']);
      custom['ngdpbase.auth.factors'] = [{ authproviderid: 'totp', primary: false, preference: 3, enabled: false }];
      const off = await started();
      off.registerProvider(totp);
      expect(off.secondFactorOrder(FIRST, 1)).toEqual(['passkey', 'magic-link']);
    });

    test('the pending sign-in carries the required level, so the second-step page offers in Q2 order', async () => {
      roles = ['admin'];
      custom['ngdpbase.auth.factors'] = [{ authproviderid: 'totp', primary: false, preference: 3, enabled: true }];
      const am = await enrolled();
      // With TOTP offered the account can reach AAL2, so admin's level is not capped to 1 (#1690).
      am.registerProvider(totp);
      const handle = await am.beginTwoStep(FIRST, { binding: 'b' });
      const pending = am.pendingSignIn(handle, 'b')!;
      expect(pending.requiredAal).toBe(2);
      expect(am.secondFactorOrder(pending.first, pending.requiredAal)).toEqual(['passkey', 'totp', 'magic-link']);
      // Only what the second step can run is offered: the email link (a passkey signs in alone; TOTP's step is #421).
      expect(am.secondFactorsFor('molly', pending).map(f => f.id)).toEqual(['email-link']);
    });
  });

  describe('Q3: an old id in allowedAuthMethods', () => {
    test('google-oidc counts as oidc:google for the level the account can reach, as it does for signing in', async () => {
      allowedAuthMethods = ['google-oidc'];
      const am = await started();
      (am as unknown as { registerCoreProvider: (p: unknown) => boolean }).registerCoreProvider({ id: 'oidc:google', displayName: 'Google', factor: { amr: ['hwk'], aal: 2 as const, primary: true }, verify: () => Promise.resolve(null) });
      expect(await am.userMayUseProvider('molly', 'oidc:google')).toBe(true);
      // Sabotage check: comparing the raw string offers nothing, and the reach falls to 1.
      expect((await am.aalReachFor('molly')).now).toBe(2);
    });
  });

  describe('Q10: "amr": ["trust"] is gone from the shipped entries', () => {
    test('no shipped entry carries it', () => {
      expect(SHIPPED_FACTORS.filter(e => (e.amr as string[] | undefined)?.includes('trust'))).toEqual([]);
    });

    test('a custom config that still carries it gets one warning naming trust-mfa', async () => {
      custom['ngdpbase.auth.factors'] = [{ authproviderid: 'oidc:google', primary: true, amr: ['trust'], enabled: true }];
      await started();
      const warnings = logged.filter(l => l.includes('"trust"'));
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('oidc:google');
      expect(warnings[0]).toContain('trust-mfa');
      expect(warnings[0]).toContain('ngdpbase.auth.oidc.providers');
    });

    test('the shipped config warns about nothing', async () => {
      await started();
      expect(logged.filter(l => l.includes('"trust"'))).toEqual([]);
    });
  });
});
