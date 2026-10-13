/**
 * Proxy access, slice 1 (#1762): the grant record, with no effect on requests.
 *
 * A grant is a signed `proxy` row of the credentials store, made, listed and
 * ended only through AuthManager.grantProxy / listProxyGrants / revokeProxy.
 * The store is a real FileCredentialsProvider in a per-test temp directory;
 * the policy decision point is a stand-in holding a fixed table, which treats
 * `proxy-grant` as step-up: a subject marked `stale` holds it but may not use it.
 *
 * Sabotaged once each (then restored): the enabled check (always on) — the
 * "refused while off" test went red; the lackingScopes call (skipped) — the
 * "permission the owner lacks" test went red; `vault: 'never'` (always 'none')
 * — the admin test went red; the expiry filter (removed) — the expiry test went
 * red; the closeAccess proxy step (removed) — the closeAccess test went red; the
 * user-edit requirement for someone else's grant (dropped) — the non-owner
 * revoke test went red.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import AuthManager, { PROXY_ACCESS_ENABLED_KEY } from '../AuthManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

// Generated per run: no literal after a key-shaped name.
const credentialsKey = randomBytes(32).toString('hex');

/** What each account holds. */
const HOLDS: Record<string, string[]> = {
  ann: ['proxy-grant', 'account-security', 'page-read', 'page-edit'],
  bob: ['proxy-grant', 'page-read'],
  cat: ['proxy-grant', 'page-read'],
  admin: ['proxy-grant', 'user-edit', 'page-read', 'admin-system']
};
const STEP_UP = new Set(['proxy-grant']);

interface Subj { username: string; isAuthenticated: boolean; roles: string[]; stale?: boolean; ipAddress?: string }
const subject = (username: string, over: Partial<Subj> = {}): never => ({ username, roles: ['reader'], isAuthenticated: true, ipAddress: '192.0.2.1', ...over }) as never;

const CATALOG = { 'page-read': { description: 'View pages', label: 'Read pages' } };

describe('AuthManager — proxy grants, slice 1 (#1762)', () => {
  let dir: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  let enabled: boolean;
  let audited: Array<Record<string, unknown>>;
  let calls: string[];
  let am: AuthManager;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxygrants-'));
    process.env[CREDENTIALS_KEY_ENV] = credentialsKey;
    enabled = true;
    audited = [];
    calls = [];
    const holds = (s: Subj, action: string): boolean => (HOLDS[s.username] ?? []).includes(action);
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k === PROXY_ACCESS_ENABLED_KEY ? enabled : k === 'ngdpbase.permissions.definitions' ? CATALOG : d),
        getCustomProperty: () => undefined,
        // Every store this test opens lives in the temp directory, never a live data tree.
        getResolvedDataPath: (k: string, d: string) => (k === 'ngdpbase.auth.credentials.file' ? path.join(dir, 'credentials.json') : d),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://site.example.com'
      },
      PolicyDecisionPoint: {
        holds: (s: Subj, a: string) => Promise.resolve(holds(s, a)),
        permits: (s: Subj, a: string) => Promise.resolve(holds(s, a) && !(s.stale && STEP_UP.has(a)))
      },
      PolicyInformationPoint: {
        subjectFor: (u: string) => Promise.resolve(HOLDS[u] ? subject(u) : null)
      },
      UserManager: {
        getUser: () => Promise.resolve(undefined),
        hasPassword: () => Promise.resolve(true),
        deleteUserSessions: (u: string) => { calls.push(`sessions:${u}`); return Promise.resolve(); }
      },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audited.push(e); return Promise.resolve('evt'); }, flushAuditQueue: () => Promise.resolve() }
    };
    am = new AuthManager({ getManager: (n: string) => managers[n] ?? null });
    await am.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the owner makes a grant; it is listed on both sides and recorded with the owner as user and the maker as actor', async () => {
    const made = await am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read', 'page-edit'] });
    expect(made).toEqual(expect.objectContaining({ owner: 'ann', proxy: 'bob', permissions: ['page-read', 'page-edit'], createdBy: 'ann', expiresAt: null, vault: 'none', mayRedelegate: false }));
    expect(made.can[0]).toEqual(expect.objectContaining({ name: 'page-read', description: 'Read pages' }));

    expect((await am.listProxyGrants(subject('ann'), { asOwner: 'ann' })).map(g => g.id)).toEqual([made.id]);
    expect((await am.listProxyGrants(subject('bob'), { asProxy: 'bob' })).map(g => g.id)).toEqual([made.id]);
    expect(await am.listProxyGrants(subject('bob'), { asOwner: 'bob' })).toEqual([]);

    expect(audited).toContainEqual(expect.objectContaining({
      eventType: 'proxy-grant', user: 'ann', actor: 'ann', resource: made.id,
      metadata: expect.objectContaining({ proxy: 'bob', permissions: ['page-read', 'page-edit'], vault: 'none' })
    }));
    // A grant is not a sign-in method.
    expect(await am.listCredentials(subject('ann'), 'ann')).toEqual([]);
  });

  test('the owner revokes it: gone from both sides, recorded, and a second revoke finds nothing', async () => {
    const made = await am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read'] });
    expect(await am.revokeProxy(subject('ann'), made.id)).toBe(true);
    expect(await am.listProxyGrants(subject('ann'), { asOwner: 'ann' })).toEqual([]);
    expect(await am.listProxyGrants(subject('bob'), { asProxy: 'bob' })).toEqual([]);
    expect(audited).toContainEqual(expect.objectContaining({ eventType: 'proxy-revoke', user: 'ann', actor: 'ann', resource: made.id, reason: 'revoked' }));
    expect(await am.revokeProxy(subject('ann'), made.id)).toBe(false);
  });

  test('a grant including proxy-grant says the proxy may give others access', async () => {
    const made = await am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read', 'proxy-grant'] });
    expect(made.mayRedelegate).toBe(true);
  });

  test('all three are refused while proxy access is off', async () => {
    const made = await am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read'] });
    enabled = false;
    await expect(am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'cat', permissions: ['page-read'] })).rejects.toThrow(/turned off/);
    await expect(am.listProxyGrants(subject('ann'), { asOwner: 'ann' })).rejects.toThrow(/turned off/);
    await expect(am.revokeProxy(subject('ann'), made.id)).rejects.toThrow(/turned off/);
  });

  test('a permission the owner does not hold is refused, and nothing is stored or recorded', async () => {
    await expect(am.grantProxy(subject('bob'), { owner: 'bob', proxy: 'cat', permissions: ['page-read', 'page-edit'] })).rejects.toThrow(/does not hold page-edit/);
    expect(await am.listProxyGrants(subject('bob'), { asOwner: 'bob' })).toEqual([]);
    expect(audited.filter(e => e.eventType === 'proxy-grant')).toEqual([]);
  });

  test('an administrator makes one for someone: needs user-edit and a fresh sign-in, is the actor, and the grant never carries vault access', async () => {
    await expect(am.grantProxy(subject('admin', { stale: true }), { owner: 'ann', proxy: 'bob', permissions: ['page-read'] })).rejects.toThrow('Permission denied');
    // Bound by what the person represented holds, not what the administrator holds.
    await expect(am.grantProxy(subject('admin'), { owner: 'ann', proxy: 'bob', permissions: ['admin-system'] })).rejects.toThrow(/ann does not hold admin-system/);

    const made = await am.grantProxy(subject('admin'), { owner: 'ann', proxy: 'bob', permissions: ['page-read'] });
    expect(made).toEqual(expect.objectContaining({ owner: 'ann', createdBy: 'admin', vault: 'never' }));
    expect(audited).toContainEqual(expect.objectContaining({ eventType: 'proxy-grant', user: 'ann', actor: 'admin', metadata: expect.objectContaining({ vault: 'never', createdBy: 'admin' }) }));
  });

  test('someone without user-edit cannot make, list or revoke another person\'s grants; an administrator can revoke with a fresh sign-in', async () => {
    await expect(am.grantProxy(subject('cat'), { owner: 'ann', proxy: 'cat', permissions: ['page-read'] })).rejects.toThrow('Permission denied');
    const made = await am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read'] });
    // Not even the proxy ends it; only the owner, or an administrator.
    await expect(am.revokeProxy(subject('bob'), made.id)).rejects.toThrow('Permission denied');
    await expect(am.revokeProxy(subject('cat'), made.id)).rejects.toThrow('Permission denied');
    await expect(am.listProxyGrants(subject('cat'), { asOwner: 'ann' })).rejects.toThrow('Permission denied');
    await expect(am.revokeProxy(subject('admin', { stale: true }), made.id)).rejects.toThrow('Permission denied');

    expect(await am.revokeProxy(subject('admin'), made.id)).toBe(true);
    expect(audited).toContainEqual(expect.objectContaining({ eventType: 'proxy-revoke', user: 'ann', actor: 'admin' }));
  });

  test('a grant past its end date is no longer listed; an end date in the past is refused', async () => {
    const now = Date.now();
    await expect(am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read'], expiresAt: new Date(now - 1000).toISOString() })).rejects.toThrow(/in the future/);
    await expect(am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read'], expiresAt: 'next tuesday' })).rejects.toThrow(/in the future/);

    const ends = new Date(now + 60_000).toISOString();
    const made = await am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read'], expiresAt: ends });
    expect(made.expiresAt).toBe(ends);
    expect(await am.listProxyGrants(subject('bob'), { asProxy: 'bob' })).toHaveLength(1);

    vi.spyOn(Date, 'now').mockReturnValue(now + 120_000);
    expect(await am.listProxyGrants(subject('bob'), { asProxy: 'bob' })).toEqual([]);
    expect(await am.listProxyGrants(subject('ann'), { asOwner: 'ann' })).toEqual([]);
  });

  test('deleting an account ends its grants on both sides, even with proxy access off; others stay', async () => {
    const annForBob = await am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read'] });
    const catForAnn = await am.grantProxy(subject('cat'), { owner: 'cat', proxy: 'ann', permissions: ['page-read'] });
    const catForBob = await am.grantProxy(subject('cat'), { owner: 'cat', proxy: 'bob', permissions: ['page-read'] });
    enabled = false;
    await am.closeAccess('ann', 'delete', subject('admin'));
    enabled = true;

    expect(await am.listProxyGrants(subject('bob'), { asProxy: 'bob' })).toEqual([expect.objectContaining({ id: catForBob.id })]);
    expect(await am.listProxyGrants(subject('cat'), { asOwner: 'cat' })).toEqual([expect.objectContaining({ id: catForBob.id })]);
    const ended = audited.filter(e => e.eventType === 'proxy-revoke').map(e => e.resource);
    expect(ended.sort()).toEqual([annForBob.id, catForAnn.id].sort());
    expect(audited).toContainEqual(expect.objectContaining({ eventType: 'proxy-revoke', user: 'cat', actor: 'admin', reason: 'account-deleted' }));
  });

  test('disabling an account leaves its grants, as it leaves tokens', async () => {
    await am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read'] });
    await am.closeAccess('ann', 'disable', subject('admin'));
    expect(await am.listProxyGrants(subject('bob'), { asProxy: 'bob' })).toHaveLength(1);
  });

  test('a proxy row cannot be added, renamed or removed as a credential', async () => {
    const made = await am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read'] });
    await expect(am.addCredential(subject('ann'), 'ann', { kind: 'proxy', subject: 'x', secret: '{}', label: 'x' })).rejects.toThrow(/grantProxy/);
    expect(await am.renameCredential(subject('ann'), 'ann', made.id, 'renamed')).toBe(false);
    expect(await am.removeCredential(subject('ann'), 'ann', made.id)).toBe(false);
    expect(await am.listProxyGrants(subject('ann'), { asOwner: 'ann' })).toHaveLength(1);
  });

  test('liveProxyGrant (slice 2): the grant while in force; null once revoked, past its end date, or with proxy access off', async () => {
    const now = Date.now();
    const made = await am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'bob', permissions: ['page-read'], expiresAt: new Date(now + 60_000).toISOString() });
    expect(am.liveProxyGrant(made.id, now)).toEqual(expect.objectContaining({ id: made.id, owner: 'ann', proxy: 'bob', permissions: ['page-read'] }));
    expect(am.liveProxyGrant(made.id, now + 120_000)).toBeNull();
    enabled = false;
    expect(am.liveProxyGrant(made.id, now)).toBeNull();
    enabled = true;
    expect(am.liveProxyGrant('no-such-grant', now)).toBeNull();
    await am.revokeProxy(subject('ann'), made.id);
    expect(am.liveProxyGrant(made.id, now)).toBeNull();
  });

  test('nobody acts for themselves, and both people must be active accounts', async () => {
    await expect(am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'ann', permissions: ['page-read'] })).rejects.toThrow(/themselves/);
    await expect(am.grantProxy(subject('ann'), { owner: 'ann', proxy: 'nobody', permissions: ['page-read'] })).rejects.toThrow(/no active account nobody/);
  });
});
