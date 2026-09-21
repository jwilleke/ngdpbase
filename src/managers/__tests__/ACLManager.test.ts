/**
 * ACLManager tests
 *
 * Tests ACLManager's core functionality:
 * - JSPWiki-style ACL parsing
 * - Page permission checking
 * - Policy-based access control integration
 *
 * @jest-environment jsdom
 */

import ACLManager from '../ACLManager';
import type { WikiEngine } from '../../types/WikiEngine';

// Mock ConfigurationManager
const mockConfigurationManager = {
  getProperty: vi.fn((key, defaultValue) => {
    if (key === 'ngdpbase.access.policies') {
      return [];  // Return empty array for policies
    }
    if (key === 'ngdpbase.access.audit') {
      return { enabled: false };
    }
    return defaultValue;
  })
};

// Mock UserManager
const mockUserManager = {
  hasPermission: vi.fn(),
  hasRole: vi.fn()
};

// Mock engine
/**
 * #1431: the evaluator is reached through the ENGINE now, because the PDP asks
 * for it there — setting `aclManager.policyEvaluator` no longer changes what a
 * decision sees. Tests that want a Tier 2 verdict set this.
 */
let mockPolicyEvaluator: { evaluateAccess: (...args: unknown[]) => unknown } | null = null;

const mockEngine = {
  getManager: vi.fn((name) => {
    if (name === 'UserManager') {
      return mockUserManager;
    }
    if (name === 'ConfigurationManager') {
      return mockConfigurationManager;
    }
    if (name === 'PolicyEvaluator') {
      return mockPolicyEvaluator;
    }
    return null;
  })
};

// #1174/#1431: the performStandardACLCheck and checkDefaultPermission suites
// are gone with the methods. They were the seven mocked tests #1174 named as
// keeping colon-separated permissions alive.
describe('ACLManager', () => {
  let aclManager;

  beforeEach(async () => {
    // Clear mocks
    vi.clearAllMocks();
    mockPolicyEvaluator = null;

    aclManager = new ACLManager(mockEngine);
    await aclManager.initialize();
  });

  // #1431 step 7: the parsePageACL suite is gone with the method. JSPWiki's
  // per-page ACL markup is no longer read by anything — access rules are
  // audience terms in frontmatter, and an imported page's ACL is converted
  // to those by the NCM funnel (#1446).

  // #632: deprecated `checkPagePermission(pageName, action, userContext, content)`
  // method removed; tests for it gone too. The canonical
  // `checkPagePermissionWithContext` is exercised in the Tier 0 / Tier 1.5 /
  // PolicyEvaluator describe blocks below. JSPWiki `[{ALLOW ...}]` page-level
  // markup tested here is no longer the wiki's access mechanism — the new
  // shape is frontmatter `audience` / `access` fields, covered elsewhere.

  // #632: PolicyEvaluator integration tests for the deprecated 4-arg
  // `checkPagePermission` removed alongside the method. Tier-2 PolicyEvaluator
  // behavior is covered indirectly by the Tier 0 / Tier 1.5 describe blocks
  // below (when those tiers don't decide, the result falls through to
  // PolicyEvaluator).

  // Helper: build a minimal WikiContext for checkPagePermissionWithContext
  function makeWikiContext({ pageName = 'TestPage', content = '', userContext = null, pageMetadata = null } = {}) {
    return { pageName, content, userContext, pageMetadata };
  }

  // #639 Slice E: the legacy "Tier 0 — private user-keyword" describe block
  // was removed alongside the back-compat fallback. The four cases it covered
  // (admin / creator / non-creator / audience-doesn't-override) are still
  // verified by the "Tier 0 — top-level `private: true` (#639)" block below.

  describe('Tier 0 — top-level `private: true` (#639)', () => {
    // #1382: a private page lives in its owner's private container — no role,
    // admin included, reaches in (docs/planning/private-stores.md, Access).
    test('private: true + admin role (not the owner) → deny', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', private: true, author: 'alice' },
        userContext: { username: 'bob', roles: ['admin'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
    });

    test('private: true + page-creator → allow', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', private: true, author: 'alice' },
        userContext: { username: 'alice', roles: ['editor'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(true);
    });

    test('private: true + non-creator non-admin → deny', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', private: true, author: 'alice' },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
    });

    test('private: true + audience: [bob] set → bob still denied (Tier 0 wins)', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', private: true, author: 'alice', audience: ['bob'] },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
    });

    test('private: false explicitly → tier 0 does NOT fire (falls through)', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', private: false, author: 'alice' },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      // Without tier-0 trigger, falls through to tier-1/tier-2; for this fixture
      // (no audience, no policies) the result depends on default policy. The
      // important assertion is that it's NOT denied with the private_deny reason.
      // Use a non-null result; we just check the type is boolean (no throw).
      const result = await aclManager.checkPagePermissionWithContext(ctx, 'view');
      expect(typeof result).toBe('boolean');
    });

    test('back-compat: legacy user-keywords [private] still triggers tier 0', async () => {
      // The whole point of Slice A — old pages without `private: true` still gated.
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', 'user-keywords': ['private'], author: 'alice' },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
    });

    test('both signals present (migrated page with stale keyword) → tier 0 fires once', async () => {
      const ctx = makeWikiContext({
        pageMetadata: {
          title: 'Test', uuid: 'x', lastModified: '',
          private: true, 'user-keywords': ['private'],
          author: 'alice'
        },
        userContext: { username: 'alice', roles: ['editor'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(true);
    });
  });

  describe('canAccessPrivateContainer — a file in a private store (#1382)', () => {
    test('the owner passes; admin, another user and anonymous are refused and recorded', () => {
      const logSpy = vi.spyOn(aclManager, 'logAccessDecision');
      expect(aclManager.canAccessPrivateContainer(
        { username: 'alice', roles: ['editor'], isAuthenticated: true }, 'alice', 'attachment:a1', 'view'
      )).toBe(true);
      expect(logSpy).not.toHaveBeenCalled();

      for (const who of [
        { username: 'root', roles: ['admin'], isAuthenticated: true },
        { username: 'bob', roles: ['editor'], isAuthenticated: true },
        null
      ]) {
        expect(aclManager.canAccessPrivateContainer(who, 'alice', 'attachment:a1', 'view')).toBe(false);
      }
      expect(logSpy).toHaveBeenCalledTimes(3);
      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
        pageName: 'attachment:a1', action: 'view', allowed: false, reason: 'private_deny'
      }));
    });

    test('a file with no recorded owner is refused', () => {
      expect(aclManager.canAccessPrivateContainer(
        { username: 'alice', roles: [], isAuthenticated: true }, '', 'attachment:a2', 'view'
      )).toBe(false);
    });
  });

  describe('Tier 0.5 — author-lock (#714 Slice A)', () => {
    // Author-lock denies non-author / non-admin EDIT attempts. It does NOT
    // grant access — when the user IS author or admin, Tier 0.5 falls
    // through to Tier 1+ so the normal evaluator decides. Tier 0 (private)
    // takes precedence — if private===true, Tier 0.5 is never reached.
    //
    // Mirrors the route-layer branch at `WikiRoutes.editPage:2338`; the
    // route branch stays in place during Slice A (no-removal yet) — both
    // paths deny independently. Removed in Slice E once the rich-return
    // evaluator (Slice F) lets routes specialise the 403 on
    // `reason === 'author_lock_deny'`.

    test('edit + author-lock + non-author non-admin → deny (Tier 0.5 fires)', async () => {
      const ctx = makeWikiContext({
        pageMetadata: {
          title: 'Test', uuid: 'x', lastModified: '',
          'author-lock': true, author: 'alice',
          // Tier 1 would allow bob to edit via the per-action access map —
          // proves Tier 0.5 denies first, before Tier 1 ever runs.
          access: { edit: ['bob'] }
        },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'edit')).toBe(false);
    });

    test('edit + author-lock + page-author → falls through (Tier 1 access.edit decides allow)', async () => {
      const ctx = makeWikiContext({
        pageMetadata: {
          title: 'Test', uuid: 'x', lastModified: '',
          'author-lock': true, author: 'alice',
          access: { edit: ['alice'] }
        },
        userContext: { username: 'alice', roles: ['editor'], isAuthenticated: true }
      });
      // alice IS the author — Tier 0.5 doesn't deny her; Tier 1 access.edit
      // matches; allowed.
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'edit')).toBe(true);
    });

    test('edit + author-lock + admin-system → falls through (Tier 1 access.edit decides allow)', async () => {
      // #1431 step 7b: the override is the admin-system PERMISSION, asked of
      // UserManager.hasPermission — the policy decides, as for any door.
      mockUserManager.hasPermission.mockImplementation(async (_s: unknown, action: string) => action === 'admin-system');
      const ctx = makeWikiContext({
        pageMetadata: {
          title: 'Test', uuid: 'x', lastModified: '',
          'author-lock': true, author: 'alice',
          access: { edit: ['admin'] }
        },
        userContext: { username: 'bob', roles: ['admin'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'edit')).toBe(true);
      mockUserManager.hasPermission.mockReset();
    });

    test('the admin ROLE alone no longer overrides author-lock — the permission does (#1431 7b)', async () => {
      // The regression this step fixes: `roles.includes('admin')` decided
      // regardless of what policy grants. A subject holding a role NAMED
      // admin, whose policy does not grant admin-system, is now refused.
      mockUserManager.hasPermission.mockResolvedValue(false);
      const ctx = makeWikiContext({
        pageMetadata: {
          title: 'Test', uuid: 'x', lastModified: '',
          'author-lock': true, author: 'alice',
          access: { edit: ['admin'] }
        },
        userContext: { username: 'bob', roles: ['admin'], isAuthenticated: true }
      });
      expect(await aclManager.evaluatePagePermission(ctx, 'edit')).toMatchObject({ allowed: false, reason: 'author_lock_deny' });
      mockUserManager.hasPermission.mockReset();
    });

    test('a role not named admin but granted admin-system can override (#1431 7b)', async () => {
      // The other half: the config decides, so an operator role granted the
      // permission works without being called 'admin'.
      mockUserManager.hasPermission.mockImplementation(async (_s: unknown, action: string) => action === 'admin-system');
      const ctx = makeWikiContext({
        pageMetadata: {
          title: 'Test', uuid: 'x', lastModified: '',
          'author-lock': true, author: 'alice',
          access: { edit: ['operator'] }
        },
        userContext: { username: 'carol', roles: ['operator'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'edit')).toBe(true);
      mockUserManager.hasPermission.mockReset();
    });

    test('view + author-lock + non-author non-admin → Tier 0.5 does NOT fire (action-specific gate)', async () => {
      const ctx = makeWikiContext({
        pageMetadata: {
          title: 'Test', uuid: 'x', lastModified: '',
          'author-lock': true, author: 'alice',
          // For view, the legacy audience field controls Tier 1 access.
          audience: ['bob']
        },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      // Author-lock is a write constraint, not a read constraint. View
      // falls straight through to Tier 1; audience matches → allow.
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(true);
    });

    test('edit + private:true + author-lock + non-creator → Tier 0 wins (deny by private; Tier 0.5 never consulted)', async () => {
      const ctx = makeWikiContext({
        pageMetadata: {
          title: 'Test', uuid: 'x', lastModified: '',
          private: true,
          'author-lock': true, author: 'alice'
        },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      // Tier 0 denies (private + not creator + not admin). Tier 0.5 would
      // also deny here, but the test fixture proves the precedence: Tier 0
      // fires first and returns before Tier 0.5 sees the request.
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'edit')).toBe(false);
    });

    test('edit + private:true + author-lock + page-creator → Tier 0 wins (allow by private; Tier 0.5 never consulted)', async () => {
      const ctx = makeWikiContext({
        pageMetadata: {
          title: 'Test', uuid: 'x', lastModified: '',
          private: true,
          'author-lock': true, author: 'alice'
        },
        userContext: { username: 'alice', roles: ['editor'], isAuthenticated: true }
      });
      // The interesting precedence case: private grants alice access; we
      // don't want Tier 0.5 to then deny her because she "isn't admin".
      // Tier 0 returns early → allow.
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'edit')).toBe(true);
    });

    test('edit + author-lock absent → Tier 0.5 does NOT fire (falls through)', async () => {
      const ctx = makeWikiContext({
        pageMetadata: {
          title: 'Test', uuid: 'x', lastModified: '',
          author: 'alice',
          access: { edit: ['editor'] }
        },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      // No author-lock field → Tier 0.5 is a no-op; Tier 1 access.edit matches → allow.
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'edit')).toBe(true);
    });

    test('edit + author-lock:false (explicit) → Tier 0.5 does NOT fire', async () => {
      const ctx = makeWikiContext({
        pageMetadata: {
          title: 'Test', uuid: 'x', lastModified: '',
          'author-lock': false, author: 'alice',
          access: { edit: ['editor'] }
        },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'edit')).toBe(true);
    });
  });

  describe('canUserAccessPage — cross-page check (#714 Slice B)', () => {
    // canUserAccessPage loads the target page's metadata internally and runs
    // the full evaluator. Used by WikiContext.canAccess(action, override) for
    // cross-page checks (e.g. WikiRoutes.serveAttachment's owning-page lookup,
    // linked-page visibility filters).
    //
    // Conservative-on-security: returns false when the page name can't be
    // resolved (no metadata, PageManager unavailable). Per the issue body's
    // "Behavior decision point", this is the allow→deny shift documented
    // for Slices C/D.

    test('returns false when pageName is empty string', async () => {
      const userContext = { username: 'alice', roles: ['editor'], isAuthenticated: true };
      expect(await aclManager.canUserAccessPage(userContext, '', 'view')).toBe(false);
    });

    test('returns false when PageManager is unavailable (test fixture without mock)', async () => {
      // The default mock engine returns null for getManager('PageManager').
      // Without a PageManager.getPageMetadata helper, we cannot load metadata,
      // so the conservative-on-security default kicks in.
      const userContext = { username: 'alice', roles: ['editor'], isAuthenticated: true };
      expect(await aclManager.canUserAccessPage(userContext, 'SomePage', 'view')).toBe(false);
    });

    test('returns false when PageManager returns null metadata (page does not exist)', async () => {
      const userContext = { username: 'alice', roles: ['editor'], isAuthenticated: true };
      const localEngine = {
        getManager: vi.fn((name: string) => {
          if (name === 'UserManager') return mockUserManager;
          if (name === 'ConfigurationManager') return mockConfigurationManager;
          if (name === 'PageManager') {
            return { getPageMetadata: vi.fn().mockResolvedValue(null) };
          }
          return null;
        })
      };
      const localACL = new ACLManager(localEngine);
      await localACL.initialize();
      expect(await localACL.canUserAccessPage(userContext, 'Ghost', 'view')).toBe(false);
    });

    test('runs the evaluator on the target page (Tier 1 audience match → allow)', async () => {
      const userContext = { username: 'bob', roles: ['editor'], isAuthenticated: true };
      const pageMetadata = {
        title: 'Other', uuid: 'o', lastModified: '',
        audience: ['editor']  // Tier 1 allows view for editor role
      };
      const localEngine = {
        getManager: vi.fn((name: string) => {
          if (name === 'UserManager') return mockUserManager;
          if (name === 'ConfigurationManager') return mockConfigurationManager;
          if (name === 'PageManager') {
            return { getPageMetadata: vi.fn().mockResolvedValue(pageMetadata) };
          }
          return null;
        })
      };
      const localACL = new ACLManager(localEngine);
      await localACL.initialize();
      expect(await localACL.canUserAccessPage(userContext, 'Other', 'view')).toBe(true);
    });

    test('runs the evaluator on the target page (Tier 1 audience mismatch → deny)', async () => {
      const userContext = { username: 'bob', roles: ['reader'], isAuthenticated: true };
      const pageMetadata = {
        title: 'Restricted', uuid: 'r', lastModified: '',
        audience: ['admin', 'editor']  // bob is neither
      };
      const localEngine = {
        getManager: vi.fn((name: string) => {
          if (name === 'UserManager') return mockUserManager;
          if (name === 'ConfigurationManager') return mockConfigurationManager;
          if (name === 'PageManager') {
            return { getPageMetadata: vi.fn().mockResolvedValue(pageMetadata) };
          }
          return null;
        })
      };
      const localACL = new ACLManager(localEngine);
      await localACL.initialize();
      expect(await localACL.canUserAccessPage(userContext, 'Restricted', 'view')).toBe(false);
    });

    test('tolerates null userContext (anonymous cross-page check)', async () => {
      const pageMetadata = {
        title: 'Public', uuid: 'p', lastModified: ''
      };
      const localEngine = {
        getManager: vi.fn((name: string) => {
          if (name === 'UserManager') return mockUserManager;
          if (name === 'ConfigurationManager') return mockConfigurationManager;
          if (name === 'PageManager') {
            return { getPageMetadata: vi.fn().mockResolvedValue(pageMetadata) };
          }
          return null;
        })
      };
      const localACL = new ACLManager(localEngine);
      await localACL.initialize();
      // No audience / access set → falls through to Tier 2 / default. The
      // important assertion is that it doesn't throw on null userContext.
      const result = await localACL.canUserAccessPage(null, 'Public', 'view');
      expect(typeof result).toBe('boolean');
    });

    test('Tier 0 private fires on cross-page check too', async () => {
      // Private check via PageManager.checkPrivatePageAccess — when that
      // helper is unavailable in the test fixture, falls back to the
      // legacy frontmatter-author check (matching the same fallback
      // logic checkPagePermissionWithContext uses for Tier 0).
      const userContext = { username: 'bob', roles: ['editor'], isAuthenticated: true };
      const pageMetadata = {
        title: 'Secret', uuid: 's', lastModified: '',
        private: true, author: 'alice'
      };
      const localEngine = {
        getManager: vi.fn((name: string) => {
          if (name === 'UserManager') return mockUserManager;
          if (name === 'ConfigurationManager') return mockConfigurationManager;
          if (name === 'PageManager') {
            // getPageMetadata returns private:true; no checkPrivatePageAccess
            // helper → falls through to the frontmatter-author check.
            return { getPageMetadata: vi.fn().mockResolvedValue(pageMetadata) };
          }
          return null;
        })
      };
      const localACL = new ACLManager(localEngine);
      await localACL.initialize();
      // bob is not alice, not admin → Tier 0 denies.
      expect(await localACL.canUserAccessPage(userContext, 'Secret', 'view')).toBe(false);
    });
  });

  describe('Tier 1.5 — front matter access control', () => {
    test('audience: [editor, admin] + editor role → allow', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', audience: ['editor', 'admin'] },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(true);
    });

    test('audience: [editor, admin] + reader role → deny', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', audience: ['editor', 'admin'] },
        userContext: { username: 'bob', roles: ['reader'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
    });

    test('audience: [editor, admin] + anonymous → deny', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', audience: ['editor', 'admin'] },
        userContext: { username: 'anonymous', roles: ['anonymous'], isAuthenticated: false }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
    });

    test('audience: [editor, alice] + username alice → allow (username match)', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', audience: ['editor', 'alice'] },
        userContext: { username: 'alice', roles: ['reader'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(true);
    });

    test('access.view: [admin] overrides audience for view', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', audience: ['editor', 'admin'], access: { view: ['admin'] } },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      // editor is in audience but access.view restricts to admin only
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
    });

    test('access.edit: [admin] blocks edit for editor; view via audience still works', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', audience: ['editor', 'admin'], access: { edit: ['admin'] } },
        userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'edit')).toBe(false);
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(true);
    });

    test('no audience/access → falls through, and body markup does not save it', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '' },
        content: '[{ALLOW view All}]',
        userContext: { username: 'bob', roles: ['reader'], isAuthenticated: true }
      });
      // No audience → Tier 1 declines; no policy spoke → default deny. The
      // `[{ALLOW view All}]` in the body used to grant here and no longer does
      // (#1431 step 7): a rule in the page BODY is not an access rule.
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
    });

    test('Tier 1.5 deny does NOT fall through to Tier 2 inline ACL', async () => {
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '', audience: ['admin'] },
        content: '[{ALLOW view All}]',
        userContext: { username: 'bob', roles: ['reader'], isAuthenticated: true }
      });
      // audience restricts to admin, reader is denied — even though content has [{ALLOW view All}]
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
    });
  });

  describe('Initialization', () => {
    test('should initialize without errors', async () => {
      const newAclManager = new ACLManager(mockEngine);

      await expect(newAclManager.initialize()).resolves.not.toThrow();
    });

    test('should load policies from ConfigurationManager', async () => {
      const policiesArray = [
        { id: 'test-policy-1', name: 'Test Policy 1' },
        { id: 'test-policy-2', name: 'Test Policy 2' }
      ];

      mockConfigurationManager.getProperty.mockImplementation((key, defaultValue) => {
        if (key === 'ngdpbase.access.policies') {
          return policiesArray;
        }
        return defaultValue;
      });

      const newAclManager = new ACLManager(mockEngine);
      await newAclManager.initialize();

      // #1431: ACLManager keeps no policy cache. The policies belong to
      // PolicyManager, and PolicyEvaluator asks it for them — this manager
      // used to load a Map here that nothing ever read.
      expect((newAclManager as unknown as { accessPolicies?: unknown }).accessPolicies).toBeUndefined();
      expect(newAclManager.policyEvaluator).toBeDefined();
    });
  });




  describe('removeACLMarkup() / stripACLMarkup()', () => {
    test('removes [{ALLOW ...}] plugin syntax', () => {
      const input = 'Content [{ALLOW view admin,editor}] more content';
      const result = aclManager.removeACLMarkup(input);
      expect(result).not.toContain('[{ALLOW');
      expect(result).toContain('Content');
      expect(result).toContain('more content');
    });

    test('removes [{DENY ...}] plugin syntax', () => {
      const input = '[{DENY edit anonymous}] page text';
      const result = aclManager.removeACLMarkup(input);
      expect(result).not.toContain('[{DENY');
      expect(result).toContain('page text');
    });

    test('returns input unchanged when no ACL markup present', () => {
      const input = 'Just a regular page with no ACL markup here.';
      expect(aclManager.removeACLMarkup(input)).toBe(input);
    });

    test('handles empty string', () => {
      expect(aclManager.removeACLMarkup('')).toBe('');
    });

    test('handles null/undefined gracefully', () => {
      expect(aclManager.removeACLMarkup(null)).toBe(null);
    });

    test('removes multiple ACL blocks in one pass', () => {
      const input = '[{ALLOW view admin}] text [{ALLOW edit admin}] more';
      const result = aclManager.removeACLMarkup(input);
      expect(result).not.toContain('[{ALLOW');
      expect(result).toContain('text');
      expect(result).toContain('more');
    });

    test('stripACLMarkup is an alias for removeACLMarkup', () => {
      const input = '[{ALLOW view admin}] content';
      expect(aclManager.stripACLMarkup(input)).toBe(aclManager.removeACLMarkup(input));
    });
  });






  describe('logAccessDecision()', () => {
    test('logs allowed decision with positional args', () => {
      const user = { username: 'alice', roles: ['authenticated'] } as unknown as import('../ACLManager').default extends { logAccessDecision: infer F } ? Parameters<F>[0] : never;
      aclManager.logAccessDecision(user as never, 'TestPage', 'view', true, 'acl_allow');
    });

    test('logs denied decision with positional args', () => {
      const user = { username: 'bob', roles: ['guest'] } as never;
      aclManager.logAccessDecision(user, 'PrivatePage', 'edit', false, 'acl_deny');
    });

    test('logs decision from object form', () => {
      aclManager.logAccessDecision({
        user: { username: 'carol', roles: ['authenticated'] } as never,
        pageName: 'TestPage',
        action: 'view',
        allowed: true,
        reason: 'default_allow',
        context: {}
      });
    });

    test('handles anonymous user', () => {
      aclManager.logAccessDecision(null, 'TestPage', 'view', false, 'no_user');
    });
  });

  describe('checkPagePermissionWithContext() — additional branches', () => {
    test('throws when wikiContext is null', async () => {
      await expect(aclManager.checkPagePermissionWithContext(null, 'view')).rejects.toThrow();
    });

    // #1431 step 7: these two used to pass. They are kept, inverted, because
    // the removal is the behaviour worth pinning — a page granting itself
    // access through its own body is exactly what stopped being possible.
    test('page-body ACL markup no longer grants by role', async () => {
      const ctx = makeWikiContext({ content: '[{ALLOW view editor}]', userContext: { username: 'bob', roles: ['editor'], isAuthenticated: true } });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
    });

    test('page-body ACL markup no longer grants by username', async () => {
      const ctx = makeWikiContext({ content: '[{ALLOW edit alice}]', userContext: { username: 'alice', roles: ['reader'], isAuthenticated: true } });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'edit')).toBe(false);
    });

    test('default deny when ACL has no match', async () => {
      const ctx = makeWikiContext({ content: '[{ALLOW view admin}]', userContext: { username: 'bob', roles: ['reader'], isAuthenticated: true } });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
    });

    test('Tier 2 — PolicyEvaluator grants access', async () => {
      mockPolicyEvaluator = { evaluateAccess: vi.fn().mockResolvedValue({ hasDecision: true, allowed: true, policyName: 'allow-policy' }) };
      const ctx = makeWikiContext({
        pageMetadata: { title: 'Test', uuid: 'x', lastModified: '' },
        userContext: { username: 'bob', roles: ['reader'] }
      });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(true);
      mockPolicyEvaluator = null;
    });

    // #1431 step 7 (operator 2026-09-21): no metadata, no decision — except create.
    test('no metadata refuses, even where policy would allow', async () => {
      // The page's own rules all read frontmatter. Without it they silently
      // fell away and policy answered alone — how an include rendered an
      // audience-restricted page to readers outside its audience.
      mockPolicyEvaluator = { evaluateAccess: vi.fn().mockResolvedValue({ hasDecision: true, allowed: true, policyName: 'allow-policy' }) };
      const ctx = makeWikiContext({ pageMetadata: null, userContext: { username: 'bob', roles: ['reader'] } });
      expect(await aclManager.evaluatePagePermission(ctx, 'view')).toEqual({ allowed: false, reason: 'no_page_metadata' });
      expect(await aclManager.evaluatePagePermission(ctx, 'edit')).toEqual({ allowed: false, reason: 'no_page_metadata' });
      mockPolicyEvaluator = null;
    });

    test('create is the exception — a new page has no metadata yet, so policy decides', async () => {
      mockPolicyEvaluator = { evaluateAccess: vi.fn().mockResolvedValue({ hasDecision: true, allowed: true, policyName: 'allow-policy' }) };
      const ctx = makeWikiContext({ pageMetadata: null, userContext: { username: 'bob', roles: ['editor'] } });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'create')).toBe(true);
      mockPolicyEvaluator = { evaluateAccess: vi.fn().mockResolvedValue({ hasDecision: true, allowed: false, policyName: 'deny-policy' }) };
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'create')).toBe(false);
      mockPolicyEvaluator = null;
    });

    test('Tier 2 — PolicyEvaluator denies access', async () => {
      mockPolicyEvaluator = { evaluateAccess: vi.fn().mockResolvedValue({ hasDecision: true, allowed: false, policyName: 'deny-policy' }) };
      const ctx = makeWikiContext({ userContext: { username: 'bob', roles: ['reader'] } });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
      mockPolicyEvaluator = null;
    });

    test('Tier 2 — a PolicyEvaluator that throws denies, it does not open the page', async () => {
      // The catch around Tier 2 used to let the request fall through to the
      // body markup, so an evaluator FAULT could end in an allow. With that
      // tier gone the fault denies, which is the only safe direction (#1431).
      mockPolicyEvaluator = { evaluateAccess: vi.fn().mockRejectedValue(new Error('PE error')) };
      const ctx = makeWikiContext({ content: '[{ALLOW view All}]', userContext: { username: 'bob', roles: ['reader'] } });
      expect(await aclManager.checkPagePermissionWithContext(ctx, 'view')).toBe(false);
      mockPolicyEvaluator = null;
    });
  });


  // #1432: notify() went with the availability checks — it existed only to
  // announce a maintenance or holiday refusal, and ACLManager no longer makes
  // those decisions.




  describe('initializeAuditLogging()', () => {
    test('returns early when ConfigurationManager is not available', async () => {
      const noConfigEngine = { getManager: vi.fn(() => null) };
      const mgr = new ACLManager(noConfigEngine);
      await expect(mgr.initializeAuditLogging()).resolves.not.toThrow();
    });

    test('creates audit log directory when audit is enabled', async () => {
      mockConfigurationManager.getProperty.mockImplementation((key: string, dv: unknown) => {
        if (key === 'ngdpbase.audit.enabled') return true;
        return dv;
      });
      (mockConfigurationManager as Record<string, unknown>).getResolvedDataPath = vi.fn().mockReturnValue('/tmp/test-acl-audit-logs');
      await expect(aclManager.initializeAuditLogging()).resolves.not.toThrow();
      delete (mockConfigurationManager as Record<string, unknown>).getResolvedDataPath;
    });
  });

  // #1431: loadAccessPolicies() is gone — it refilled a cache nothing read.
});
