/**
 * #1219 — deciding one and filtering many are the same evaluator.
 *
 * `filterAccessiblePages` is rule 10's `filter(ctx, action, query)`: the tiers
 * `_runEvaluator` applies to one page, applied over the page index without a
 * disk read, a log line or an audit record per page. The property that
 * matters is agreement with `canUserAccessPage` in BOTH directions — nothing
 * listed that cannot be opened, nothing hidden that can be — so every fixture
 * here is checked both ways. Sabotage: make the filter trust `audienceRoles`
 * instead of frontmatter, or skip tier 0, and a pair goes red.
 *
 * The one deliberate divergence: tier 3 (deprecated page-ACL markup, blocked on
 * new saves) needs page CONTENT and is not indexed. A page whose only grant is
 * that markup is hidden from listings — the conservative direction.
 */
import ACLManager from '../ACLManager';
import type { ShareGrant } from '../../types/Share';

type Meta = Record<string, unknown>;

/** The corpus: title → frontmatter. Private pages also carry an index creator. */
const PAGES: Record<string, Meta> = {
  Public:        { title: 'Public', uuid: 'p1' },
  EditorsOnly:   { title: 'EditorsOnly', uuid: 'p2', audience: ['editor'] },
  AccessList:    { title: 'AccessList', uuid: 'p3', access: { view: ['bob'] } },
  Diary:         { title: 'Diary', uuid: 'p4', private: true, author: 'alice' },
  AdminPolicy:   { title: 'AdminPolicy', uuid: 'p5' },
  Locked:        { title: 'Locked', uuid: 'p6', 'author-lock': true, author: 'alice' },
  Trip:          { title: 'Trip', uuid: 'p7', 'user-keywords': ['trip'] },
  SecretTrip:    { title: 'SecretTrip', uuid: 'p8', 'user-keywords': ['trip'], private: true, author: 'alice' }
};
const CREATORS: Record<string, string> = { p4: 'alice', p8: 'alice' };

let issuerHolds: string[] = ['page-read'];

function makeEngine() {
  return {
    getManager: (name: string) => {
      if (name === 'ConfigurationManager') {
        return { getProperty: (_k: string, d: unknown) => d, getResolvedDataPath: () => '/tmp/ngdp-acl-filter-test', isInitialized: () => true };
      }
      if (name === 'PolicyEvaluator') {
        // Shipped shape: anonymous reads everything but Admin*; editors edit; admins everything.
        const decide = (userContext: { roles?: string[] }, pageName: string, action: string) => {
          const roles = userContext.roles ?? [];
          if (roles.includes('admin')) return { hasDecision: true, allowed: true, policyName: 'admin' };
          if (pageName.startsWith('Admin')) return { hasDecision: true, allowed: false, policyName: 'admin-only' };
          if (action === 'page-read') return { hasDecision: true, allowed: true, policyName: 'read' };
          if (action === 'page-edit') return { hasDecision: true, allowed: roles.includes('editor'), policyName: 'edit' };
          return { hasDecision: false, allowed: false, policyName: null };
        };
        return {
          evaluateAccess: async ({ userContext, pageName, action }: { userContext: { roles?: string[] }; pageName: string; action: string }) =>
            ({ ...decide(userContext, pageName, action), reason: 'test' }),
          compile: (userContext: { roles?: string[] }, action: string) => (pageName: string) =>
            ({ ...decide(userContext, pageName, action), reason: 'test' })
        };
      }
      if (name === 'PageManager') {
        return {
          getPageMetadata: async (name: string) => PAGES[name] ?? null,
          // The real one reads the index creator; mirror it from the fixture.
          checkPrivatePageAccess: async (ctx: { userContext?: { username?: string }; hasRole?: (r: string) => boolean }, name: string) => {
            const md = PAGES[name]; if (!md || md.private !== true) return null;
            const username = ctx.userContext?.username; if (!username) return false;
            if (ctx.hasRole?.('admin')) return true;
            return username === CREATORS[String(md.uuid)];
          }
        };
      }
      if (name === 'UserManager') {
        return { userHoldsPermission: async (u: string, a: string) => u === 'jim' && issuerHolds.includes(a) };
      }
      if (name === 'AuditManager') {
        return { logAuditEvent: async () => 'evt' };
      }
      return null;
    }
  } as never;
}

const anonymous = { username: 'Anonymous', roles: ['anonymous', 'All'], isAuthenticated: false };
const bob       = { username: 'bob', roles: ['reader', 'Authenticated', 'All'], isAuthenticated: true };
const editor    = { username: 'ed', roles: ['editor', 'Authenticated', 'All'], isAuthenticated: true };
const alice     = { username: 'alice', roles: ['editor', 'Authenticated', 'All'], isAuthenticated: true };
const admin     = { username: 'root', roles: ['admin', 'Authenticated', 'All'], isAuthenticated: true };
const viaReadToken = { ...editor, viaToken: { id: 't', name: 'ro', scopes: ['page-read'] } };
const grant: ShareGrant = { id: 's', issuer: 'jim', actions: ['page-read'], resources: [{ type: 'page', pattern: 'keyword:trip' }], expiresAt: null };
const viaShare = { ...anonymous, viaShare: grant };

const candidates = () => Object.keys(PAGES).map((title) => ({ title, metadata: PAGES[title] as never }));

describe('filterAccessiblePages agrees with canUserAccessPage (#1219)', () => {
  let acl: ACLManager;
  beforeEach(async () => {
    issuerHolds = ['page-read'];
    acl = new ACLManager(makeEngine());
    await acl.initialize();
  });

  const subjects: Array<[string, Record<string, unknown>]> = [
    ['anonymous', anonymous], ['bob', bob], ['editor', editor], ['alice', alice], ['admin', admin],
    ['read-only token', viaReadToken], ['share for trip', viaShare]
  ];

  test.each(subjects)('%s: view — listed ⇔ openable, for every page', async (_label, subject) => {
    const listed = new Set(await acl.filterAccessiblePages(subject, 'view', candidates()));
    for (const title of Object.keys(PAGES)) {
      const one = await acl.canUserAccessPage(subject, title, 'view');
      expect(listed.has(title), `${_label} / ${title}: filter=${listed.has(title)} decide=${one}`).toBe(one);
    }
  });

  test.each(subjects)('%s: edit — listed ⇔ openable, for every page', async (_label, subject) => {
    const listed = new Set(await acl.filterAccessiblePages(subject, 'edit', candidates()));
    for (const title of Object.keys(PAGES)) {
      const one = await acl.canUserAccessPage(subject, title, 'edit');
      expect(listed.has(title), `${_label} / ${title}`).toBe(one);
    }
  });

  test('the fixtures exercise every tier — a pinned expectation, not just agreement', async () => {
    // Agreement alone would pass if both sides were broken the same way.
    expect(await acl.filterAccessiblePages(anonymous as never, 'view', candidates())).toEqual(['Public', 'Locked', 'Trip']);
    expect(await acl.filterAccessiblePages(bob as never, 'view', candidates())).toEqual(['Public', 'AccessList', 'Locked', 'Trip']);
    expect(await acl.filterAccessiblePages(editor as never, 'view', candidates())).toEqual(['Public', 'EditorsOnly', 'Locked', 'Trip']);
    expect(await acl.filterAccessiblePages(alice as never, 'view', candidates())).toEqual(['Public', 'EditorsOnly', 'Diary', 'Locked', 'Trip', 'SecretTrip']);
    // An audience or access list is a resource attribute and beats global
    // policy for everyone — an admin is not in `['editor']` either. The
    // private bypass IS the admin's: Diary and SecretTrip are listed.
    expect(await acl.filterAccessiblePages(admin as never, 'view', candidates())).toEqual(['Public', 'Diary', 'AdminPolicy', 'Locked', 'Trip', 'SecretTrip']);
    expect(await acl.filterAccessiblePages(viaShare as never, 'view', candidates())).toEqual(['Trip']);
  });

  test('author-lock is an edit constraint the filter applies like the decider', async () => {
    expect(await acl.filterAccessiblePages(editor as never, 'edit', candidates())).not.toContain('Locked');
    expect(await acl.filterAccessiblePages(alice as never, 'edit', candidates())).toContain('Locked');
  });

  test('a token without the scope lists nothing', async () => {
    expect(await acl.filterAccessiblePages(viaReadToken as never, 'edit', candidates())).toEqual([]);
  });

  test('a share whose issuer lost the permission lists nothing', async () => {
    issuerHolds = [];
    expect(await acl.filterAccessiblePages(viaShare as never, 'view', candidates())).toEqual([]);
  });

  test('a candidate with no metadata is not listed — conservative on security', async () => {
    const out = await acl.filterAccessiblePages(admin, 'view', [{ title: 'Ghost', metadata: null }]);
    expect(out).toEqual([]);
  });

  test('order of the candidates is preserved', async () => {
    const reversed = candidates().reverse();
    const forward = new Set(await acl.filterAccessiblePages(admin, 'view', candidates()));
    const out = await acl.filterAccessiblePages(admin, 'view', reversed);
    expect(out).toEqual(reversed.map((c) => c.title).filter((t) => forward.has(t)));
  });
});
