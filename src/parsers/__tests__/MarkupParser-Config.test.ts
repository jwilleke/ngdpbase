import MarkupParser from '../MarkupParser';
import PluginSyntaxHandler from '../handlers/PluginSyntaxHandler';

// Mock ConfigurationManager
class MockConfigurationManager {
  config: Record<string, unknown>;
  constructor(config: Record<string, unknown> = {}) {
    this.config = {
      'ngdpbase.markup.enabled': true,
      'ngdpbase.markup.caching': true,
      'ngdpbase.markup.cache-ttl': 300,
      'ngdpbase.markup.handler-registry.max-handlers': 100,
      'ngdpbase.markup.handler-registry.enable-conflict-detection': true,
      'ngdpbase.markup.handlers.plugin.enabled': true,
      'ngdpbase.markup.handlers.plugin.priority': 90,
      'ngdpbase.markup.handlers.wikitag.enabled': false,
      'ngdpbase.markup.filters.enabled': true,
      ...config
    };
  }
  
  getProperty(key, defaultValue) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }
}

// Mock CacheManager
class MockCacheManager {
  initialized: boolean;
  constructor() {
    this.initialized = true;
  }

  isInitialized() {
    return this.initialized;
  }
  
  region(regionName) {
    return {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(true)
    };
  }
}

// Mock Engine
class MockWikiEngine {
  managers: Map<string, unknown>;
  constructor(managers: { CacheManager?: MockCacheManager; ConfigurationManager?: MockConfigurationManager } = {}) {
    this.managers = new Map();

    // Add default managers
    this.managers.set('CacheManager', managers.CacheManager || new MockCacheManager());
    this.managers.set('ConfigurationManager', managers.ConfigurationManager || new MockConfigurationManager());
  }
  
  getManager(name) {
    return this.managers.get(name) || null;
  }
  
  registerManager(name, manager) {
    this.managers.set(name, manager);
  }
}

describe('MarkupParser Configuration Integration', () => {
  let markupParser;
  let mockEngine;
  let mockConfigManager;

  beforeEach(() => {
    mockConfigManager = new MockConfigurationManager();
    mockEngine = new MockWikiEngine({ ConfigurationManager: mockConfigManager });
    markupParser = new MarkupParser(mockEngine);
  });

  afterEach(async () => {
    await markupParser.shutdown();
  });

  describe('Configuration Loading', () => {
    test('should load default configuration', async () => {
      await markupParser.initialize();
      
      expect(markupParser.config).toBeDefined();
      expect(markupParser.config.enabled).toBe(true);
      expect(markupParser.config.caching).toBe(true);
      expect(markupParser.config.cacheTTL).toBe(300);
    });

    test('should load configuration from ConfigurationManager', async () => {
      // Configure custom values
      mockConfigManager.config['ngdpbase.markup.enabled'] = false;
      mockConfigManager.config['ngdpbase.markup.cache-ttl'] = 600;
      mockConfigManager.config['ngdpbase.markup.handlers.plugin.priority'] = 95;
      
      await markupParser.initialize();
      
      expect(markupParser.config.enabled).toBe(false);
      expect(markupParser.config.cacheTTL).toBe(600);
      expect(markupParser.config.handlers.plugin.priority).toBe(95);
    });

    test('should use defaults when ConfigurationManager unavailable', async () => {
      const engineWithoutConfig = new MockWikiEngine({ ConfigurationManager: null });
      const parser = new MarkupParser(engineWithoutConfig);
      
      await parser.initialize();
      
      expect(parser.config.enabled).toBe(true);
      expect(parser.config.cacheTTL).toBe(300);
      expect(parser.config.handlers.plugin.enabled).toBe(true);
      
      await parser.shutdown();
    });

    test('should handle configuration loading errors gracefully', async () => {
      const errorConfigManager = {
        getProperty: vi.fn().mockImplementation(() => {
          throw new Error('Config error');
        })
      };
      
      const engineWithErrorConfig = new MockWikiEngine({ ConfigurationManager: errorConfigManager });
      const parser = new MarkupParser(engineWithErrorConfig);
      
      // Should not throw
      await expect(parser.initialize()).resolves.toBeUndefined();
      
      // Should use defaults
      expect(parser.config.enabled).toBe(true);
      
      await parser.shutdown();
    });
  });

  describe('Handler Registry Configuration', () => {
    // NOTE: HandlerRegistry.config is private - cannot be configured from MarkupParser
    // HandlerRegistry uses sensible defaults: maxHandlers=100, enableConflictDetection=true
    test('should use HandlerRegistry default configuration', async () => {
      mockConfigManager.config['ngdpbase.markup.handler-registry.max-handlers'] = 50;
      mockConfigManager.config['ngdpbase.markup.handler-registry.enable-conflict-detection'] = false;

      await markupParser.initialize();

      // HandlerRegistry config is private, so it uses defaults
      expect(markupParser.handlerRegistry.config.maxHandlers).toBe(100); // default
      expect(markupParser.handlerRegistry.config.enableConflictDetection).toBe(true); // default
    });

    test('should respect handler enable/disable configuration', async () => {
      // Disable plugin handler in config
      mockConfigManager.config['ngdpbase.markup.handlers.plugin.enabled'] = false;
      
      await markupParser.initialize();
      
      const pluginHandler = new PluginSyntaxHandler();
      const result = await markupParser.registerHandler(pluginHandler);
      
      expect(result).toBe(false);
      expect(markupParser.getHandler('PluginSyntaxHandler')).toBeNull();
    });

    test('should use configured handler priorities', async () => {
      mockConfigManager.config['ngdpbase.markup.handlers.plugin.priority'] = 95;

      await markupParser.initialize();

      // PluginSyntaxHandler is registered by initialize() — verify the config priority (95)
      // overrides the handler's hardcoded default (90)
      const registeredHandler = markupParser.getHandler('PluginSyntaxHandler');
      expect(registeredHandler.priority).toBe(95); // Config value applied
    });
  });

  describe('Cache Configuration', () => {
    test('should respect cache configuration', async () => {
      mockConfigManager.config['ngdpbase.markup.caching'] = false;
      
      await markupParser.initialize();
      
      expect(markupParser.cache).toBeNull();
    });

    test('should use configured cache TTL', async () => {
      mockConfigManager.config['ngdpbase.markup.cache-ttl'] = 600;
      
      await markupParser.initialize();
      
      expect(markupParser.config.cacheTTL).toBe(600);
    });

    test('should use cache TTL in caching operations', async () => {
      mockConfigManager.config['ngdpbase.markup.cache-ttl'] = 900;

      await markupParser.initialize();

      const mockCache = markupParser.cache;
      if (mockCache) {
        const content = 'test content';
        await markupParser.parse(content);

        // Check that set was called with correct TTL
        expect(mockCache.set).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          { ttl: 900 }
        );
      }
    });
  });

  describe('Disabled MarkupParser Behavior', () => {
    test('should fall back to basic rendering when disabled', async () => {
      mockConfigManager.config['ngdpbase.markup.enabled'] = false;
      
      // Mock RenderingManager
      const mockRenderingManager = {
        converter: {
          makeHtml: vi.fn().mockReturnValue('<h1>Title</h1>')
        }
      };
      mockEngine.managers.set('RenderingManager', mockRenderingManager);
      
      await markupParser.initialize();
      
      const content = '# Title';
      const result = await markupParser.parse(content);
      
      expect(result).toBe('<h1>Title</h1>');
      expect(mockRenderingManager.converter.makeHtml).toHaveBeenCalledWith(content);
    });

    test('should return original content when disabled and no RenderingManager', async () => {
      mockConfigManager.config['ngdpbase.markup.enabled'] = false;
      
      const engineWithoutRendering = new MockWikiEngine({ 
        ConfigurationManager: mockConfigManager
      });
      const parser = new MarkupParser(engineWithoutRendering);
      
      await parser.initialize();
      
      const content = '# Title';
      const result = await parser.parse(content);
      
      expect(result).toBe(content);
      
      await parser.shutdown();
    });
  });

  describe('Filter Configuration (#1117: owned by FilterManager)', () => {
    test('parser consumes the FilterManager chain built from configuration', async () => {
      mockConfigManager.config['ngdpbase.markup.filters.enabled'] = true;
      mockConfigManager.config['ngdpbase.markup.filters.spam.enabled'] = false;
      mockConfigManager.config['ngdpbase.markup.filters.security.enabled'] = true;

      const { default: FilterManager } = await import('../../managers/FilterManager');
      const filterManager = new FilterManager(mockEngine);
      await filterManager.initialize();
      mockEngine.registerManager('FilterManager', filterManager);

      await markupParser.initialize();

      // The parser holds the manager's chain — same instance, one owner.
      expect(markupParser.getFilterChain()).toBe(filterManager.getFilterChain());
      const names = markupParser.getFilterChain().getFilters(false).map((f) => f.constructor.name);
      expect(names).toContain('SecurityFilter');
      expect(names).not.toContain('SpamFilter');
      await filterManager.shutdown();
    });

    test('without a FilterManager the parser has no chain and still parses', async () => {
      await markupParser.initialize();
      expect(markupParser.getFilterChain()).toBeNull();
      const html = await markupParser.parse('plain text');
      expect(html).toContain('plain text');
    });
  });

  describe('Configuration API', () => {
    test('should get handler configuration by type', async () => {
      mockConfigManager.config['ngdpbase.markup.handlers.plugin.enabled'] = true;
      mockConfigManager.config['ngdpbase.markup.handlers.plugin.priority'] = 95;
      
      await markupParser.initialize();
      
      const pluginConfig = markupParser.getHandlerConfig('plugin');
      expect(pluginConfig.enabled).toBe(true);
      expect(pluginConfig.priority).toBe(95);
    });

    test('should return default config for unknown handler type', async () => {
      await markupParser.initialize();
      
      const unknownConfig = markupParser.getHandlerConfig('unknown');
      expect(unknownConfig.enabled).toBe(true);
      expect(unknownConfig.priority).toBe(100);
    });

    test('should map handler IDs to types correctly', async () => {
      await markupParser.initialize();

      expect(markupParser.getHandlerTypeFromId('PluginSyntaxHandler')).toBe('plugin');
      expect(markupParser.getHandlerTypeFromId('WikiTagHandler')).toBe('wikitag');
      expect(markupParser.getHandlerTypeFromId('WikiFormHandler')).toBe('form');
      // InterWikiLinkHandler was replaced by LinkParserHandler
      expect(markupParser.getHandlerTypeFromId('InterWikiLinkHandler')).toBeNull();
      expect(markupParser.getHandlerTypeFromId('LinkParserHandler')).toBe('linkparser');
      expect(markupParser.getHandlerTypeFromId('AttachmentHandler')).toBe('attachment');
      expect(markupParser.getHandlerTypeFromId('WikiStyleHandler')).toBe('style');
      expect(markupParser.getHandlerTypeFromId('UnknownHandler')).toBeNull();
    });
  });
});
