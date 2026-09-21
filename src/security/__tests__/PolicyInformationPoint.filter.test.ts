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
 * There is no longer any divergence. The one this file used to document —
 * tier 3, page-ACL markup read from page CONTENT, which the index cannot see —
 * went with the tier in #1431 step 7a, so the filter and the decider now agree
 * tier for tier.
 */
import PolicyInformationPoint from '../PolicyInformationPoint';
import { mayActInPrivateContainer } from '../../utils/privateStoreAccess';
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
          // Mirrors PageManager.checkPrivatePageAccess by CALLING the rule it
          // ends in, rather than restating it. This mock used to grant any
          // admin, and asserted below that admins list other people's private
          // pages — a bypass the real code does not have, and for an encrypted
          // store cannot have: the store key is wrapped only by the owner's
          // password and recovery words, so an admin holds nothing that opens
          // it. A mock that restates a security rule is where the rule drifts.
          checkPrivatePageAccess: async (ctx: { userContext?: unknown }, name: string) => {
            const md = PAGES[name]; if (!md || md.private !== true) return null;
            if (!ctx.userContext) return false;
            return mayActInPrivateContainer(ctx.userContext, CREATORS[String(md.uuid)]);
          }
        };
      }
      if (name === 'UserManager') {
        return {
          userHoldsPermission: async (u: string, a: string) => u === 'jim' && issuerHolds.includes(a),
          // #1431 7b: the author-lock override is asked as a permission. The
          // grant table stands in for policy — keyed by subject, never by role
          // name, so a test cannot pass by holding a role called admin.
          hasPermission: async (subject: { username?: string }, a: string) =>
            (overrideGrants[subject?.username ?? ''] ?? []).includes(a)
        };
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

/** Who holds which permission, standing in for policy (#1431 7b). */
let overrideGrants: Record<string, string[]> = {};

describe('filterAccessiblePages agrees with canUserAccessPage (#1219)', () => {
  let acl: PolicyInformationPoint;
  beforeEach(async () => {
    issuerHolds = ['page-read'];
    acl = new PolicyInformationPoint(makeEngine());
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
    // An admin does NOT see other people's private pages. Not by policy only:
    // a sealed page's key is wrapped by its owner's password and recovery
    // words and nothing else, so there is no key an admin could hold. Diary
    // and SecretTrip are alice's, and are absent.
    expect(await acl.filterAccessiblePages(admin as never, 'view', candidates())).toEqual(['Public', 'AdminPolicy', 'Locked', 'Trip']);
    expect(await acl.filterAccessiblePages(viaShare as never, 'view', candidates())).toEqual(['Trip']);
  });

  test('author-lock is an edit constraint the filter applies like the decider', async () => {
    expect(await acl.filterAccessiblePages(editor as never, 'edit', candidates())).not.toContain('Locked');
    expect(await acl.filterAccessiblePages(alice as never, 'edit', candidates())).toContain('Locked');
  });

  test('the author-lock override in a listing is admin-system, not the admin role (#1431 7b)', async () => {
    // Holding a role named admin is not enough on its own …
    overrideGrants = {};
    expect(await acl.filterAccessiblePages(admin as never, 'edit', candidates())).not.toContain('Locked');
    // … being granted admin-system is, whatever the role is called.
    overrideGrants = { root: ['admin-system'] };
    expect(await acl.filterAccessiblePages(admin as never, 'edit', candidates())).toContain('Locked');
    overrideGrants = {};
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
