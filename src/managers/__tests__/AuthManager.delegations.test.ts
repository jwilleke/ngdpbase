/**
 * "My tokens and devices" (#1764): one list over a person's agent tokens and
 * the apps and devices they approved through this site's own sign-in server,
 * each saying how it is renewed, and one door — AuthManager.revokeDelegation —
 * for every Revoke. Another person's rows never appear and cannot be revoked.
 *
 * The agent tokens are a real AgentTokenManager in a per-test temp directory;
 * the approved apps are a stand-in OidcManager with the shape listGrants gives
 * (its own revoke and audit are covered in OidcRoutes.test.ts).
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import AuthManager from '../AuthManager';
import AgentTokenManager from '../AgentTokenManager';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';

// Generated per run: no literal after a key-shaped name.
const credentialsKey = randomBytes(32).toString('hex');
const subject = (username: string) => ({ username, roles: [username === 'admin' ? 'admin' : 'reader'], isAuthenticated: true }) as never;

/** The shape OidcManager.listGrants gives (ApprovedApp), plus whose it is. */
interface Grant {
  owner: string; grantId: string; clientId: string; name: string; device: boolean; scopes: string[];
  approvedAt: string | null; expiresAt: string | null; refreshable: boolean; renewedAt: string | null;
}

const app = (owner: string, over: Partial<Grant> = {}): Grant => ({
  owner,
  grantId: `grant-${owner}-${over.name ?? 'app'}`,
  clientId: 'client',
  name: 'Notes app',
  device: false,
  scopes: ['openid', 'page-read'],
  approvedAt: '2026-10-01T09:00:00.000Z',
  expiresAt: '2026-10-15T09:00:00.000Z',
  refreshable: false,
  renewedAt: null,
  ...over
});

const CATALOG = {
  'page-read': { description: 'View pages (dev note #1)', label: 'Read pages' },
  'addon-thing': { description: 'Manage the add-on' }
};

describe('AuthManager — My tokens and devices (#1764)', () => {
  let dir: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  let audited: Array<Record<string, unknown>>;
  let grants: Grant[];
  let grantRevokes: string[];
  let tokens: AgentTokenManager;
  let am: AuthManager;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'delegations-'));
    process.env[CREDENTIALS_KEY_ENV] = credentialsKey;
    audited = [];
    grantRevokes = [];
    grants = [
      app('ann', { name: 'Living Room TV', device: true, refreshable: true, renewedAt: '2026-10-11T08:00:00.000Z', expiresAt: null }),
      app('ann'),
      app('sam', { name: 'Sam phone', device: true, refreshable: true })
    ];
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        // #1764: the permission catalog, for the rows' plain words.
        getProperty: (k: string, d: unknown) => (k === 'ngdpbase.permissions.definitions' ? CATALOG : d),
        getCustomProperty: () => undefined,
        // Every store this test opens lives in the temp directory, never a live data tree.
        getResolvedDataPath: (k: string) => (k === 'ngdpbase.auth.credentials.file' ? path.join(dir, 'credentials.json') : path.join(dir, 'tokens')),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://site.example.com'
      },
      // Everyone holds account-security for themselves; only the admin holds user-edit.
      PolicyDecisionPoint: {
        permits: (s: { username: string }, action: string) => Promise.resolve(action === 'user-edit' ? s.username === 'admin' : true),
        holds: (s: { username: string }, action: string) => Promise.resolve(action === 'user-edit' ? s.username === 'admin' : true)
      },
      UserManager: { getUser: () => Promise.resolve(undefined), hasPassword: () => Promise.resolve(true) },
      OidcManager: {
        listGrants: (u: string) => Promise.resolve(grants.filter(g => g.owner === u).map(({ owner: _o, ...g }) => g)),
        revokeGrant: (u: string, id: string, by: { username: string }) => {
          const i = grants.findIndex(g => g.owner === u && g.grantId === id);
          if (i < 0) return Promise.resolve(false);
          grants.splice(i, 1);
          grantRevokes.push(`${id}:${u}:${by.username}`);
          return Promise.resolve(true);
        }
      },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audited.push(e); return Promise.resolve('evt'); }, flushAuditQueue: () => Promise.resolve() }
    };
    const engine = { getManager: (n: string) => managers[n] ?? null };
    tokens = new AgentTokenManager(engine);
    await tokens.initialize();
    managers.AgentTokenManager = tokens;
    am = new AuthManager(engine);
    await am.initialize();
    await tokens.mint(subject('ann'), 'import-script', ['page-read'], 12);
    await tokens.mint(subject('sam'), 'sam-bot', ['page-read'], 12);
  });

  afterEach(async () => {
    await tokens.shutdown();
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('lists both kinds, each saying how it is renewed, and only the person\'s own', async () => {
    const rows = await am.listDelegations(subject('ann'), 'ann');
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'token', name: 'import-script', renewal: 'fixed', scopes: ['page-read'], renewedAt: null, device: false }),
      expect.objectContaining({ kind: 'app', name: 'Living Room TV', renewal: 'refreshable', device: true, renewedAt: '2026-10-11T08:00:00.000Z' }),
      expect.objectContaining({ kind: 'app', name: 'Notes app', renewal: 'fixed', device: false, expiresAt: '2026-10-15T09:00:00.000Z' })
    ]);
    expect(rows[0].expiresAt).toBeTruthy();
    expect(rows.map(r => r.name)).not.toContain('sam-bot');
    expect(rows.map(r => r.name)).not.toContain('Sam phone');
    // Never a secret on a row.
    expect(JSON.stringify(rows)).not.toMatch(/hash|ngdp_at_/);
  });

  test('revoking an agent token goes through the door, removes it and is audited by who revoked it', async () => {
    const [token] = (await am.listDelegations(subject('ann'), 'ann')).filter(r => r.kind === 'token');
    expect(await am.revokeDelegation(subject('ann'), 'ann', 'token', token.id)).toBe(true);
    expect((await am.listDelegations(subject('ann'), 'ann')).some(r => r.kind === 'token')).toBe(false);
    expect(audited).toContainEqual(expect.objectContaining({ action: 'token-revoke', user: 'ann', metadata: expect.objectContaining({ id: token.id, owner: 'ann', revokedBy: 'ann' }) }));
    // A second revoke finds nothing live.
    expect(await am.revokeDelegation(subject('ann'), 'ann', 'token', token.id)).toBe(false);
  });

  test('revoking an approved app goes through the door, removes it, and names who revoked it', async () => {
    const tv = (await am.listDelegations(subject('ann'), 'ann')).find(r => r.name === 'Living Room TV')!;
    expect(await am.revokeDelegation(subject('ann'), 'ann', 'app', tv.id)).toBe(true);
    expect(grantRevokes).toEqual([`${tv.id}:ann:ann`]);
    expect((await am.listDelegations(subject('ann'), 'ann')).map(r => r.name)).toEqual(['import-script', 'Notes app']);
  });

  test('another person\'s list is refused, and their items cannot be revoked as one\'s own', async () => {
    await expect(am.listDelegations(subject('ann'), 'sam')).rejects.toThrow('Permission denied');
    await expect(am.revokeDelegation(subject('ann'), 'sam', 'app', 'grant-sam-Sam phone')).rejects.toThrow('Permission denied');
    const samToken = tokens.listForOwner('sam')[0];
    await expect(am.revokeDelegation(subject('ann'), 'sam', 'token', samToken.id)).rejects.toThrow('Permission denied');
    // Naming sam's items under ann's own account finds nothing of ann's to revoke.
    expect(await am.revokeDelegation(subject('ann'), 'ann', 'token', samToken.id)).toBe(false);
    expect(await am.revokeDelegation(subject('ann'), 'ann', 'app', 'grant-sam-Sam phone')).toBe(false);
    expect(tokens.listForOwner('sam')).toHaveLength(1);
    expect(grants.filter(g => g.owner === 'sam')).toHaveLength(1);
    expect(audited.some(e => e.action === 'token-revoke')).toBe(false);
  });

  test('an administrator holding user-edit may revoke someone else\'s, recorded as by the administrator', async () => {
    const samToken = tokens.listForOwner('sam')[0];
    expect(await am.revokeDelegation(subject('admin'), 'sam', 'token', samToken.id)).toBe(true);
    expect(audited).toContainEqual(expect.objectContaining({ action: 'token-revoke', user: 'admin', metadata: expect.objectContaining({ owner: 'sam', revokedBy: 'admin' }) }));
  });

  test('each row says what it can do in plain words: the catalog label, a sign-in scope\'s line, else the name', async () => {
    const rows = await am.listDelegations(subject('ann'), 'ann');
    expect(rows[0].can).toEqual([{ name: 'page-read', description: 'Read pages' }]);
    expect(rows[2].can).toEqual([
      { name: 'openid', description: 'Confirm who you are (your username)' },
      { name: 'page-read', description: 'Read pages' }
    ]);
    // An add-on permission with no label reads by its description; a scope declared nowhere, by its name.
    expect(am.describeScopes(['addon-thing', 'patient/*.read', 'page-read', 'page-read'])).toEqual([
      { name: 'addon-thing', description: 'Manage the add-on' },
      { name: 'patient/*.read', description: 'patient/*.read' },
      { name: 'page-read', description: 'Read pages' }
    ]);
  });

  test('a signed-out caller is refused', async () => {
    await expect(am.listDelegations({ username: 'ann', roles: [], isAuthenticated: false }, 'ann')).rejects.toThrow('Permission denied');
  });
});
