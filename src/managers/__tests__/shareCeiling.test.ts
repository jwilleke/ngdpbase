/**
 * #1222 — a share is a delegation, and `hasPermission` applies it as a ceiling.
 *
 * The subject a share visit carries is anonymous plus `viaShare`: what the
 * issuer delegated, and who the issuer is. Three things bound it, in order:
 * the action must be one the share carries, the share must not have expired,
 * and the issuer must STILL hold the action — resolved live, so revoking the
 * issuer's role stops every share they issued on the next request (epic #1225,
 * security-posture P2: a role on the delegator is not authority of the
 * delegate, and neither is a role they used to hold).
 *
 * These assert the property, not the call shape.
 */
vi.unmock('../UserManager');

import UserManager, { ANONYMOUS_SUBJECT } from '../UserManager';
import type { PermissionSubject } from '../UserManager';
import type { ShareGrant } from '../../types/Share';

/** Who holds what, live. Mutated by tests to simulate a revoked role. */
let issuerRoles: string[] = ['editor'];
/** Whether anonymous gets anything from policy — off, so only the share can allow. */
let anonymousAllowed = false;

function makeManager() {
  const m = new UserManager({
    getManager: (name: string) =>
      (name === 'PolicyEvaluator'
        ? {
          evaluateAccess: ({ userContext, action }: { userContext: { roles: string[] }; action: string }) => {
            const roles = userContext.roles;
            if (roles.includes('anonymous')) return Promise.resolve({ allowed: anonymousAllowed });
            if (action === 'page-delete') return Promise.resolve({ allowed: roles.includes('admin') });
            return Promise.resolve({ allowed: roles.includes('editor') || roles.includes('admin') });
          }
        }
        : null)
  });
  const um = m as unknown as { provider: unknown; resolveUserRoles: (u: string) => Promise<string[]> };
  um.provider = {
    getUser: (name: string) =>
      Promise.resolve(name === 'jim' ? { username: 'jim', isActive: true, roles: issuerRoles } : null)
  };
  um.resolveUserRoles = () => Promise.resolve(issuerRoles);
  return m;
}

const grant: ShareGrant = {
  id: 'share-1',
  issuer: 'jim',
  actions: ['page-read', 'asset-read'],
  resources: [{ type: 'page', pattern: 'keyword:trip' }],
  expiresAt: null
};

/** The subject a share visit carries: nobody, bearing what jim delegated. */
const viaShare: PermissionSubject = { ...ANONYMOUS_SUBJECT, viaShare: grant };

beforeEach(() => {
  issuerRoles = ['editor'];
  anonymousAllowed = false;
});

describe('#1222 — the share is the ceiling', () => {
  test('an action the share carries is allowed when the issuer holds it', async () => {
    const m = makeManager();
    expect(await m.hasPermission(viaShare, 'page-read')).toBe(true);
    expect(await m.hasPermission(viaShare, 'asset-read')).toBe(true);
  });

  test('an action outside the share is refused, even one the issuer holds', async () => {
    // jim holds page-edit live; the share never delegated it.
    const m = makeManager();
    expect(await m.hasPermission(viaShare, 'page-edit')).toBe(false);
  });

  test('anonymous without a share gets only what policy gives anonymous', async () => {
    // Proves the allow above is the share, not a permissive policy.
    const m = makeManager();
    expect(await m.hasPermission(ANONYMOUS_SUBJECT, 'page-read')).toBe(false);
  });
});

describe('#1222 — the issuer\'s live authority bounds the share', () => {
  test('an issuer who lost the permission takes every share with them', async () => {
    const m = makeManager();
    expect(await m.hasPermission(viaShare, 'page-read')).toBe(true);
    issuerRoles = [];   // the operator removed jim's editor role
    expect(await m.hasPermission(viaShare, 'page-read')).toBe(false);
  });

  test('an issuer who no longer exists holds nothing', async () => {
    const m = makeManager();
    const orphan: PermissionSubject = { ...ANONYMOUS_SUBJECT, viaShare: { ...grant, issuer: 'gone' } };
    expect(await m.hasPermission(orphan, 'page-read')).toBe(false);
  });

  test('a deactivated issuer holds nothing', async () => {
    const m = makeManager();
    (m as unknown as { provider: unknown }).provider = {
      getUser: () => Promise.resolve({ username: 'jim', isActive: false, roles: issuerRoles })
    };
    expect(await m.hasPermission(viaShare, 'page-read')).toBe(false);
  });

  test('the share cannot carry what the record says if the issuer never held it', async () => {
    // Sabotage: a record edited on disk to delegate page-delete. The issuer
    // check refuses it regardless of what the record claims.
    const m = makeManager();
    const forged: PermissionSubject = { ...ANONYMOUS_SUBJECT, viaShare: { ...grant, actions: ['page-delete'] } };
    expect(await m.hasPermission(forged, 'page-delete')).toBe(false);
  });
});

describe('#1222 — expiry is re-read at every decision', () => {
  test('an expired share is refused', async () => {
    const m = makeManager();
    const expired: PermissionSubject = {
      ...ANONYMOUS_SUBJECT,
      viaShare: { ...grant, expiresAt: new Date(Date.now() - 1000).toISOString() }
    };
    expect(await m.hasPermission(expired, 'page-read')).toBe(false);
  });

  test('a share still in its window is allowed', async () => {
    const m = makeManager();
    const live: PermissionSubject = {
      ...ANONYMOUS_SUBJECT,
      viaShare: { ...grant, expiresAt: new Date(Date.now() + 60_000).toISOString() }
    };
    expect(await m.hasPermission(live, 'page-read')).toBe(true);
  });
});
