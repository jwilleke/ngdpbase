import MarkupParser from '../MarkupParser';

/**
 * Test suite demonstrating complete modular configuration architecture
 * Tests app-default-config.json base values and app-custom-config.json overrides
 */

// Mock ConfigurationManager that simulates app-default-config.json and app-custom-config.json
class ModularConfigurationManager {
  defaultConfig: Record<string, unknown>;
  customConfig: Record<string, unknown>;
  constructor(customOverrides: Record<string, unknown> = {}) {
    // Simulate app-default-config.json values
    this.defaultConfig = {
      'ngdpbase.markup.enabled': true,
      'ngdpbase.markup.caching': true,
      'ngdpbase.markup.cache-ttl': 300,
      
      // Handler enable/disable (modular)
      'ngdpbase.markup.handlers.plugin.enabled': true,
      'ngdpbase.markup.handlers.plugin.priority': 90,
      'ngdpbase.markup.handlers.wikitag.enabled': true,
      'ngdpbase.markup.handlers.wikitag.priority': 95,
      'ngdpbase.markup.handlers.form.enabled': true,
      'ngdpbase.markup.handlers.form.priority': 85,
      'ngdpbase.markup.handlers.interwiki.enabled': true,
      'ngdpbase.markup.handlers.interwiki.priority': 80,
      'ngdpbase.markup.handlers.style.enabled': true,
      'ngdpbase.markup.handlers.style.priority': 70,
      
      // Style configuration (modular)
      'ngdpbase.style.custom-classes.enabled': true,
      'ngdpbase.style.bootstrap.integration': true,
      'ngdpbase.style.security.allow-inline-css': false,
      'ngdpbase.style.security.allowed-properties': 'color,background-color,font-weight',
      'ngdpbase.style.predefined.text': 'text-primary,text-success,text-danger',
      'ngdpbase.style.predefined.background': 'bg-primary,bg-light,bg-dark',
      
      // Cache configuration (modular)
      'ngdpbase.markup.cache.parse-results.enabled': true,
      'ngdpbase.markup.cache.parse-results.ttl': 300,
      'ngdpbase.markup.cache.handler-results.enabled': true,
      'ngdpbase.markup.cache.handler-results.ttl': 600,
      
      // Performance configuration (modular)
      'ngdpbase.markup.performance.monitoring': true,
      'ngdpbase.markup.performance.alert-thresholds.parse-time': 100
    };
    
    // Simulate app-custom-config.json overrides
    this.customConfig = customOverrides;
  }
  
  getProperty(key, defaultValue) {
    // First check custom config (app-custom-config.json simulation)
    if (this.customConfig[key] !== undefined) {
      return this.customConfig[key];
    }
    
    // Then check default config (app-default-config.json simulation)
    if (this.defaultConfig[key] !== undefined) {
      return this.defaultConfig[key];
    }
    
    // Finally return provided default
    return defaultValue;
  }
}

// Mock engine with all required managers
class ModularMockEngine {
  constructor(customConfig = {}) {
    this.managers = new Map([
      ['ConfigurationManager', new ModularConfigurationManager(customConfig)],
      ['CacheManager', this.createMockCacheManager()],
      ['AttachmentManager', this.createMockAttachmentManager()],
      ['PluginManager', this.createMockPluginManager()],
      ['PageManager', this.createMockPageManager()],
      ['UserManager', this.createMockUserManager()],
      ['PolicyManager', this.createMockPolicyManager()],
      ['VariableManager', this.createMockVariableManager()],
      ['RenderingManager', this.createMockRenderingManager()]
    ]);
  }
  
  getManager(name) {
    return this.managers.get(name) || null;
  }
  
  createMockCacheManager() {
    return {
      isInitialized: () => true,
      region: (name) => ({
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(true)
      })
    };
  }
  
  createMockAttachmentManager() {
    return {
      getAttachmentPath: vi.fn().mockResolvedValue('/attachments/test.pdf'),
      attachmentExists: vi.fn().mockResolvedValue(false)
    };
  }
  
  createMockPluginManager() {
    return {
      executePlugin: vi.fn().mockResolvedValue('<div>Plugin Result</div>')
    };
  }
  
  createMockPageManager() {
    return {
      getPage: vi.fn().mockResolvedValue({ content: 'Page content' })
    };
  }
  
  createMockUserManager() {
    return { initialized: true };
  }
  
  createMockPolicyManager() {
    return {
      checkPermission: vi.fn().mockResolvedValue(true)
    };
  }
  
  createMockVariableManager() {
    return {
      expandVariables: vi.fn().mockReturnValue('expanded content')
    };
  }
  
  createMockRenderingManager() {
    return {
      converter: {
        makeHtml: vi.fn().mockReturnValue('<p>HTML content</p>')
      }
    };
  }
}

// Skipped: Output format expectations don't match current implementation
describe('MarkupParser Modular Configuration System', () => {
  describe('Configuration Hierarchy (app-default → app-custom)', () => {
    test('should use app-default-config.json values as base', async () => {
      const engine = new ModularMockEngine();
      const parser = new MarkupParser(engine);
      await parser.initialize();
      
      // Should use default values from app-default-config.json simulation
      expect(parser.config.enabled).toBe(true);
      expect(parser.config.cacheTTL).toBe(300);
      expect(parser.config.handlers.plugin.enabled).toBe(true);
      expect(parser.config.handlers.plugin.priority).toBe(90);
      expect(parser.config.handlers.wikitag.enabled).toBe(true);
      
      await parser.shutdown();
    });

    test('should override with app-custom-config.json values', async () => {
      // Simulate app-custom-config.json overrides
      const customOverrides = {
        'ngdpbase.markup.cache-ttl': 600,                    // Override default 300
        'ngdpbase.markup.handlers.plugin.priority': 95,     // Override default 90
        'ngdpbase.markup.handlers.form.enabled': false,           // Override default true
        'ngdpbase.style.security.allow-inline-css': true      // Override default false
      };
      
      const engine = new ModularMockEngine(customOverrides);
      const parser = new MarkupParser(engine);
      await parser.initialize();
      
      // Should use custom overrides
      expect(parser.config.cacheTTL).toBe(600);           // Custom value
      expect(parser.config.handlers.plugin.priority).toBe(95);  // Custom value
      expect(parser.config.handlers.form.enabled).toBe(false);  // Custom value
      
      // Non-overridden values should use defaults
      expect(parser.config.enabled).toBe(true);           // Default value
      expect(parser.config.handlers.wikitag.priority).toBe(95);  // Default value
      
      await parser.shutdown();
    });

  });

  describe('Handler-Specific Modular Configuration', () => {
    test('should allow complete handler disable via configuration', async () => {
      const disabledConfig = {
        'ngdpbase.markup.handlers.style.enabled': false,
        'ngdpbase.markup.handlers.form.enabled': false
      };
      
      const engine = new ModularMockEngine(disabledConfig);
      const parser = new MarkupParser(engine);
      await parser.initialize();
      
      const handlers = parser.getHandlers();
      const handlerIds = handlers.map(h => h.handlerId);
      
      // Should only have enabled handlers
      expect(handlerIds).toContain('PluginSyntaxHandler');    // Enabled (default)
      expect(handlerIds).toContain('WikiTagHandler');         // Enabled (default)
      // InterWikiLinkHandler was replaced by LinkParserHandler
      expect(handlerIds).toContain('LinkParserHandler');      // Enabled (default)

      // Should not have disabled handlers
      expect(handlerIds).not.toContain('AttachmentHandler');  // Disabled
      // WikiStyleHandler is deprecated and not registered
      expect(handlerIds).not.toContain('WikiFormHandler');    // Disabled
      
      await parser.shutdown();
    });
  });

  describe('Priority Configuration Modularity', () => {
    test('should respect custom handler priorities', async () => {
      const priorityConfig = {
        'ngdpbase.markup.handlers.plugin.priority': 100,      // Increase from default 90
        'ngdpbase.markup.handlers.wikitag.priority': 85,      // Decrease from default 95
        'ngdpbase.markup.handlers.form.priority': 95          // Increase from default 85
        // WikiStyleHandler is deprecated and not registered; AttachmentHandler retired (#1231)
      };

      const engine = new ModularMockEngine(priorityConfig);
      const parser = new MarkupParser(engine);
      await parser.initialize();

      const handlers = parser.getHandlers();

      // Find specific handlers and check their priorities
      const pluginHandler = handlers.find(h => h.handlerId === 'PluginSyntaxHandler');
      const wikiTagHandler = handlers.find(h => h.handlerId === 'WikiTagHandler');
      const formHandler = handlers.find(h => h.handlerId === 'WikiFormHandler');

      expect(pluginHandler.priority).toBe(100);   // Custom value applied
      expect(wikiTagHandler.priority).toBe(85);   // Custom value applied
      expect(formHandler.priority).toBe(95);      // Custom value applied

      // Verify execution order (higher priority first)
      const priorities = handlers.map(h => h.priority);
      expect(priorities[0]).toBe(100); // PluginSyntaxHandler first
      expect(priorities[1]).toBe(95);  // JSPWikiPreprocessor / WikiFormHandler next

      await parser.shutdown();
    });

    test('should handle priority conflicts gracefully', async () => {
      const conflictConfig = {
        'ngdpbase.markup.handlers.plugin.priority': 90,
        'ngdpbase.markup.handlers.wikitag.priority': 90,  // Same priority
        'ngdpbase.markup.handlers.form.priority': 90      // Same priority
      };
      
      const engine = new ModularMockEngine(conflictConfig);
      const parser = new MarkupParser(engine);
      
      // Should initialize without errors
      await expect(parser.initialize()).resolves.toBeUndefined();
      
      // Should have handlers registered despite priority conflicts
      const handlers = parser.getHandlers();
      expect(handlers.length).toBeGreaterThan(0);
      
      await parser.shutdown();
    });
  });

  describe('Feature Flag Configuration Modularity', () => {
    test('#1231 the retired AttachmentHandler cannot be configured back in', async () => {
      // The handler was removed because JSPWikiPreprocessor extracts every
      // [{ATTACH …}] before it could run and AttachPlugin renders them all. A
      // leftover key in an instance's custom config must not resurrect it.
      const engine = new ModularMockEngine({ 'ngdpbase.markup.handlers.attachment.enabled': true });
      const parser = new MarkupParser(engine);
      await parser.initialize();

      expect(parser.config.handlers.attachment).toBeUndefined();
      expect(parser.getHandler('AttachmentHandler')).toBeNull();
      expect(parser.getHandlers().map(h => h.handlerId)).not.toContain('AttachmentHandler');

      await parser.shutdown();
    });

  });

  describe('Cache Configuration Modularity', () => {
    test('should configure cache strategies individually', async () => {
      const cacheConfig = {
        'ngdpbase.markup.cache.parse-results.enabled': true,
        'ngdpbase.markup.cache.parse-results.ttl': 900,           // Custom TTL
        'ngdpbase.markup.cache.handler-results.enabled': false,   // Disable handler cache
        'ngdpbase.markup.cache.patterns.enabled': true,
        'ngdpbase.markup.cache.variables.enabled': false,       // Disable variable cache
        'ngdpbase.markup.cache.enable-warmup': false              // Disable warmup
      };
      
      const engine = new ModularMockEngine(cacheConfig);
      const parser = new MarkupParser(engine);
      await parser.initialize();
      
      // Should have selective cache strategies
      expect(parser.cacheStrategies).toHaveProperty('parseResults');
      expect(parser.cacheStrategies).toHaveProperty('patterns');
      expect(parser.cacheStrategies).not.toHaveProperty('handlerResults'); // Disabled
      expect(parser.cacheStrategies).not.toHaveProperty('variables');      // Disabled
      
      // Should use custom TTL
      expect(parser.config.cache.parseResults.ttl).toBe(900);
      
      await parser.shutdown();
    });

    test('should support complete cache disable', async () => {
      const noCacheConfig = {
        'ngdpbase.markup.caching': false  // Master cache disable
      };
      
      const engine = new ModularMockEngine(noCacheConfig);
      const parser = new MarkupParser(engine);
      await parser.initialize();
      
      // Should have no cache strategies
      expect(Object.keys(parser.cacheStrategies)).toHaveLength(0);
      expect(parser.cache).toBeNull();
      
      await parser.shutdown();
    });
  });

  describe('Performance Configuration Modularity', () => {
    test('should configure performance thresholds individually', async () => {
      const perfConfig = {
        'ngdpbase.markup.performance.monitoring': true,
        'ngdpbase.markup.performance.alert-thresholds.parse-time': 50,    // Custom threshold
        'ngdpbase.markup.performance.alert-thresholds.cache-hit-ratio': 0.8, // Custom threshold
        'ngdpbase.markup.performance.alert-thresholds.error-rate': 0.02    // Custom threshold
      };
      
      const engine = new ModularMockEngine(perfConfig);
      const parser = new MarkupParser(engine);
      await parser.initialize();
      
      expect(parser.performanceMonitor).toBeTruthy();
      expect(parser.config.performance.alertThresholds.parseTime).toBe(50);
      expect(parser.config.performance.alertThresholds.cacheHitRatio).toBe(0.8);
      expect(parser.config.performance.alertThresholds.errorRate).toBe(0.02);
      
      await parser.shutdown();
    });

    test('should disable performance monitoring when configured', async () => {
      const noPerfConfig = {
        'ngdpbase.markup.performance.monitoring': false
      };
      
      const engine = new ModularMockEngine(noPerfConfig);
      const parser = new MarkupParser(engine);
      await parser.initialize();
      
      expect(parser.performanceMonitor).toBeNull();
      
      await parser.shutdown();
    });
  });

  describe('Deployment Scenario Configurations', () => {
    test('should support development environment configuration', async () => {
      const devConfig = {
        'ngdpbase.markup.cache.parse-results.ttl': 60,        // Short cache for development
        'ngdpbase.markup.performance.monitoring': true,      // Enable monitoring
        'ngdpbase.style.security.allow-inline-css': true       // Allow for testing
      };

      const engine = new ModularMockEngine(devConfig);
      const parser = new MarkupParser(engine);
      await parser.initialize();

      expect(parser.config.cache.parseResults.ttl).toBe(60);  // Dev setting
      expect(parser.performanceMonitor).toBeTruthy();          // Dev monitoring

      // WikiStyleHandler is deprecated and AttachmentHandler retired; verify the plugin handler
      expect(parser.getHandler('PluginSyntaxHandler')).toBeTruthy();

      await parser.shutdown();
    });

    test('should support production environment configuration', async () => {
      const prodConfig = {
        'ngdpbase.markup.cache.parse-results.ttl': 1800,      // Long cache for production
        'ngdpbase.markup.performance.monitoring': true,      // Enable monitoring
        'ngdpbase.style.security.allow-inline-css': false,     // Security lockdown
        'ngdpbase.markup.handlers.form.enabled': true,       // Enable forms
        'ngdpbase.style.custom-classes.enabled': false        // Only predefined classes
      };

      const engine = new ModularMockEngine(prodConfig);
      const parser = new MarkupParser(engine);
      await parser.initialize();

      expect(parser.config.cache.parseResults.ttl).toBe(1800); // Prod caching
      expect(parser.performanceMonitor).toBeTruthy();           // Prod monitoring

      // WikiStyleHandler is deprecated and AttachmentHandler retired; verify the form handler
      const formHandler = parser.getHandler('WikiFormHandler');
      expect(formHandler).toBeTruthy(); // Enabled in prod config

      await parser.shutdown();
    });

    test('should support high-security environment configuration', async () => {
      const securityConfig = {
        'ngdpbase.markup.handlers.form.enabled': false,      // Disable forms
        'ngdpbase.style.security.allow-inline-css': false,     // No inline CSS
        'ngdpbase.style.custom-classes.enabled': false,       // No custom classes
        'ngdpbase.style.predefined.text': 'text-muted',      // Minimal styling
        'ngdpbase.markup.cache.handler-results.enabled': false // No handler caching
      };
      
      const engine = new ModularMockEngine(securityConfig);
      const parser = new MarkupParser(engine);
      await parser.initialize();
      
      const handlers = parser.getHandlers();
      const handlerIds = handlers.map(h => h.handlerId);
      
      // Should only have safe handlers
      expect(handlerIds).toContain('PluginSyntaxHandler');
      expect(handlerIds).toContain('WikiTagHandler');
      // InterWikiLinkHandler was renamed to LinkParserHandler
      expect(handlerIds).toContain('LinkParserHandler');
      
      // Should not have potentially risky handlers
      expect(handlerIds).not.toContain('WikiFormHandler');    // Disabled
      
      // Style handler should be present but locked down
      const styleHandler = parser.getHandler('WikiStyleHandler');
      if (styleHandler) {
        expect(styleHandler.styleConfig.allowInlineCSS).toBe(false);
        expect(styleHandler.styleConfig.customClasses).toBe(false);
      }
      
      await parser.shutdown();
    });
  });

  describe('Configuration Error Handling', () => {
    test('should use defaults when configuration loading fails', async () => {
      // Mock configuration manager that throws errors
      const errorEngine = new ModularMockEngine();
      errorEngine.managers.set('ConfigurationManager', {
        getProperty: vi.fn().mockImplementation(() => {
          throw new Error('Configuration error');
        })
      });
      
      const parser = new MarkupParser(errorEngine);
      
      // Should initialize successfully with defaults
      await expect(parser.initialize()).resolves.toBeUndefined();
      
      // Should use default values
      expect(parser.config.enabled).toBe(true);
      expect(parser.config.cacheTTL).toBe(300);
      
      await parser.shutdown();
    });

    test('should handle missing ConfigurationManager gracefully', async () => {
      const engineWithoutConfig = new ModularMockEngine();
      engineWithoutConfig.managers.delete('ConfigurationManager');
      
      const parser = new MarkupParser(engineWithoutConfig);
      
      // Should initialize with built-in defaults
      await expect(parser.initialize()).resolves.toBeUndefined();
      
      expect(parser.config.enabled).toBe(true);
      expect(parser.config.handlers.plugin.enabled).toBe(true);
      
      await parser.shutdown();
    });
  });

  describe('Runtime Configuration Changes', () => {
    test('should support handler enable/disable at runtime', async () => {
      const engine = new ModularMockEngine();
      const parser = new MarkupParser(engine);
      await parser.initialize();

      // Verify WikiFormHandler is initially enabled
      expect(parser.getHandler('WikiFormHandler')).toBeTruthy();

      // Disable handler at runtime
      const success = parser.disableHandler('WikiFormHandler');
      expect(success).toBe(true);

      // Handler should be absent from the enabled-only list
      const activeHandlers = parser.getHandlers(true); // enabledOnly = true
      const activeIds = activeHandlers.map(h => h.handlerId);
      expect(activeIds).not.toContain('WikiFormHandler');

      // Re-enable handler
      const reenableSuccess = parser.enableHandler('WikiFormHandler');
      expect(reenableSuccess).toBe(true);

      // Handler should be active again
      const reenabledHandlers = parser.getHandlers(true);
      const reenabledIds = reenabledHandlers.map(h => h.handlerId);
      expect(reenabledIds).toContain('WikiFormHandler');

      await parser.shutdown();
    });
  });
});
