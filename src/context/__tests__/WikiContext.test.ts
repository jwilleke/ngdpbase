import WikiContext from '../WikiContext';
import type { WikiEngine } from '../../types/WikiEngine';

// Mock managers for testing
const mockParser = {
  parse: vi.fn((content) => `<p>Parsed: ${content}</p>`)
};

const mockRenderingManager = {
  getParser: vi.fn(() => mockParser)
};

const mockVariableManager = {
  expandVariables: vi.fn((content) => content.replace(/\[\{\$pagename\}\]/g, 'TestPage'))
};

const mockEngine = {
  getManager: vi.fn((managerName) => {
    switch (managerName) {
    case 'RenderingManager':
      return mockRenderingManager;
    case 'VariableManager':
      return mockVariableManager;
    case 'PageManager':
    case 'PluginManager':
    case 'ACLManager':
      return null;
    default:
      return null;
    }
  })
};

describe('WikiContext', () => {
  let context;

  beforeEach(() => {
    vi.clearAllMocks();

    context = new WikiContext(mockEngine, {
      context: WikiContext.CONTEXT.VIEW,
      pageName: 'TestPage',
      content: 'Test content with [{$pagename}]',
      userContext: { isAuthenticated: true, roles: ['user'] },
      request: {
        headers: {
          'user-agent': 'test-agent',
          'accept-language': 'en-US'
        },
        ip: '127.0.0.1',
        sessionID: 'test-session-id'
      }
    });
  });

  describe('Constructor', () => {
    test('should initialize with correct properties', () => {
      expect(context.engine).toBe(mockEngine);
      expect(context.context).toBe(WikiContext.CONTEXT.VIEW);
      expect(context.pageName).toBe('TestPage');
      expect(context.content).toBe('Test content with [{$pagename}]');
      expect(context.userContext.isAuthenticated).toBe(true);
      expect(context.renderingManager).toBe(mockRenderingManager);
      expect(context.variableManager).toBe(mockVariableManager);
    });

    test('should throw error if engine not provided', () => {
      expect(() => new WikiContext(null)).toThrow('WikiContext requires a valid WikiEngine instance');
    });

    test('should use defaults for optional properties', () => {
      const minimalContext = new WikiContext(mockEngine);
      expect(minimalContext.context).toBe(WikiContext.CONTEXT.NONE);
      expect(minimalContext.pageName).toBeNull();
      expect(minimalContext.content).toBeNull();
      expect(minimalContext.userContext).toBeNull();
    });
  });

  describe('getContext', () => {
    test('should return the context type', () => {
      expect(context.getContext()).toBe(WikiContext.CONTEXT.VIEW);
    });

    test('should return NONE for default context', () => {
      const defaultContext = new WikiContext(mockEngine);
      expect(defaultContext.getContext()).toBe(WikiContext.CONTEXT.NONE);
    });
  });

  describe('renderMarkdown', () => {
    test('should use MarkupParser when available', async () => {
      const content = '# Test Header';
      const result = await context.renderMarkdown(content);

      expect(mockRenderingManager.getParser).toHaveBeenCalled();
      expect(mockParser.parse).toHaveBeenCalledWith(content, expect.objectContaining({
        pageContext: expect.objectContaining({
          pageName: 'TestPage'
        }),
        engine: mockEngine
      }));
      expect(result).toBe('<p>Parsed: # Test Header</p>');
    });

    test('should use default content if none provided', async () => {
      await context.renderMarkdown();

      expect(mockParser.parse).toHaveBeenCalledWith(
        'Test content with [{$pagename}]',
        expect.any(Object)
      );
    });

    test('should fallback to Showdown when parser not available', async () => {
      mockRenderingManager.getParser.mockReturnValueOnce(null);

      const result = await context.renderMarkdown('# Fallback Test');

      // Should use fallback converter (Showdown)
      expect(result).toContain('Fallback Test');
      expect(mockParser.parse).not.toHaveBeenCalled();
    });

    test('should expand variables in fallback mode', async () => {
      mockRenderingManager.getParser.mockReturnValueOnce(null);

      const result = await context.renderMarkdown('[{$pagename}] test');

      expect(mockVariableManager.expandVariables).toHaveBeenCalled();
      expect(result).toContain('TestPage');
    });
  });

  describe('toParseOptions', () => {
    test('should create correct parse options object', () => {
      const options = context.toParseOptions();

      // #629: toParseOptions now also includes a wikiContext reference so
      // ParseContext getters can delegate to the live WikiContext. Use
      // expect.objectContaining to assert the shape we care about without
      // pinning the wikiContext identity in the snapshot.
      expect(options).toEqual(expect.objectContaining({
        pageContext: {
          pageName: 'TestPage',
          userContext: { isAuthenticated: true, roles: ['user'] },
          requestInfo: {
            acceptLanguage: 'en-US',
            userAgent: 'test-agent',
            clientIp: '127.0.0.1',
            referer: undefined,
            sessionId: 'test-session-id',
            query: undefined
          },
          themeContext: {
            activeTheme: 'default',
            // #625: themeInfo is now lazily resolved (was eagerly null when not passed);
            // resolves to DEFAULT_THEME_INFO when the themes dir / theme.json don't exist.
            themeInfo: expect.any(Object),
            displayTheme: 'system'
          },
          pageMetadata: null
        },
        engine: mockEngine,
        wikiContext: context // #629: live reference to the parent
      }));
    });

    test('should handle missing request object', () => {
      const contextWithoutRequest = new WikiContext(mockEngine, {
        pageName: 'Test'
      });

      const options = contextWithoutRequest.toParseOptions();

      expect(options.pageContext.requestInfo).toEqual({
        acceptLanguage: undefined,
        userAgent: undefined,
        clientIp: undefined,
        referer: undefined,
        sessionId: undefined
      });
    });
  });

  describe('Context constants', () => {
    test('should have all context type constants', () => {
      expect(WikiContext.CONTEXT.VIEW).toBe('view');
      expect(WikiContext.CONTEXT.EDIT).toBe('edit');
      expect(WikiContext.CONTEXT.PREVIEW).toBe('preview');
      expect(WikiContext.CONTEXT.DIFF).toBe('diff');
      expect(WikiContext.CONTEXT.INFO).toBe('info');
      expect(WikiContext.CONTEXT.NONE).toBe('none');
    });
  });

  describe('userHasRole (static)', () => {
    test('returns true when userContext has the role', () => {
      expect(WikiContext.userHasRole({ roles: ['admin'] }, 'admin')).toBe(true);
    });

    test('multi-arg form matches if user has any role', () => {
      expect(WikiContext.userHasRole({ roles: ['editor'] }, 'admin', 'editor')).toBe(true);
    });

    test('returns false when userContext is null/undefined', () => {
      expect(WikiContext.userHasRole(null, 'admin')).toBe(false);
      expect(WikiContext.userHasRole(undefined, 'admin')).toBe(false);
    });

    test('returns false when roles array is missing or empty', () => {
      expect(WikiContext.userHasRole({}, 'admin')).toBe(false);
      expect(WikiContext.userHasRole({ roles: [] }, 'admin')).toBe(false);
    });

    test('returns false when called with no role names', () => {
      expect(WikiContext.userHasRole({ roles: ['admin'] })).toBe(false);
    });

    test('instance hasRole delegates to static implementation', () => {
      const ctx = new WikiContext(mockEngine, {
        userContext: { roles: ['editor'] }
      });
      expect(ctx.hasRole('editor')).toBe(WikiContext.userHasRole(ctx.userContext, 'editor'));
    });
  });

  describe('hasRole', () => {
    test('returns true when user carries one of the given roles', () => {
      const ctx = new WikiContext(mockEngine, {
        userContext: { roles: ['editor', 'reader'] }
      });
      expect(ctx.hasRole('admin', 'editor')).toBe(true);
    });

    test('returns true for single-arg role match', () => {
      const ctx = new WikiContext(mockEngine, {
        userContext: { roles: ['admin'] }
      });
      expect(ctx.hasRole('admin')).toBe(true);
    });

    test('returns false when user has none of the given roles', () => {
      const ctx = new WikiContext(mockEngine, {
        userContext: { roles: ['reader'] }
      });
      expect(ctx.hasRole('admin', 'editor')).toBe(false);
    });

    test('returns false when userContext is null', () => {
      const ctx = new WikiContext(mockEngine);
      expect(ctx.hasRole('admin')).toBe(false);
    });

    test('returns false when roles is missing or empty', () => {
      const noRoles = new WikiContext(mockEngine, {
        userContext: { username: 'alice' }
      });
      const emptyRoles = new WikiContext(mockEngine, {
        userContext: { roles: [] }
      });
      expect(noRoles.hasRole('admin')).toBe(false);
      expect(emptyRoles.hasRole('admin')).toBe(false);
    });

    test('returns false when called with no role names', () => {
      const ctx = new WikiContext(mockEngine, {
        userContext: { roles: ['admin'] }
      });
      expect(ctx.hasRole()).toBe(false);
    });
  });

  describe('hasPermission', () => {
    test('delegates to UserManager.hasPermission passing the resolved userContext (#637 fast path)', async () => {
      const userManagerMock = {
        hasPermission: vi.fn().mockResolvedValue(true)
      };
      const engineWithUser = {
        getManager: vi.fn((name) => {
          if (name === 'UserManager') return userManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engineWithUser, {
        userContext: { username: 'alice', roles: ['editor'] }
      });

      const result = await ctx.hasPermission('admin-system');

      // #637: pass-through userContext lets UserManager skip provider.getUser
      // + resolveUserRoles for callers that already have a resolved context.
      expect(userManagerMock.hasPermission).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'alice', roles: ['editor'] }),
        'admin-system'
      );
      expect(result).toBe(true);
    });

    test('passes empty string username when userContext is null', async () => {
      const userManagerMock = {
        hasPermission: vi.fn().mockResolvedValue(false)
      };
      const engineWithUser = {
        getManager: vi.fn((name) => {
          if (name === 'UserManager') return userManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engineWithUser);

      const result = await ctx.hasPermission('admin-system');

      expect(userManagerMock.hasPermission).toHaveBeenCalledWith('', 'admin-system');
      expect(result).toBe(false);
    });

    test('returns false when UserManager is not available', async () => {
      const ctx = new WikiContext(mockEngine, {
        userContext: { username: 'alice', roles: ['admin'] }
      });
      // mockEngine returns null for UserManager
      const result = await ctx.hasPermission('admin-system');
      expect(result).toBe(false);
    });

    test('memoizes the result per action — repeat calls share one userManager invocation (#636)', async () => {
      const userManagerMock = { hasPermission: vi.fn().mockResolvedValue(true) };
      const engine = {
        getManager: vi.fn((name) => {
          if (name === 'UserManager') return userManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engine, {
        userContext: { username: 'alice', roles: ['editor'] }
      });

      const r1 = await ctx.hasPermission('admin-system');
      const r2 = await ctx.hasPermission('admin-system');
      const r3 = await ctx.hasPermission('admin-system');

      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(r3).toBe(true);
      // Three calls but only ONE userManager invocation thanks to memoization
      expect(userManagerMock.hasPermission).toHaveBeenCalledTimes(1);
    });

    test('different actions cache independently — distinct userManager calls per action (#636)', async () => {
      const userManagerMock = { hasPermission: vi.fn().mockResolvedValue(true) };
      const engine = {
        getManager: vi.fn((name) => {
          if (name === 'UserManager') return userManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engine, {
        userContext: { username: 'alice', roles: ['editor'] }
      });

      await ctx.hasPermission('admin-system');
      await ctx.hasPermission('user-edit');
      await ctx.hasPermission('admin-system'); // cached
      await ctx.hasPermission('user-edit');    // cached

      expect(userManagerMock.hasPermission).toHaveBeenCalledTimes(2);
    });

    test('concurrent calls share one in-flight Promise (#636 — Promise-level memoization)', async () => {
      let resolveFn: (v: boolean) => void = () => { /* set below */ };
      const userManagerMock = {
        hasPermission: vi.fn(() => new Promise<boolean>((resolve) => { resolveFn = resolve; }))
      };
      const engine = {
        getManager: vi.fn((name) => {
          if (name === 'UserManager') return userManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engine, {
        userContext: { username: 'alice', roles: ['editor'] }
      });

      const p1 = ctx.hasPermission('admin-system');
      const p2 = ctx.hasPermission('admin-system');
      // Both calls dispatched before the first promise resolves
      expect(userManagerMock.hasPermission).toHaveBeenCalledTimes(1);

      resolveFn(true);
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(userManagerMock.hasPermission).toHaveBeenCalledTimes(1);
    });
  });

  describe('canAccess', () => {
    test('delegates to ACLManager.checkPagePermissionWithContext', async () => {
      const aclManagerMock = {
        checkPagePermissionWithContext: vi.fn().mockResolvedValue(true)
      };
      const engineWithAcl = {
        getManager: vi.fn((name) => {
          if (name === 'ACLManager') return aclManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engineWithAcl, {
        pageName: 'Main',
        userContext: { username: 'alice', roles: ['editor'] }
      });

      const result = await ctx.canAccess('edit');

      expect(aclManagerMock.checkPagePermissionWithContext).toHaveBeenCalledWith(ctx, 'edit');
      expect(result).toBe(true);
    });

    test('returns false when pageName is null', async () => {
      const aclManagerMock = {
        checkPagePermissionWithContext: vi.fn().mockResolvedValue(true)
      };
      const engineWithAcl = {
        getManager: vi.fn((name) => {
          if (name === 'ACLManager') return aclManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engineWithAcl, {
        userContext: { username: 'alice', roles: ['admin'] }
      });

      const result = await ctx.canAccess('edit');

      expect(aclManagerMock.checkPagePermissionWithContext).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    test('returns false when ACLManager is not available', async () => {
      // mockEngine returns null for ACLManager
      const ctx = new WikiContext(mockEngine, {
        pageName: 'Main',
        userContext: { username: 'alice', roles: ['admin'] }
      });
      const result = await ctx.canAccess('edit');
      expect(result).toBe(false);
    });

    test('memoizes the result per action+pageName — repeat calls share one ACL evaluation (#636)', async () => {
      const aclManagerMock = {
        checkPagePermissionWithContext: vi.fn().mockResolvedValue(true)
      };
      const engine = {
        getManager: vi.fn((name) => {
          if (name === 'ACLManager') return aclManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engine, {
        pageName: 'Main',
        userContext: { username: 'alice', roles: ['editor'] }
      });

      await ctx.canAccess('edit');
      await ctx.canAccess('edit');
      await ctx.canAccess('view');
      await ctx.canAccess('edit');
      await ctx.canAccess('view');

      // 5 calls, 2 unique action+pageName combos → 2 ACL invocations
      expect(aclManagerMock.checkPagePermissionWithContext).toHaveBeenCalledTimes(2);
    });

    // ─────────────────────────────────────────────────────────────────────
    // #714 Slice B — pageNameOverride for cross-page checks
    // ─────────────────────────────────────────────────────────────────────

    test('Slice B — cross-page check routes through ACLManager.canUserAccessPage', async () => {
      const aclManagerMock = {
        checkPagePermissionWithContext: vi.fn().mockResolvedValue(true),
        canUserAccessPage: vi.fn().mockResolvedValue(true)
      };
      const engineWithAcl = {
        getManager: vi.fn((name) => {
          if (name === 'ACLManager') return aclManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engineWithAcl, {
        pageName: 'Main',
        userContext: { username: 'alice', roles: ['editor'] }
      });

      const result = await ctx.canAccess('view', 'OtherPage');

      // Cross-page check goes through canUserAccessPage, NOT
      // checkPagePermissionWithContext.
      expect(aclManagerMock.canUserAccessPage).toHaveBeenCalledWith(
        ctx.userContext,
        'OtherPage',
        'view'
      );
      expect(aclManagerMock.checkPagePermissionWithContext).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    test('Slice B — same-page override (override === this.pageName) uses fast path', async () => {
      const aclManagerMock = {
        checkPagePermissionWithContext: vi.fn().mockResolvedValue(true),
        canUserAccessPage: vi.fn().mockResolvedValue(true)
      };
      const engineWithAcl = {
        getManager: vi.fn((name) => {
          if (name === 'ACLManager') return aclManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engineWithAcl, {
        pageName: 'Main',
        userContext: { username: 'alice', roles: ['editor'] }
      });

      // Passing the SAME page as override → still hits the fast path
      // (avoids a metadata reload).
      await ctx.canAccess('view', 'Main');

      expect(aclManagerMock.checkPagePermissionWithContext).toHaveBeenCalled();
      expect(aclManagerMock.canUserAccessPage).not.toHaveBeenCalled();
    });

    test('Slice B — cache key incorporates the override (cross-page result is NOT memoized as same-page)', async () => {
      // The pre-#714 cache key was `${action}:${this.pageName}` — would
      // have returned the SAME-page memoized result for a different page.
      // Slice B fixes the key to use the resolved target.
      const aclManagerMock = {
        checkPagePermissionWithContext: vi.fn().mockResolvedValue(true),
        canUserAccessPage: vi.fn().mockResolvedValue(false)  // different result for other page!
      };
      const engineWithAcl = {
        getManager: vi.fn((name) => {
          if (name === 'ACLManager') return aclManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engineWithAcl, {
        pageName: 'Main',
        userContext: { username: 'alice', roles: ['editor'] }
      });

      // First call: same-page → ACL says allow → cached as 'view:Main'.
      const sameResult = await ctx.canAccess('view');
      expect(sameResult).toBe(true);

      // Second call: cross-page → cache key 'view:OtherPage' is distinct;
      // does NOT return the cached same-page result. ACL says deny.
      const crossResult = await ctx.canAccess('view', 'OtherPage');
      expect(crossResult).toBe(false);

      // Both paths fired exactly once each — proves the cache didn't
      // erroneously short-circuit the second call.
      expect(aclManagerMock.checkPagePermissionWithContext).toHaveBeenCalledTimes(1);
      expect(aclManagerMock.canUserAccessPage).toHaveBeenCalledTimes(1);
    });

    test('Slice B — cross-page memoization works (repeat cross-page calls share one evaluation)', async () => {
      const aclManagerMock = {
        checkPagePermissionWithContext: vi.fn().mockResolvedValue(true),
        canUserAccessPage: vi.fn().mockResolvedValue(true)
      };
      const engineWithAcl = {
        getManager: vi.fn((name) => {
          if (name === 'ACLManager') return aclManagerMock;
          return mockEngine.getManager(name);
        })
      };
      const ctx = new WikiContext(engineWithAcl, {
        pageName: 'Main',
        userContext: { username: 'alice', roles: ['editor'] }
      });

      await ctx.canAccess('view', 'OtherPage');
      await ctx.canAccess('view', 'OtherPage');
      await ctx.canAccess('view', 'OtherPage');

      expect(aclManagerMock.canUserAccessPage).toHaveBeenCalledTimes(1);
    });

    test('Slice B — override with pageName=null and no current page → still returns false', async () => {
      const aclManagerMock = {
        checkPagePermissionWithContext: vi.fn(),
        canUserAccessPage: vi.fn()
      };
      const engineWithAcl = {
        getManager: vi.fn((name) => {
          if (name === 'ACLManager') return aclManagerMock;
          return mockEngine.getManager(name);
        })
      };
      // No pageName on this context.
      const ctx = new WikiContext(engineWithAcl, {
        userContext: { username: 'alice', roles: ['admin'] }
      });

      // No this.pageName and no override → still false (no target page).
      expect(await ctx.canAccess('view')).toBe(false);
      expect(aclManagerMock.checkPagePermissionWithContext).not.toHaveBeenCalled();
      expect(aclManagerMock.canUserAccessPage).not.toHaveBeenCalled();
    });
  });

  describe('getPrincipals', () => {
    test('returns roles plus username for authenticated user', () => {
      const ctx = new WikiContext(mockEngine, {
        userContext: { username: 'alice', roles: ['editor', 'reader'] }
      });
      expect(ctx.getPrincipals()).toEqual(['editor', 'reader', 'alice']);
    });

    test('returns roles only when no username present', () => {
      const ctx = new WikiContext(mockEngine, {
        userContext: { roles: ['anonymous'] }
      });
      expect(ctx.getPrincipals()).toEqual(['anonymous']);
    });

    test('returns empty array when userContext is null', () => {
      const ctx = new WikiContext(mockEngine);
      expect(ctx.getPrincipals()).toEqual([]);
    });

    test('returns just username when roles is missing', () => {
      const ctx = new WikiContext(mockEngine, {
        userContext: { username: 'alice' }
      });
      expect(ctx.getPrincipals()).toEqual(['alice']);
    });

    test('returned array is a copy — does not alias userContext.roles', () => {
      const roles = ['editor'];
      const ctx = new WikiContext(mockEngine, {
        userContext: { username: 'alice', roles }
      });
      const principals = ctx.getPrincipals();
      principals.push('mutated');
      expect(roles).toEqual(['editor']);
    });
  });
});
