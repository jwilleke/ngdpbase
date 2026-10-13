/**
 * Proxy access, slice 2 (#1762): the ceiling, not yet reachable.
 *
 * No request can carry `viaProxy` until slice 4, so every subject here is
 * built by hand: the person represented (mom) in `username`/`roles`, and the
 * claim naming the actor (jim) and the grant. The PDP is real; policy is a
 * table keyed by USERNAME (never a role name), so "represented holds" and
 * "actor holds" are separate rows. AuthManager is a stand-in whose
 * `liveProxyGrant` reads a mutable map — revoking mid-session is deleting the
 * row; the real lookup (expiry, proxy access off) is covered in
 * AuthManager.proxyGrants.test.ts.
 *
 * Sabotaged once each (then restored): the combination check (removed) — the
 * combination tests went red; the live grant lookup (trusting the claim) — the
 * revoked-mid-session test went red; the grant-scope check (removed) — the
 * proxy_scope_deny test went red; the actor check (removed) — the
 * proxy_actor_deny test went red; `delegated` for a proxy (made true) — the
 * step-up test went red; the vault-proxy check in mayActInPrivateContainer
 * (removed) — the "refused without vault-proxy" tests went red; the viaProxy
 * check in handleOf (removed) — the encrypted test went red; the proxy clause
 * in the page door's ceiling condition, and separately in the list filter's
 * (each removed) — the frontmatter test went red; the represented person's
 * active-account check (removed) — the inactive-account test went red.
 */
import PolicyDecisionPoint from '../PolicyDecisionPoint';
import PolicyInformationPoint from '../PolicyInformationPoint';
import { mayActInPrivateContainer, permitsInVault } from '../../utils/privateStoreAccess';
import { clearUnlockedPrivateStores, dekFor, setUnlockedDek, unlockPrivateStores } from '../../utils/privateStoreUnlock';
import { jobContextFromRequest, toPermissionSubject } from '../../context/JobContext';
import type { ProxyClaim } from '../../managers/UserManager';
import { randomBytes } from 'node:crypto';

/** What policy grants each person, by name. */
const POLICY: Record<string, string[]> = {
  mom: ['page-read', 'page-edit', 'account-security', 'asset-read'],
  jim: ['page-read', 'page-delete', 'account-security', 'asset-read']
};
const STEP_UP = new Set(['account-security']);

interface Grant { owner: string; proxy: string; permissions: string[] }
let grants: Map<string, Grant>;

function makeEngine() {
  const stepUpNeeded = vi.fn((permission: string, signIn: { at?: string } | undefined, _roles: readonly string[], delegated: boolean) =>
    STEP_UP.has(permission) && (delegated || signIn?.at !== 'fresh'));
  const allowed = (username: string, action: string) => (POLICY[username] ?? []).includes(action);
  const engine = {
    getManager: (name: string): unknown => {
      if (name === 'ConfigurationManager') return { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => '/tmp/ngdp-proxy-ceiling-test', isInitialized: () => true };
      if (name === 'PolicyEvaluator') {
        return {
          evaluateAccess: async ({ userContext, action }: { userContext: { username: string }; action: string }) =>
            ({ allowed: allowed(userContext.username, action), hasDecision: true, policyName: allowed(userContext.username, action) ? 'table_allow' : null }),
          compile: (userContext: { username: string }, action: string) => () =>
            ({ allowed: allowed(userContext.username, action), hasDecision: true })
        };
      }
      if (name === 'PolicyInformationPoint') {
        const subj = (u: string) => ({ username: u, roles: [`role-of-${u}`], isAuthenticated: true });
        return { subjectFor: async (u: string) => (POLICY[u] ? subj(u) : null), resolveSubjectNow: async (u: string) => subj(u) };
      }
      if (name === 'AuthManager') return { stepUpNeeded, liveProxyGrant: (id: string) => grants.get(id) ?? null };
      if (name === 'PolicyDecisionPoint') return pdp;
      if (name === 'AuditManager') return { logAuditEvent: async () => 'evt' };
      return null;
    }
  };
  const pdp = new PolicyDecisionPoint(engine);
  return { engine, pdp, stepUpNeeded };
}

const claim = (over: Partial<ProxyClaim> = {}): ProxyClaim =>
  ({ kind: 'proxy', grantId: 'g1', actor: 'jim', scopes: ['page-read', 'page-edit', 'page-delete', 'account-security'], ...over });

/** Jim acting for mom: mom's name and roles, jim's sign-in and cap. */
const actingForMom = (over: Partial<ProxyClaim> = {}, extra: Record<string, unknown> = {}) =>
  ({ username: 'mom', roles: ['role-of-mom'], isAuthenticated: true, signIn: { at: 'fresh' }, aalCap: 1, viaProxy: claim(over), ...extra }) as never;

beforeEach(() => {
  grants = new Map([['g1', { owner: 'mom', proxy: 'jim', permissions: ['page-read', 'page-edit', 'page-delete', 'account-security', 'vault-proxy'] }]]);
});

describe('PDP proxy ceiling (#1762 slice 2)', () => {
  test('grant ∩ represented ∩ actor: allowed only when all three allow', async () => {
    const { pdp } = makeEngine();
    // In the grant, mom holds it, jim holds it.
    expect(await pdp.decide(actingForMom(), { action: 'page-read' })).toEqual({ permit: true, applicable: true, reason: 'table_allow' });
    // In the grant, jim holds it, mom does not: policy for the represented person refuses.
    expect((await pdp.decide(actingForMom(), { action: 'page-delete' })).permit).toBe(false);
  });

  test('proxy_scope_deny: the grant does not carry the action, whoever holds it', async () => {
    const { pdp } = makeEngine();
    expect(await pdp.decide(actingForMom(), { action: 'asset-read' })).toEqual({ permit: false, applicable: true, reason: 'proxy_scope_deny' });
  });

  test('proxy_actor_deny: the actor does not hold the action, though the grant and mom do', async () => {
    const { pdp } = makeEngine();
    expect(await pdp.decide(actingForMom(), { action: 'page-edit' })).toEqual({ permit: false, applicable: true, reason: 'proxy_actor_deny' });
  });

  test('proxy_revoked: the grant revoked mid-session is refused on the next decision', async () => {
    const { pdp } = makeEngine();
    const subject = actingForMom();
    expect(await pdp.permits(subject, 'page-read')).toBe(true);
    grants.delete('g1');
    expect(await pdp.decide(subject, { action: 'page-read' })).toEqual({ permit: false, applicable: true, reason: 'proxy_revoked' });
  });

  test('proxy_revoked: a grant for another person or actor, or narrower than the claim, does not stand in', async () => {
    const { pdp } = makeEngine();
    expect((await pdp.decide(actingForMom({ actor: 'cat' }), { action: 'page-read' })).reason).toBe('proxy_revoked');
    expect((await pdp.decide({ ...(actingForMom() as object), username: 'dad' }, { action: 'page-read' })).reason).toBe('proxy_revoked');
    expect((await pdp.decide(actingForMom({ scopes: ['page-read', 'asset-read'] }), { action: 'page-read' })).reason).toBe('proxy_revoked');
  });

  test('an inactive account on either side stops the proxy: mom disabled is proxy_revoked, jim disabled holds nothing', async () => {
    const { pdp } = makeEngine();
    const saved = { ...POLICY };
    try {
      delete POLICY.mom;
      expect((await pdp.decide(actingForMom(), { action: 'page-read' })).reason).toBe('proxy_revoked');
      POLICY.mom = saved.mom;
      delete POLICY.jim;
      expect((await pdp.decide(actingForMom(), { action: 'page-read' })).reason).toBe('proxy_actor_deny');
    } finally {
      Object.assign(POLICY, saved);
    }
  });

  test('proxy_kind_deny: impersonation (#1763) admits nothing yet', async () => {
    const { pdp } = makeEngine();
    expect((await pdp.decide(actingForMom({ kind: 'impersonation' }), { action: 'page-read' })).reason).toBe('proxy_kind_deny');
  });

  test('proxy_combined_deny: a proxy never rides with an agent token or a share', async () => {
    const { pdp } = makeEngine();
    const token = { viaToken: { id: 't', name: 'x', scopes: ['page-read'] } };
    const share = { viaShare: { id: 's', issuer: 'mom', actions: ['page-read'], resources: [], expiresAt: null } };
    expect((await pdp.decide(actingForMom({}, token), { action: 'page-read' })).reason).toBe('proxy_combined_deny');
    expect((await pdp.decide(actingForMom({}, share), { action: 'page-read' })).reason).toBe('proxy_combined_deny');
  });

  test('step-up uses the actor\'s own sign-in and cap: a proxy is not delegated', async () => {
    const { pdp, stepUpNeeded } = makeEngine();
    expect(await pdp.permits(actingForMom(), 'account-security')).toBe(true);
    expect(stepUpNeeded).toHaveBeenLastCalledWith('account-security', { at: 'fresh' }, ['role-of-mom'], false, undefined, 1);
    // The actor's sign-in is stale: refused as step-up, not as a delegation.
    expect(await pdp.decide(actingForMom({}, { signIn: { at: 'stale' } }), { action: 'account-security' }))
      .toEqual({ permit: false, applicable: true, reason: 'step-up' });
  });

  test('a job started under a proxy keeps the claim, and the ceiling', async () => {
    const { pdp } = makeEngine();
    const job = toPermissionSubject(jobContextFromRequest({ username: 'mom', viaProxy: claim() }));
    expect(job.viaProxy).toEqual(claim());
    expect((await pdp.decide(job, { action: 'page-edit' })).reason).toBe('proxy_actor_deny');
  });
});

describe('private container under a proxy (#1762 slice 2)', () => {
  test('refused without vault-proxy in the grant, though the username is the owner\'s', () => {
    expect(mayActInPrivateContainer(actingForMom(), 'mom')).toBe(false);
    expect(mayActInPrivateContainer(actingForMom(), 'mom', { vault: 'default' })).toBe(false);
  });

  test('admitted with vault-proxy, to the represented person\'s container only', () => {
    const withVault = actingForMom({ scopes: ['page-read', 'vault-proxy'] });
    expect(mayActInPrivateContainer(withVault, 'mom', { vault: 'default' })).toBe(true);
    expect(mayActInPrivateContainer(withVault, 'jim')).toBe(false);
  });

  test('impersonation, or a proxy with a token or share, never gets in', () => {
    expect(mayActInPrivateContainer(actingForMom({ kind: 'impersonation', scopes: ['vault-proxy'] }), 'mom')).toBe(false);
    expect(mayActInPrivateContainer(actingForMom({ scopes: ['vault-proxy'] }, { viaToken: { id: 't', name: 'x', scopes: [] } }), 'mom')).toBe(false);
  });

  test('a vault page: refused without vault-proxy, then bounded by the ceiling with it', async () => {
    const { pdp } = makeEngine();
    const where = { owner: 'mom', vault: 'default', resource: 'vaults/mom/default/Notes' };
    expect(await permitsInVault(pdp, actingForMom(), 'page-read', where)).toBe(false);
    expect(await permitsInVault(pdp, actingForMom({ scopes: ['page-read', 'vault-proxy'] }), 'page-read', where)).toBe(true);
    expect(await permitsInVault(pdp, actingForMom({ scopes: ['page-edit', 'vault-proxy'] }), 'page-edit', where)).toBe(false);
  });

  test('an encrypted store stays shut: no key reaches a proxy subject, even through a handle with the owner\'s keys', () => {
    clearUnlockedPrivateStores();
    const handle = 'proxy-test-handle';
    const kek = randomBytes(32);
    const dek = randomBytes(32);
    try {
      unlockPrivateStores(handle, 'mom', kek);
      setUnlockedDek(handle, 'default', dek);
      const owner = { username: 'mom', roles: [], isAuthenticated: true, privateStoreHandle: handle } as never;
      expect(dekFor(owner, 'mom', 'default')?.equals(dek)).toBe(true);
      expect(dekFor(actingForMom({ scopes: ['page-read', 'vault-proxy'] }, { privateStoreHandle: handle }), 'mom', 'default')).toBeUndefined();
    } finally {
      clearUnlockedPrivateStores();
    }
  });
});

describe('page door and list filter apply the proxy ceiling (#1762 slice 2)', () => {
  // Frontmatter grants mom view outright: tier 1 decides before policy, so
  // only the ceiling ahead of it can refuse a proxy without page-read.
  const PAGE = { title: 'MomsList', uuid: 'm1', access: { view: ['mom'] } };

  async function pip() {
    const { engine } = makeEngine();
    const acl = new PolicyInformationPoint(engine);
    await acl.initialize();
    return acl;
  }

  test('a grant without page-read: refused at the door and not listed, though frontmatter names mom', async () => {
    const acl = await pip();
    const noRead = actingForMom({ scopes: ['page-edit'] });
    expect(await acl.canUserAccessPage(noRead, 'MomsList', 'view', PAGE as never)).toBe(false);
    expect(await acl.filterAccessiblePages(noRead, 'view', [{ title: 'MomsList', metadata: PAGE as never }])).toEqual([]);
  });

  test('with page-read in the grant and held by the actor: allowed and listed alike', async () => {
    const acl = await pip();
    expect(await acl.canUserAccessPage(actingForMom(), 'MomsList', 'view', PAGE as never)).toBe(true);
    expect(await acl.filterAccessiblePages(actingForMom(), 'view', [{ title: 'MomsList', metadata: PAGE as never }])).toEqual(['MomsList']);
  });
});
