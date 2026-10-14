/**
 * Proxy access, slice 6 (#1762): tokens and devices approved by a proxy.
 *
 * Jim acts for Mom under a proxy grant and mints an agent token for her. The
 * PolicyDecisionPoint, AuthManager (with a real credentials store) and
 * AgentTokenManager are the real ones, in a per-test temp directory; policy
 * is a table keyed by USERNAME, so "Mom holds" and "Jim holds" are separate
 * rows. The apps and devices side is a stand-in OidcManager with the shape
 * listGrants gives; the device approval itself runs against the real
 * provider in OidcRoutes.test.ts.
 *
 * Sabotaged once each (then restored): the token-mint check in mint (removed)
 * — the "only with token-mint on the grant" test went red; the
 * `approvedBy`/`proxyGrantId` spread in mint (removed) — the recorded test
 * went red; the endProxyGrant revoke loop (removed) — the "revoking the grant"
 * test went red; `approvalInForce` in verify (returning true) — the "works only
 * while the grant is in force" test went red; `viaProxy` on the token-revoke
 * audit (dropped) — the "audit carries both" test went red.
 */
vi.unmock('../../providers/FileCredentialsProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import AuthManager, { PROXY_ACCESS_ENABLED_KEY } from '../AuthManager';
import AgentTokenManager from '../AgentTokenManager';
import PolicyDecisionPoint from '../../security/PolicyDecisionPoint';
import { CREDENTIALS_KEY_ENV } from '../../providers/BaseCredentialsProvider';
import type { PermissionSubject } from '../UserManager';

// Generated per run: no literal after a key-shaped name.
const credentialsKey = randomBytes(32).toString('hex');

/** What policy grants each person, by name. */
const POLICY: Record<string, string[]> = {
  mom: ['proxy-grant', 'token-mint', 'account-security', 'page-read', 'page-edit', 'page-delete'],
  jim: ['proxy-grant', 'token-mint', 'account-security', 'page-read', 'page-delete']
};

const IP = '192.0.2.1';
const subject = (username: string, over: Partial<PermissionSubject> = {}): PermissionSubject =>
  ({ username, roles: [`role-of-${username}`], isAuthenticated: true, ipAddress: IP, ...over });

interface App { owner: string; grantId: string; name: string; approvedBy: string | null; proxyGrantId: string | null }

describe('Proxy access, slice 6: tokens and devices approved by a proxy (#1762)', () => {
  let dir: string;
  const savedKey = process.env[CREDENTIALS_KEY_ENV];
  let enabled: boolean;
  let audited: Array<Record<string, unknown>>;
  let apps: App[];
  let appRevokes: string[];
  let am: AuthManager;
  let tokens: AgentTokenManager;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-tokens-'));
    process.env[CREDENTIALS_KEY_ENV] = credentialsKey;
    enabled = true;
    audited = [];
    appRevokes = [];
    apps = [];
    const allowed = (username: string, action: string) => (POLICY[username] ?? []).includes(action);
    const managers: Record<string, unknown> = {
      ConfigurationManager: {
        getProperty: (k: string, d: unknown) => (k === PROXY_ACCESS_ENABLED_KEY ? enabled : d),
        getCustomProperty: () => undefined,
        // Every store this test opens lives in the temp directory, never a live data tree.
        getResolvedDataPath: (k: string) => (k === 'ngdpbase.auth.credentials.file' ? path.join(dir, 'credentials.json') : path.join(dir, 'tokens')),
        isBaseUrlExplicit: () => true,
        getBaseURL: () => 'https://site.example.com',
        isInitialized: () => true
      },
      PolicyEvaluator: {
        evaluateAccess: ({ userContext, action }: { userContext: { username: string }; action: string }) =>
          Promise.resolve({ allowed: allowed(userContext.username, action), hasDecision: true, policyName: 'table' }),
        compile: (userContext: { username: string }, action: string) => () => ({ allowed: allowed(userContext.username, action), hasDecision: true })
      },
      PolicyInformationPoint: {
        subjectFor: (u: string) => Promise.resolve(POLICY[u] ? subject(u, { ipAddress: undefined }) : null),
        resolveSubjectNow: (u: string) => Promise.resolve(subject(u, { ipAddress: undefined }))
      },
      UserManager: { getUser: () => Promise.resolve(undefined), hasPassword: () => Promise.resolve(true), deleteUserSessions: () => Promise.resolve() },
      OidcManager: {
        listGrants: (u: string) => Promise.resolve(apps.filter(a => a.owner === u).map(a => ({
          grantId: a.grantId, clientId: 'tv', name: a.name, device: true, scopes: ['openid', 'page-read'], approvedAt: null, expiresAt: null,
          refreshable: false, renewedAt: null, approvedBy: a.approvedBy, proxyGrantId: a.proxyGrantId
        }))),
        revokeGrant: (u: string, id: string, by: PermissionSubject) => {
          const i = apps.findIndex(a => a.owner === u && a.grantId === id);
          if (i < 0) return Promise.resolve(false);
          apps.splice(i, 1);
          appRevokes.push(`${id}:${by.username}`);
          return Promise.resolve(true);
        }
      },
      AuditManager: { logAuditEvent: (e: Record<string, unknown>) => { audited.push(e); return Promise.resolve('evt'); }, flushAuditQueue: () => Promise.resolve() }
    };
    const engine = { getManager: (n: string) => managers[n] ?? null };
    managers.PolicyDecisionPoint = new PolicyDecisionPoint(engine);
    am = new AuthManager(engine);
    await am.initialize();
    managers.AuthManager = am;
    tokens = new AgentTokenManager(engine);
    await tokens.initialize();
    managers.AgentTokenManager = tokens;
  });

  afterEach(async () => {
    await tokens.shutdown();
    if (savedKey === undefined) delete process.env[CREDENTIALS_KEY_ENV]; else process.env[CREDENTIALS_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Mom gives Jim access; returns the subject Jim acts for her with. */
  const jimActsForMom = async (permissions: string[]) => {
    const grant = await am.grantProxy(subject('mom'), { owner: 'mom', proxy: 'jim', permissions });
    const acting = subject('mom', { viaProxy: { kind: 'proxy', grantId: grant.id, actor: 'jim', scopes: [...permissions] } });
    return { grant, acting };
  };

  test('Jim mints a token for Mom only when the grant carries token-mint', async () => {
    const without = await jimActsForMom(['page-read']);
    await expect(tokens.mint(without.acting, 'tv-script', ['page-read'], 1)).rejects.toThrow(/does not include making tokens/);
    expect(tokens.listForOwner('mom')).toEqual([]);

    const withIt = await jimActsForMom(['token-mint', 'page-read']);
    const { record } = await tokens.mint(withIt.acting, 'tv-script', ['page-read'], 1);
    expect(record.owner).toBe('mom');
  });

  test('the token carries only what the grant, Mom and Jim all allow', async () => {
    const { acting } = await jimActsForMom(['token-mint', 'page-read', 'page-edit']);
    // In the grant and held by both.
    await expect(tokens.mint(acting, 'a', ['page-read'], 1)).resolves.toBeTruthy();
    // In the grant, Mom holds it, Jim does not.
    await expect(tokens.mint(acting, 'b', ['page-edit'], 1)).rejects.toThrow(/You do not hold page-edit/);
    // Both hold it, the grant does not carry it.
    await expect(tokens.mint(acting, 'c', ['page-delete'], 1)).rejects.toThrow(/You do not hold page-delete/);
  });

  test('the never-delegated permissions stay out, whatever the grant carries', async () => {
    const { acting } = await jimActsForMom(['token-mint', 'proxy-grant', 'page-read']);
    await expect(tokens.mint(acting, 'x', ['token-mint'], 1)).rejects.toThrow(/never mints a token/);
    await expect(tokens.mint(acting, 'x', ['proxy-grant'], 1)).rejects.toThrow(/never lets someone act for its owner/);
  });

  test('the token records Jim as the approver and the grant; the mint record names both people', async () => {
    const { grant, acting } = await jimActsForMom(['token-mint', 'page-read']);
    const { record } = await tokens.mint(acting, 'tv-script', ['page-read'], 1);
    expect(record).toEqual(expect.objectContaining({ owner: 'mom', approvedBy: 'jim', proxyGrantId: grant.id }));
    expect(audited).toContainEqual(expect.objectContaining({
      action: 'token-mint', user: 'mom', actor: 'jim', metadata: expect.objectContaining({ delegated: 'proxy', proxyGrantId: grant.id, owner: 'mom' })
    }));
    // Mom's own token records nobody else.
    const own = await tokens.mint(subject('mom'), 'mine', ['page-read'], 1);
    expect(own.record).not.toHaveProperty('approvedBy');
  });

  test('"My tokens and devices" says who approved it, for Mom, and for Jim while he acts for her', async () => {
    const { acting } = await jimActsForMom(['token-mint', 'account-security', 'page-read']);
    await tokens.mint(acting, 'tv-script', ['page-read'], 1);
    await tokens.mint(subject('mom'), 'mine', ['page-read'], 1);
    const forMom = await am.listDelegations(subject('mom'), 'mom');
    expect(forMom.map(d => [d.name, d.approvedBy])).toEqual([['tv-script', 'jim'], ['mine', null]]);
    // Jim, acting for Mom, sees her list.
    expect((await am.listDelegations(acting, 'mom')).map(d => d.name)).toEqual(['tv-script', 'mine']);
  });

  test('revoking the grant revokes the tokens and devices approved under it, and nothing else', async () => {
    const { grant, acting } = await jimActsForMom(['token-mint', 'page-read']);
    const minted = await tokens.mint(acting, 'tv-script', ['page-read'], 1);
    const own = await tokens.mint(subject('mom'), 'mine', ['page-read'], 1);
    apps.push({ owner: 'mom', grantId: 'g-tv', name: 'Living Room TV', approvedBy: 'jim', proxyGrantId: grant.id });
    apps.push({ owner: 'mom', grantId: 'g-own', name: 'Phone', approvedBy: null, proxyGrantId: null });

    expect(await am.revokeProxy(subject('mom'), grant.id)).toBe(true);
    expect(tokens.getById(minted.record.id)?.revokedAt).toEqual(expect.any(String));
    expect(await tokens.verify(minted.token)).toBeNull();
    expect(tokens.getById(own.record.id)?.revokedAt).toBeNull();
    expect(appRevokes).toEqual(['g-tv:mom']);
    expect(apps.map(a => a.grantId)).toEqual(['g-own']);
    expect(audited).toContainEqual(expect.objectContaining({ action: 'token-revoke', user: 'mom', metadata: expect.objectContaining({ id: minted.record.id, revokedBy: 'mom' }) }));
  });

  test('a token Jim approved works only while the grant is in force', async () => {
    const { acting } = await jimActsForMom(['token-mint', 'page-read']);
    const minted = await tokens.mint(acting, 'tv-script', ['page-read'], 1);
    expect(await tokens.verify(minted.token)).not.toBeNull();
    // Proxy access turned off: the grant is no longer in force, so neither is the token.
    enabled = false;
    expect(await tokens.verify(minted.token)).toBeNull();
    expect(tokens.listForOwner('mom')).toEqual([]);
    enabled = true;
    expect(await tokens.verify(minted.token)).not.toBeNull();
  });

  test('Jim revoking one of Mom\'s tokens while acting: the record names both people', async () => {
    const { grant, acting } = await jimActsForMom(['token-mint', 'account-security', 'page-read']);
    const own = await tokens.mint(subject('mom'), 'mine', ['page-read'], 1);
    expect(await am.revokeDelegation(acting, 'mom', 'token', own.record.id)).toBe(true);
    expect(tokens.getById(own.record.id)?.revokedBy).toBe('jim');
    expect(audited).toContainEqual(expect.objectContaining({
      action: 'token-revoke', user: 'mom', actor: 'jim', metadata: expect.objectContaining({ revokedBy: 'jim', proxyGrantId: grant.id })
    }));
  });
});
