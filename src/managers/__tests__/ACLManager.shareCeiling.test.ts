/**
 * ACLManager — share ceiling (#1222, epic #1225).
 *
 * A share visit is an anonymous subject carrying `viaShare`. The evaluator
 * applies the share as a hard ceiling BEFORE every tier — action in the share,
 * page covered by the share's resources, share unexpired, issuer still holding
 * the action live — and then runs the page's own rules as for any anonymous
 * visitor: a private page, a restricted audience or an `access` list refuses.
 * Only after all of that does the share stand in for global policy, which is
 * what lets a share work on an instance whose policy gives anonymous nothing.
 */

import ACLManager from '../ACLManager';
import type { ShareGrant } from '../../types/Share';

/** What jim holds live. Mutated to simulate a revoked role. */
let issuerHolds: string[] = ['page-read', 'page-edit'];
/** Denials the evaluator recorded, with the metadata that attributes them. */
let denials: Array<Record<string, unknown>> = [];

function makeEngine() {
  return {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') {
        return {
          getProperty: (_k: string, d: unknown) => d,
          getResolvedDataPath: () => '/tmp/ngdp-acl-share-test',
          isInitialized: () => true
        };
      }
      if (name === 'PolicyEvaluator') {
        // The instance gives anonymous NOTHING — so an allow can only be the share.
        return {
          evaluateAccess: async ({ userContext }: { userContext: { roles?: string[] } }) => {
            const anon = (userContext.roles ?? []).includes('anonymous');
            return { hasDecision: true, allowed: !anon, reason: 'test', policyName: anon ? 'deny-anon' : 'allow-all' };
          }
        };
      }
      if (name === 'UserManager') {
        return {
          userHoldsPermission: async (username: string, action: string) =>
            username === 'jim' && issuerHolds.includes(action)
        };
      }
      if (name === 'AuditManager') {
        return { logAuditEvent: async (e: Record<string, unknown>) => { denials.push(e); return 'evt'; } };
      }
      return null;
    }
  } as never;
}

const grant: ShareGrant = {
  id: 'share-1',
  issuer: 'jim',
  actions: ['page-read'],
  resources: [{ type: 'page', pattern: 'keyword:trip' }],
  expiresAt: null
};

function ctx(opts: { share?: Partial<ShareGrant>; noShare?: boolean; pageMetadata?: Record<string, unknown> | null; content?: string }) {
  const userContext: Record<string, unknown> = {
    username: 'Anonymous',
    roles: ['anonymous', 'All'],
    isAuthenticated: false
  };
  if (!opts.noShare) {
    userContext.viaShare = { ...grant, ...(opts.share ?? {}) };
  }
  return {
    pageName: 'TripDay1',
    content: opts.content ?? 'hello',
    context: 'view',
    userContext,
    pageMetadata: opts.pageMetadata === undefined ? { 'user-keywords': ['trip'] } : opts.pageMetadata
  } as never;
}

describe('ACLManager share ceiling (#1222)', () => {
  let acl: ACLManager;

  beforeEach(async () => {
    issuerHolds = ['page-read', 'page-edit'];
    denials = [];
    acl = new ACLManager(makeEngine());
    await acl.initialize();
  });

  test('a covered page, a carried action, a live issuer: allowed', async () => {
    expect(await acl.checkPagePermissionWithContext(ctx({}), 'view')).toBe(true);
  });

  test('anonymous without a share is refused by policy — the control', async () => {
    expect(await acl.checkPagePermissionWithContext(ctx({ noShare: true }), 'view')).toBe(false);
  });

  test('an action the share does not carry is refused, though the issuer holds it', async () => {
    expect(await acl.checkPagePermissionWithContext(ctx({}), 'edit')).toBe(false);
  });

  test('a page the share does not cover is refused', async () => {
    expect(await acl.checkPagePermissionWithContext(ctx({ pageMetadata: { 'user-keywords': ['other'] } }), 'view')).toBe(false);
  });

  test('a page whose metadata cannot be read is refused — conservative on security', async () => {
    expect(await acl.checkPagePermissionWithContext(ctx({ pageMetadata: null }), 'view')).toBe(false);
  });

  test('an issuer who lost the permission takes the share with them', async () => {
    expect(await acl.checkPagePermissionWithContext(ctx({}), 'view')).toBe(true);
    issuerHolds = [];
    expect(await acl.checkPagePermissionWithContext(ctx({}), 'view')).toBe(false);
  });

  test('an expired share is refused', async () => {
    const share = { expiresAt: new Date(Date.now() - 1000).toISOString() };
    expect(await acl.checkPagePermissionWithContext(ctx({ share }), 'view')).toBe(false);
  });

  test('the ceiling beats permissive frontmatter (tier 1 would otherwise win)', async () => {
    // `access.edit: ['All']` grants edit at tier 1 and returns directly. The
    // share carries only page-read, and that must be decided first.
    const pageMetadata = { 'user-keywords': ['trip'], access: { edit: ['All'] } };
    expect(await acl.checkPagePermissionWithContext(ctx({ pageMetadata }), 'edit')).toBe(false);
  });
});

describe('ACLManager share ceiling — the page\'s own rules still apply (#1222)', () => {
  let acl: ACLManager;

  beforeEach(async () => {
    issuerHolds = ['page-read'];
    denials = [];
    acl = new ACLManager(makeEngine());
    await acl.initialize();
  });

  test('a private page is refused through a share that names it', async () => {
    const pageMetadata = { 'user-keywords': ['trip'], private: true, author: 'jim' };
    expect(await acl.checkPagePermissionWithContext(ctx({ pageMetadata }), 'view')).toBe(false);
  });

  test('a restricted audience refuses the anonymous share visitor', async () => {
    const pageMetadata = { 'user-keywords': ['trip'], audience: ['Authenticated'] };
    expect(await acl.checkPagePermissionWithContext(ctx({ pageMetadata }), 'view')).toBe(false);
  });

  test('an access list that excludes anonymous refuses the share visitor', async () => {
    const pageMetadata = { 'user-keywords': ['trip'], access: { view: ['editor'] } };
    expect(await acl.checkPagePermissionWithContext(ctx({ pageMetadata }), 'view')).toBe(false);
  });

  test('owner-only content is refused whatever the share says', async () => {
    const pageMetadata = { 'user-keywords': ['trip', 'owner-only'] };
    expect(await acl.checkPagePermissionWithContext(ctx({ pageMetadata }), 'view')).toBe(false);
  });
});

describe('ACLManager share ceiling — attribution (#1222)', () => {
  test('a denial names the share and its issuer', async () => {
    issuerHolds = ['page-read'];
    denials = [];
    const acl = new ACLManager(makeEngine());
    await acl.initialize();
    await acl.checkPagePermissionWithContext(ctx({}), 'edit');
    await new Promise((r) => setTimeout(r, 0));   // auditDenial is fire-and-forget
    const deny = denials.find((d) => d.eventType === 'authorization-deny');
    expect(deny).toBeDefined();
    expect(deny?.user).toBe('Anonymous');
    expect(deny?.metadata).toMatchObject({ viaShareId: 'share-1', viaShareIssuer: 'jim' });
  });
});
