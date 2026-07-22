import MarkupParser from '../MarkupParser';
import ParseContext from '../context/ParseContext';
import BaseSyntaxHandlerModule from '../handlers/BaseSyntaxHandler';
const BaseSyntaxHandler = (BaseSyntaxHandlerModule as any).BaseSyntaxHandler ?? BaseSyntaxHandlerModule;

// Mock handler class that properly extends BaseSyntaxHandler for testing
class MockSyntaxHandler extends BaseSyntaxHandler {
  constructor(pattern = /mock/, priority = 100, options = {}) {
    super(pattern, priority, options);
    this.processImpl = options.processImpl || (async (content) => content);
  }

  async process(content, context) {
    return this.processImpl(content, context);
  }
}

// Mock WikiEngine for testing
class MockWikiEngine {
  constructor() {
    this.managers = new Map();
  }
  
  getManager(name) {
    return this.managers.get(name) || null;
  }
  
  registerManager(name, manager) {
    this.managers.set(name, manager);
  }
}

// Mock CacheManager
class MockCacheManager {
  constructor() {
    this.cache = new Map();
    this.initialized = true;
  }
  
  isInitialized() {
    return this.initialized;
  }
  
  region(regionName) {
    return {
      get: async (key) => this.cache.get(key),
      set: async (key, value, options) => {
        this.cache.set(key, value);
      }
    };
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

// Mock RenderingManager with Showdown converter
class MockRenderingManager {
  constructor() {
    // Mock Showdown converter
    this.converter = {
      makeHtml: (content) => {
        // Simple markdown conversion for testing
        return content
          .replace(/^# (.+)$/gm, '<h1>$1</h1>')
          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>');
      }
    };
  }
}

describe('MarkupParser', () => {
  let markupParser;
  let mockEngine;
  let mockCacheManager;
  let mockVariableManager;
  let mockRenderingManager;

  beforeEach(async () => {
    // Create mock engine and managers
    mockEngine = new MockWikiEngine();
    mockCacheManager = new MockCacheManager();
    mockVariableManager = new MockVariableManager();
    mockRenderingManager = new MockRenderingManager();
    
    // Register mock managers
    mockEngine.registerManager('CacheManager', mockCacheManager);
    mockEngine.registerManager('VariableManager', mockVariableManager);
    mockEngine.registerManager('RenderingManager', mockRenderingManager);
    
    // Create and initialize MarkupParser
    markupParser = new MarkupParser(mockEngine);
    await markupParser.initialize();
  });

  afterEach(async () => {
    await markupParser.shutdown();
  });

  describe('Initialization', () => {
    test('should initialize cache integration', () => {
      expect(markupParser.cache).toBeTruthy();
    });

    test('should initialize metrics collection', () => {
      expect(markupParser.metrics).toBeDefined();
      expect(markupParser.metrics.parseCount).toBe(0);
    });
  });

  describe('Basic Parsing', () => {
    test('should parse empty content', async () => {
      const result = await markupParser.parse('');
      expect(result).toBe('');
    });

    test('should parse simple text', async () => {
      const content = 'Hello World';
      const result = await markupParser.parse(content);
      expect(result).toBe('Hello World');
    });

    test('should parse markdown content', async () => {
      const content = '# Title\n\nThis is **bold** text.';
      const result = await markupParser.parse(content);
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<strong>bold</strong>');
    });

    test('should handle parse context', async () => {
      const content = 'Hello World';
      const context = {
        pageName: 'TestPage',
        userName: 'TestUser'
      };
      
      const result = await markupParser.parse(content, context);
      expect(result).toBe('Hello World');
    });
  });

  describe('Phase Processing', () => {
    test('should execute all phases in correct order', async () => {
      const content = '# Test\n\n```\ncode block\n```\n\nRegular text.';
      
      const result = await markupParser.parse(content);
      
      // Should contain processed markdown
      expect(result).toContain('<h1>Test</h1>');
      
      // Code blocks should be rendered as <pre><code>
      expect(result).toContain('<pre');
      expect(result).toContain('code block');
    });

    // Code block protection is now handled inside extractJSPWikiSyntax() using internal
    // __CODEBLOCK_N__ placeholders — not through phasePreprocessing/parseContext.protectedBlocks.
    // The observable contract: code block content is preserved and JSPWiki syntax inside
    // code blocks is NOT processed.
    test('should protect code blocks during preprocessing', async () => {
      const content = 'Text before\n\n```javascript\nconst x = 1;\n```\n\nText after';
      const result = await markupParser.parse(content);

      // Code block content must survive the pipeline unchanged
      expect(result).toContain('const x = 1;');
      // Surrounding text must also be present
      expect(result).toContain('Text before');
      expect(result).toContain('Text after');
    });

    test('should render code blocks as pre/code elements', async () => {
      const content = 'Text\n\n```\ncode\n```\n\nMore text';
      const result = await markupParser.parse(content);

      // Code block should be rendered as <pre><code>, not raw fenced syntax
      expect(result).toContain('<pre');
      expect(result).toContain('code');
      expect(result).not.toContain('```');
    });

    test('should expand variables during context resolution', async () => {
      const content = 'Page: ${pagename}, User: ${username}';
      const context = {
        pageName: 'MyPage',
        userName: 'MyUser'
      };

      const result = await markupParser.parse(content, context);

      expect(result).toContain('Page: MyPage');
      expect(result).toContain('User: MyUser');
    });

    test('${pageslug} expands to the page slug (keyword-form) — bridges name/slug gap', async () => {
      // Authoritative slug from PageManager metadata when available.
      mockEngine.registerManager('PageManager', {
        getPageMetadata: async () => ({ slug: '2026-trip-west' })
      });
      const result = await markupParser.parse("kw='${pageslug}'", { pageName: '2026 trip west' });
      expect(result).toContain("kw='2026-trip-west'");
    });

    test('${pageslug} falls back to a derived slug when metadata has none', async () => {
      mockEngine.registerManager('PageManager', { getPageMetadata: async () => ({}) });
      mockEngine.registerManager('ValidationManager', {
        generateSlug: (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      });
      const result = await markupParser.parse('[${pageslug}]', { pageName: '2026 trip west' });
      expect(result).toContain('2026-trip-west');
    });

    test('${pageslug} not looked up when the token is absent (no page lookup)', async () => {
      let called = false;
      mockEngine.registerManager('PageManager', {
        getPageMetadata: async () => { called = true; return { slug: 'x' }; }
      });
      await markupParser.parse('Page: ${pagename}', { pageName: 'Something' });
      expect(called).toBe(false);
    });
  });

  describe('Caching', () => {
    test('should cache parse results', async () => {
      const content = '# Cached Content';
      const context = { pageName: 'TestPage' };
      
      // First parse - should miss cache
      const result1 = await markupParser.parse(content, context);
      expect(markupParser.metrics.cacheMisses).toBe(1);
      expect(markupParser.metrics.cacheHits).toBe(0);
      
      // Second parse - should hit cache
      const result2 = await markupParser.parse(content, context);
      expect(markupParser.metrics.cacheHits).toBe(1);
      expect(result1).toBe(result2);
    });

    test('should generate consistent cache keys', () => {
      const content = 'test content';
      const context = { pageName: 'Test' };
      
      const key1 = markupParser.generateCacheKey(content, context);
      const key2 = markupParser.generateCacheKey(content, context);
      
      expect(key1).toBe(key2);
    });

    test('should generate different cache keys for different content', () => {
      const context = { pageName: 'Test' };

      const key1 = markupParser.generateCacheKey('content 1', context);
      const key2 = markupParser.generateCacheKey('content 2', context);

      expect(key1).not.toBe(key2);
    });

    // Regression test for #307: same content on different pages must produce different
    // cache keys, otherwise page A's cached HTML (with [{$pagename}] → 'PageA') would
    // be served for page B (showing wrong value 'PageA' instead of 'PageB').
    test('should generate different cache keys for different pageName (flat context) (#307)', () => {
      const content = 'Hello [{$pagename}]';
      const keyA = markupParser.generateCacheKey(content, { pageName: 'PageA' });
      const keyB = markupParser.generateCacheKey(content, { pageName: 'PageB' });
      expect(keyA).not.toBe(keyB);
    });

    test('should generate different cache keys for different pageName (nested pageContext) (#307)', () => {
      const content = 'Hello [{$pagename}]';
      const keyA = markupParser.generateCacheKey(content, { pageContext: { pageName: 'PageA' } });
      const keyB = markupParser.generateCacheKey(content, { pageContext: { pageName: 'PageB' } });
      expect(keyA).not.toBe(keyB);
    });

    test('flat and nested pageContext structures with same pageName produce the same cache key (#307)', () => {
      const content = 'Hello [{$pagename}]';
      const flatKey = markupParser.generateCacheKey(content, { pageName: 'Physics' });
      const nestedKey = markupParser.generateCacheKey(content, { pageContext: { pageName: 'Physics' } });
      expect(flatKey).toBe(nestedKey);
    });
  });

  describe('Handler Registration', () => {
    test('should register syntax handlers', async () => {
      const { default: BaseSyntaxHandler } = await import('../handlers/BaseSyntaxHandler');
      
      class MockHandler extends BaseSyntaxHandler {
        constructor() {
          super(/mock-test/g, 100);
          this.handlerId = 'MockHandler';
        }
        
        async process(content, context) {
          return content.replace(/mock-test/g, 'MOCK_PROCESSED');
        }
        
        async handle(match, context) {
          return 'MOCK_HANDLED';
        }
      }
      
      const mockHandler = new MockHandler();
      await markupParser.registerHandler(mockHandler);
      
      expect(markupParser.getHandler('MockHandler')).toBe(mockHandler);
    });

    test('should unregister syntax handlers', async () => {
      const { default: BaseSyntaxHandler } = await import('../handlers/BaseSyntaxHandler');
      
      class MockHandler extends BaseSyntaxHandler {
        constructor() {
          super(/mock-test2/g, 100);
          this.handlerId = 'MockHandler2';
        }
        
        async process(content, context) {
          return content;
        }
        
        async handle(match, context) {
          return '';
        }
      }
      
      const mockHandler = new MockHandler();
      await markupParser.registerHandler(mockHandler);
      expect(markupParser.getHandler('MockHandler2')).toBe(mockHandler);
      
      await markupParser.unregisterHandler('MockHandler2');
      expect(markupParser.getHandler('MockHandler2')).toBeNull();
    });

    test('should execute registered handlers during content transformation', async () => {
      const { default: BaseSyntaxHandler } = await import('../handlers/BaseSyntaxHandler');

      class MockHandler extends BaseSyntaxHandler {
        constructor() {
          super(/transform-test/g, 100);
          this.handlerId = 'TransformHandler';
        }

        async process(content, context) {
          return content.replace(/transform-test/g, 'TRANSFORMED');
        }

        async handle(match, context) {
          return 'HANDLED';
        }
      }

      const mockHandler = new MockHandler();
      await markupParser.registerHandler(mockHandler);

      const content = 'This is transform-test content';
      const result = await markupParser.parse(content);

      expect(result).toContain('TRANSFORMED');
    });
  });

  describe('Error Handling', () => {
    test('should handle handler errors gracefully', async () => {
      // Create a proper mock handler that extends BaseSyntaxHandler
      const errorHandler = new MockSyntaxHandler(/error/, 100, {
        processImpl: vi.fn().mockRejectedValue(new Error('Handler error'))
      });

      await markupParser.registerHandler(errorHandler);

      const content = 'test content';
      const result = await markupParser.parse(content);

      // Should continue processing despite handler error
      expect(result).toBeDefined();
    });
  });

  describe('Performance Metrics', () => {
    test('should track parse count and timing', async () => {
      const content = 'test content';

      await markupParser.parse(content);
      await markupParser.parse(content);

      const metrics = markupParser.getMetrics();

      expect(metrics.parseCount).toBe(2);
      // Timing may be 0 on fast systems, so use toBeGreaterThanOrEqual
      expect(metrics.averageParseTime).toBeGreaterThanOrEqual(0);
      expect(metrics.totalParseTime).toBeGreaterThanOrEqual(0);
    });

    test('should calculate cache hit ratio', async () => {
      const content = 'test content';

      // First parse (cache miss)
      await markupParser.parse(content);

      // Second parse (cache hit)
      await markupParser.parse(content);

      const metrics = markupParser.getMetrics();

      expect(metrics.cacheHitRatio).toBe(0.5); // 1 hit out of 2 total
    });

    test('should reset metrics', () => {
      // Generate some metrics
      markupParser.metrics.parseCount = 5;
      markupParser.metrics.totalParseTime = 100;

      markupParser.resetMetrics();

      expect(markupParser.metrics.parseCount).toBe(0);
      expect(markupParser.metrics.totalParseTime).toBe(0);
    });
  });

  describe('Integration', () => {
    test('should work without CacheManager', async () => {
      // Create parser without cache manager
      const engineWithoutCache = new MockWikiEngine();
      engineWithoutCache.registerManager('VariableManager', mockVariableManager);
      engineWithoutCache.registerManager('RenderingManager', mockRenderingManager);
      
      const parserWithoutCache = new MarkupParser(engineWithoutCache);
      await parserWithoutCache.initialize();
      
      const result = await parserWithoutCache.parse('# Test');
      
      expect(result).toContain('<h1>Test</h1>');
      expect(parserWithoutCache.cache).toBeNull();
      
      await parserWithoutCache.shutdown();
    });

    test('should work without VariableManager', async () => {
      const engineWithoutVars = new MockWikiEngine();
      engineWithoutVars.registerManager('CacheManager', mockCacheManager);
      engineWithoutVars.registerManager('RenderingManager', mockRenderingManager);
      
      const parserWithoutVars = new MarkupParser(engineWithoutVars);
      await parserWithoutVars.initialize();
      
      const content = 'Text with ${variable}';
      const result = await parserWithoutVars.parse(content);
      
      // Variable should remain unexpanded
      expect(result).toContain('${variable}');
      
      await parserWithoutVars.shutdown();
    });
  });
});
