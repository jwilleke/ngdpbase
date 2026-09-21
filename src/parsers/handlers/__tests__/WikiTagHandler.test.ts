import WikiTagHandler from '../WikiTagHandler';
import ParseContext from '../../context/ParseContext';

// Mock PageManager
class MockPageManager {
  pages: Map<string, { content: string }>;
  constructor() {
    this.pages = new Map([
      ['ExistingPage', { content: '# Existing Page\n\nThis page exists.' }],
      ['PageWithSection', { content: '# Page Title\n\n## Introduction\n\nIntro content.\n\n## Details\n\nDetail content.' }]
    ]);
  }
  
  async getPage(pageName) {
    return this.pages.get(pageName) || null;
  }
}

// Mock PolicyInformationPoint — #633 migrated from PolicyManager-direct to canonical
// PolicyInformationPoint.checkPagePermissionWithContext path. Mock returns the same
// allow/deny semantics that MockPolicyManager.checkPermission used to.
class MockPolicyInformationPoint {
  async checkPagePermissionWithContext(ctx, action) {
    const userContext = ctx?.userContext;
    if (action === 'read' || action === 'view') return true;
    if (action === 'write' || action === 'edit') return userContext?.roles?.includes('admin');
    return false;
  }
  // #1431 step 7: <wiki:Include> asks the cross-page door, which loads the
  // TARGET page's metadata and runs its own rules — audience included.
  async canUserAccessPage(_userContext, _pageName, action) {
    return action === 'read' || action === 'view';
  }
}

// Mock VariableManager
class MockVariableManager {
  expandVariables(content, context) {
    return content.replace(/\$\{(\w+)\}/g, (match, varName) => {
      if (varName === 'pagename') return context.pageName || 'TestPage';
      if (varName === 'username') return context.userName || 'TestUser';
      return match;
    });
  }
}

// Mock MarkupParser for recursive processing
class MockMarkupParser {
  async parse(content, context) {
    // Simple mock parsing - just return processed content
    return content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  
  getCachedHandlerResult() {
    return null; // No cached results for testing
  }
  
  cacheHandlerResult() {
    return Promise.resolve();
  }
  
  getHandlerConfig(type) {
    return { enabled: true, priority: 95 };
  }
}

// Mock UserManager — #633 ParseContext.hasPermission delegates here
class MockUserManager {
  constructor() {
    this.initialized = true;
  }
  async hasPermission(username, action) {
    // Same semantics MockPolicyManager used for permission tests
    if (action === 'read' || action === 'view') return true;
    if (action === 'write' || action === 'edit') return username === 'admin';
    return false;
  }
}

// Mock engine
const createMockEngine = (userContext = null) => ({
  getManager: vi.fn((name) => {
    switch (name) {
    case 'PageManager': return new MockPageManager();
    case 'PolicyInformationPoint': return new MockPolicyInformationPoint();
    case 'VariableManager': return new MockVariableManager();
    case 'MarkupParser': return new MockMarkupParser();
    case 'UserManager': return new MockUserManager();
    default: return null;
    }
  })
});

// Create mock context
const createMockContext = (overrides = {}) => {
  const mockEngine = createMockEngine();
  return new ParseContext('test content', {
    pageName: 'TestPage',
    userName: 'TestUser',
    userContext: {
      isAuthenticated: true,
      roles: ['user'],
      permissions: ['read']
    },
    ...overrides
  }, mockEngine);
};

describe('WikiTagHandler', () => {
  let handler;
  let context;

  beforeEach(async () => {
    const mockEngine = createMockEngine();
    handler = new WikiTagHandler(mockEngine);
    context = createMockContext();
    
    await handler.initialize({ engine: mockEngine });
  });

  afterEach(async () => {
    await handler.shutdown();
  });

  describe('Initialization', () => {
    test('should initialize with correct properties', () => {
      expect(handler.handlerId).toBe('WikiTagHandler');
      expect(handler.priority).toBe(95);
      expect(handler.supportedTags.has('If')).toBe(true);
      expect(handler.supportedTags.has('Include')).toBe(true);
      expect(handler.supportedTags.has('UserCheck')).toBe(true);
    });

    test('should load configuration on initialization', async () => {
      expect(handler.config).toBeTruthy();
      expect(handler.config.enabled).toBe(true);
    });

    test('should get handler info with supported patterns', () => {
      const info = handler.getInfo();
      
      expect(info).toHaveProperty('supportedTags');
      expect(info).toHaveProperty('supportedPatterns');
      expect(info).toHaveProperty('supportedConditions');
      expect(info.features).toContain('Conditional content display');
    });
  });

  describe('Attribute Parsing', () => {
    test('should parse simple attributes', () => {
      const attrs = handler.parseTagAttributes('test="value" page="PageName"');
      
      expect(attrs).toEqual({
        test: 'value',
        page: 'PageName'
      });
    });

    test('should parse quoted attributes with spaces', () => {
      const attrs = handler.parseTagAttributes('test="value with spaces" title=\'Another value\'');
      
      expect(attrs).toEqual({
        test: 'value with spaces',
        title: 'Another value'
      });
    });

    test('should handle unquoted attributes', () => {
      const attrs = handler.parseTagAttributes('status=authenticated role=admin');
      
      expect(attrs).toEqual({
        status: 'authenticated',
        role: 'admin'
      });
    });

    test('should handle empty attribute string', () => {
      const attrs = handler.parseTagAttributes('');
      expect(attrs).toEqual({});
    });
  });

  describe('wiki:If Tag Processing', () => {
    test('should handle authenticated condition', async () => {
      const content = '<wiki:If test="authenticated">You are logged in</wiki:If>';
      const result = await handler.process(content, context);
      
      expect(result).toContain('You are logged in');
    });

    test('should handle anonymous condition', async () => {
      const anonymousContext = createMockContext({
        userContext: { isAuthenticated: false }
      });
      
      const content = '<wiki:If test="anonymous">You are not logged in</wiki:If>';
      const result = await handler.process(content, anonymousContext);
      
      expect(result).toContain('You are not logged in');
    });

    test('should handle permission checks', async () => {
      const content = '<wiki:If test="hasPermission:read">You can read</wiki:If>';
      const result = await handler.process(content, context);
      
      expect(result).toContain('You can read');
    });

    test('should handle page existence checks', async () => {
      const content = '<wiki:If test="exists:ExistingPage">Page exists</wiki:If>';
      const result = await handler.process(content, context);
      
      expect(result).toContain('Page exists');
    });

    test('should handle variable comparisons', async () => {
      const content = '<wiki:If test="$user == \'TestUser\'">Welcome TestUser</wiki:If>';
      const result = await handler.process(content, context);
      
      expect(result).toContain('Welcome TestUser');
    });

    test('should handle complex boolean conditions', async () => {
      const content = '<wiki:If test="authenticated && hasPermission:read">You can read while authenticated</wiki:If>';
      const result = await handler.process(content, context);
      
      expect(result).toContain('You can read while authenticated');
    });

    test('should return empty for failed conditions', async () => {
      const content = '<wiki:If test="$user == \'WrongUser\'">This should not appear</wiki:If>';
      const result = await handler.process(content, context);
      
      expect(result).toBe('');
    });
  });

  describe('wiki:Include Tag Processing', () => {
    test('should include existing page', async () => {
      const content = '<wiki:Include page="ExistingPage" />';
      const result = await handler.process(content, context);
      
      expect(result).toContain('This page exists');
    });

    test('should handle non-existent page', async () => {
      const content = '<wiki:Include page="NonExistentPage" />';
      const result = await handler.process(content, context);
      
      expect(result).toContain('<!-- Page not found: NonExistentPage -->');
    });

    test('should include specific section', async () => {
      const content = '<wiki:Include page="PageWithSection" section="Introduction" />';
      const result = await handler.process(content, context);
      
      expect(result).toContain('Intro content');
      expect(result).not.toContain('Detail content');
    });

    test('should handle missing section', async () => {
      const content = '<wiki:Include page="PageWithSection" section="NonExistentSection" />';
      const result = await handler.process(content, context);
      
      expect(result).toContain('<!-- Section "NonExistentSection" not found -->');
    });

    test('should prevent recursive inclusion', async () => {
      const recursiveContext = createMockContext();
      recursiveContext.setMetadata('inclusionStack', ['TestPage']);
      
      const content = '<wiki:Include page="TestPage" />';
      
      await expect(handler.process(content, recursiveContext)).resolves.toContain('Recursive inclusion detected');
    });

    test('should check include permissions', async () => {
      // Test would require mocking PolicyManager to deny access
      const content = '<wiki:Include page="ExistingPage" />';
      const result = await handler.process(content, context);
      
      // Should succeed with our mock that allows read access
      expect(result).toContain('This page exists');
    });
  });

  describe('wiki:UserCheck Tag Processing', () => {
    test('should check authenticated status', async () => {
      const content = '<wiki:UserCheck status="authenticated">You are authenticated</wiki:UserCheck>';
      const result = await handler.process(content, context);
      
      expect(result).toContain('You are authenticated');
    });

    test('should check anonymous status', async () => {
      const anonymousContext = createMockContext({
        userContext: { isAuthenticated: false }
      });
      
      const content = '<wiki:UserCheck status="anonymous">You are anonymous</wiki:UserCheck>';
      const result = await handler.process(content, anonymousContext);
      
      expect(result).toContain('You are anonymous');
    });

    test('should check user role', async () => {
      const adminContext = createMockContext({
        userContext: {
          isAuthenticated: true,
          roles: ['admin'],
          permissions: ['read', 'write']
        }
      });
      
      const content = '<wiki:UserCheck role="admin">You are an admin</wiki:UserCheck>';
      const result = await handler.process(content, adminContext);
      
      expect(result).toContain('You are an admin');
    });

    test('should check specific user', async () => {
      const content = '<wiki:UserCheck user="TestUser">Welcome TestUser</wiki:UserCheck>';
      const result = await handler.process(content, context);
      
      expect(result).toContain('Welcome TestUser');
    });

    test('should return empty for failed user checks', async () => {
      const content = '<wiki:UserCheck role="admin">Admin only content</wiki:UserCheck>';
      const result = await handler.process(content, context); // User doesn't have admin role
      
      expect(result).toBe('');
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle nested tags (conditional includes)', async () => {
      // When MarkupParser is not available from engine, wiki:If returns raw inner content
      // since it can't recursively process nested wiki tags
      const content = '<wiki:If test="authenticated"><wiki:Include page="ExistingPage" /></wiki:If>';
      const result = await handler.process(content, context);

      // Without MarkupParser for recursive processing, returns the inner content as-is
      expect(result).toContain('wiki:Include');
    });

    test('should handle multiple tags in content', async () => {
      const content = `
        <wiki:If test="authenticated">Welcome!</wiki:If>
        <wiki:Include page="ExistingPage" />
        <wiki:UserCheck role="user">User content</wiki:UserCheck>
      `;
      
      const result = await handler.process(content, context);
      
      expect(result).toContain('Welcome!');
      expect(result).toContain('This page exists');
      expect(result).toContain('User content');
    });

    test('should handle self-closing tags', async () => {
      const content = '<wiki:Include page="ExistingPage" />';
      const result = await handler.process(content, context);
      
      expect(result).toContain('This page exists');
    });

    test('should handle tags with content', async () => {
      const content = '<wiki:If test="authenticated">You are <strong>logged in</strong></wiki:If>';
      const result = await handler.process(content, context);
      
      expect(result).toContain('<strong>logged in</strong>');
    });
  });

  describe('Error Handling', () => {
    test('should handle unsupported tags', async () => {
      const content = '<wiki:UnsupportedTag>content</wiki:UnsupportedTag>';
      const result = await handler.process(content, context);
      
      expect(result).toContain('<!-- WikiTag Error: UnsupportedTag');
      expect(result).toContain('Unsupported WikiTag');
    });

    test('should handle missing required attributes', async () => {
      const content = '<wiki:If>content without test attribute</wiki:If>';
      const result = await handler.process(content, context);
      
      expect(result).toContain('<!-- WikiTag Error: If');
      expect(result).toContain('requires "test" attribute');
    });

    test('should handle MarkupParser unavailable for recursive processing', async () => {
      const engineWithoutMarkup = {
        getManager: vi.fn((name) => {
          if (name === 'MarkupParser') return null;
          return createMockEngine().getManager(name);
        })
      };
      
      const contextWithoutMarkup = new ParseContext('test', {
        pageName: 'Test',
        userContext: { isAuthenticated: true }
      }, engineWithoutMarkup);
      
      const content = '<wiki:If test="authenticated">Raw content</wiki:If>';
      const result = await handler.process(content, contextWithoutMarkup);
      
      expect(result).toBe('Raw content'); // Should return raw content
    });
  });

  describe('Security and Permissions', () => {
    test('should respect page access permissions for includes', async () => {
      const content = '<wiki:Include page="ExistingPage" />';
      const result = await handler.process(content, context);
      
      // Should succeed as our mock allows read access
      expect(result).toContain('This page exists');
    });

    test('should prevent unauthorized includes', async () => {
      // #633: was MockPolicyManager — migrated to PolicyInformationPoint. Mock denies access.
      const restrictiveEngine = {
        getManager: vi.fn((name) => {
          if (name === 'PolicyInformationPoint') {
            return {
              checkPagePermissionWithContext: vi.fn().mockResolvedValue(false),
              canUserAccessPage: vi.fn().mockResolvedValue(false)
            };
          }
          return createMockEngine().getManager(name);
        })
      };
      
      const restrictiveContext = new ParseContext('test', {
        pageName: 'Test',
        userContext: { isAuthenticated: false }
      }, restrictiveEngine);
      
      const content = '<wiki:Include page="ExistingPage" />';
      const result = await handler.process(content, restrictiveContext);
      
      expect(result).toContain('<!-- WikiTag Error: Include');
      expect(result).toContain('Access denied');
    });
  });

  describe('Performance and Caching', () => {
    test('should generate consistent content and context hashes', () => {
      const content = '<wiki:If test="authenticated">content</wiki:If>';
      
      const hash1 = handler.generateContentHash(content);
      const hash2 = handler.generateContentHash(content);
      
      expect(hash1).toBe(hash2);
      
      const contextHash1 = handler.generateContextHash(context);
      const contextHash2 = handler.generateContextHash(context);
      
      expect(contextHash1).toBe(contextHash2);
    });

    test('should generate different hashes for different content', () => {
      const content1 = '<wiki:If test="authenticated">content1</wiki:If>';
      const content2 = '<wiki:If test="authenticated">content2</wiki:If>';
      
      const hash1 = handler.generateContentHash(content1);
      const hash2 = handler.generateContentHash(content2);
      
      expect(hash1).not.toBe(hash2);
    });

    test('should include inclusion stack in context hash', () => {
      const context1 = createMockContext();
      const context2 = createMockContext();
      context2.setMetadata('inclusionStack', ['ParentPage']);
      
      const hash1 = handler.generateContextHash(context1);
      const hash2 = handler.generateContextHash(context2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Section Extraction', () => {
    test('should extract section by name', () => {
      const content = '# Page Title\n\n## Introduction\n\nIntro content.\n\n## Details\n\nDetail content.';
      
      const section = handler.extractSection(content, 'Introduction');
      
      expect(section).toContain('## Introduction');
      expect(section).toContain('Intro content');
      expect(section).not.toContain('Detail content');
    });

    test('should handle missing section', () => {
      const content = '# Page Title\n\nPage content without sections.';
      
      const section = handler.extractSection(content, 'NonExistent');
      
      expect(section).toContain('<!-- Section "NonExistent" not found -->');
    });

    test('should handle case-insensitive section matching', () => {
      const content = '# Page Title\n\n## INTRODUCTION\n\nIntro content.';
      
      const section = handler.extractSection(content, 'introduction');
      
      expect(section).toContain('## INTRODUCTION');
      expect(section).toContain('Intro content');
    });
  });

  describe('Condition Evaluation', () => {
    test('should evaluate simple authentication conditions', async () => {
      expect(await handler.evaluateCondition('authenticated', context)).toBe(true);
      expect(await handler.evaluateCondition('anonymous', context)).toBe(false);
    });

    test('should evaluate permission conditions', async () => {
      expect(await handler.evaluateCondition('hasPermission:read', context)).toBe(true);
      expect(await handler.evaluateCondition('hasPermission:write', context)).toBe(false);
    });

    test('should evaluate page existence conditions', async () => {
      expect(await handler.evaluateCondition('exists:ExistingPage', context)).toBe(true);
      expect(await handler.evaluateCondition('exists:NonExistentPage', context)).toBe(false);
    });

    test('should evaluate variable comparisons', async () => {
      expect(await handler.evaluateCondition('$user == "TestUser"', context)).toBe(true);
      expect(await handler.evaluateCondition('$user != "OtherUser"', context)).toBe(true);
      expect(await handler.evaluateCondition('$user == "WrongUser"', context)).toBe(false);
    });

    test('should evaluate complex boolean conditions', async () => {
      expect(await handler.evaluateCondition('authenticated && hasPermission:read', context)).toBe(true);
      expect(await handler.evaluateCondition('authenticated && hasPermission:write', context)).toBe(false);
      expect(await handler.evaluateCondition('anonymous || hasPermission:read', context)).toBe(true);
    });

    test('should handle unknown conditions', async () => {
      const result = await handler.evaluateCondition('unknownCondition', context);
      expect(result).toBe(false);
    });
  });

  describe('Context Variable Resolution', () => {
    test('should resolve standard context variables', async () => {
      expect(await handler.resolveContextVariable('user', context)).toBe('TestUser');
      expect(await handler.resolveContextVariable('pagename', context)).toBe('TestPage');
      expect(await handler.resolveContextVariable('authenticated', context)).toBe('true');
    });

    test('should resolve variables through VariableManager', async () => {
      // Our mock VariableManager should handle this
      const result = await handler.resolveContextVariable('username', context);
      expect(result).toBe('TestUser');
    });

    test('should handle unknown variables', async () => {
      // Unknown variables are passed through VariableManager.expandVariables
      // which returns them unexpanded if not recognized
      const result = await handler.resolveContextVariable('unknownVar', context);
      expect(result).toBe('${unknownVar}');
    });
  });

  describe('Integration', () => {
    test('should integrate with MarkupParser', async () => {
      const MarkupParserMod = await import('../../MarkupParser');
      const MarkupParser = (MarkupParserMod).default ?? MarkupParserMod;
      const mockEngine = createMockEngine();
      const parser = new MarkupParser(mockEngine);
      
      await parser.initialize();
      
      const content = 'Text with <wiki:If test="authenticated">conditional content</wiki:If> embedded.';
      const result = await parser.parse(content, {
        pageName: 'TestPage',
        userName: 'TestUser',
        userContext: { isAuthenticated: true, roles: ['user'] }
      });
      
      expect(result).toContain('conditional content');
      
      await parser.shutdown();
    });
  });
});
