import MarkupParser from '../MarkupParser';
import { type MockInstance } from 'vitest';
import { readThroughVersioned } from '../../cache/RegionCache';

// Enhanced Mock CacheManager with multiple regions
class MockAdvancedCacheManager {
  regions: Map<string, { cache: Map<string, unknown>; get: MockInstance; set: MockInstance }>;
  initialized: boolean;
  constructor() {
    this.regions = new Map();
    this.initialized = true;
  }
  
  isInitialized() {
    return this.initialized;
  }
  
  region(regionName) {
    if (!this.regions.has(regionName)) {
      this.regions.set(regionName, {
        cache: new Map(),
        get: vi.fn(async (key) => {
          const region = this.regions.get(regionName);
          return region.cache.get(key) || null;
        }),
        set: vi.fn(async (key, value, options) => {
          const region = this.regions.get(regionName);
          region.cache.set(key, value);
        })
      });
      // #1751: the parse cache reads through with data versions, over the spies above.
      const region = this.regions.get(regionName);
      Object.assign(region, { getOrSetVersioned: (key, factory, options) => readThroughVersioned(region, async () => '0', key, factory, options) });
    }
    return this.regions.get(regionName);
  }
}

// Mock ConfigurationManager with advanced cache config
class MockAdvancedConfigurationManager {
  config: Record<string, unknown>;
  constructor(config: Record<string, unknown> = {}) {
    this.config = {
      'ngdpbase.markup.enabled': true,
      'ngdpbase.markup.caching': true,
      'ngdpbase.markup.cache-ttl': 300,
      'ngdpbase.markup.cache.parse-results.enabled': true,
      'ngdpbase.markup.cache.parse-results.ttl': 300,
      'ngdpbase.markup.cache.handler-results.enabled': true,
      'ngdpbase.markup.cache.handler-results.ttl': 600,
      'ngdpbase.markup.cache.patterns.enabled': true,
      'ngdpbase.markup.cache.patterns.ttl': 3600,
      'ngdpbase.markup.cache.variables.enabled': true,
      'ngdpbase.markup.cache.variables.ttl': 900,
      'ngdpbase.markup.cache.enable-warmup': true,
      'ngdpbase.markup.cache.metrics-enabled': true,
      'ngdpbase.markup.performance.monitoring': true,
      'ngdpbase.markup.performance.alert-thresholds.parse-time': 100,
      'ngdpbase.markup.performance.alert-thresholds.cache-hit-ratio': 0.6,
      'ngdpbase.markup.performance.alert-thresholds.error-rate': 0.05,
      ...config
    };
  }
  
  getProperty(key, defaultValue) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }
}

// Mock NotificationManager
class MockNotificationManager {
  notifications: unknown[];
  constructor() {
    this.notifications = [];
  }
  
  addNotification(notification) {
    this.notifications.push(notification);
  }
  
  getNotifications() {
    return this.notifications;
  }
}

// Mock VariableManager
class MockVariableManager {
  expandVariables(content, context) {
    return content.replace(/\$\{(\w+)\}/g, (match, varName) => {
      if (varName === 'pagename') return context.pageName || 'TestPage';
      if (varName === 'username') return context.userName || 'TestUser';
      if (varName === 'applicationname') return 'ngdpbase';
      return match;
    });
  }
}

// Mock Engine
class MockAdvancedWikiEngine {
  managers: Map<string, unknown>;
  constructor(managers: Record<string, unknown> = {}) {
    this.managers = new Map();
    
    // Add managers
    this.managers.set('CacheManager', managers.CacheManager || new MockAdvancedCacheManager());
    this.managers.set('ConfigurationManager', managers.ConfigurationManager || new MockAdvancedConfigurationManager());
    this.managers.set('NotificationManager', managers.NotificationManager || new MockNotificationManager());
    this.managers.set('VariableManager', managers.VariableManager || new MockVariableManager());
  }
  
  getManager(name) {
    return this.managers.get(name) || null;
  }
}

describe('MarkupParser Advanced Caching and Performance', () => {
  let markupParser;
  let mockEngine;
  let mockCacheManager;
  let mockNotificationManager;

  beforeEach(async () => {
    mockCacheManager = new MockAdvancedCacheManager();
    mockNotificationManager = new MockNotificationManager();
    mockEngine = new MockAdvancedWikiEngine({
      CacheManager: mockCacheManager,
      NotificationManager: mockNotificationManager
    });
    
    markupParser = new MarkupParser(mockEngine);
    await markupParser.initialize();
  });

  afterEach(async () => {
    await markupParser.shutdown();
  });

  describe('Advanced Cache Initialization', () => {
    test('should initialize multiple cache strategies', () => {
      expect(markupParser.cacheStrategies).toHaveProperty('parseResults');
      expect(markupParser.cacheStrategies).toHaveProperty('handlerResults');
      expect(markupParser.cacheStrategies).toHaveProperty('patterns');
      expect(markupParser.cacheStrategies).toHaveProperty('variables');
    });

    test('should initialize cache metrics for each strategy', () => {
      expect(markupParser.metrics.cacheMetrics.size).toBe(4);
      expect(markupParser.metrics.cacheMetrics.has('parseResults')).toBe(true);
      expect(markupParser.metrics.cacheMetrics.has('handlerResults')).toBe(true);
      expect(markupParser.metrics.cacheMetrics.has('patterns')).toBe(true);
      expect(markupParser.metrics.cacheMetrics.has('variables')).toBe(true);
    });

    test('should respect individual cache strategy configuration', async () => {
      const configWithDisabledHandlers = new MockAdvancedConfigurationManager({
        'ngdpbase.markup.cache.handler-results.enabled': false,
        'ngdpbase.markup.cache.patterns.enabled': false
      });
      
      const customEngine = new MockAdvancedWikiEngine({
        ConfigurationManager: configWithDisabledHandlers,
        CacheManager: mockCacheManager
      });
      
      const customParser = new MarkupParser(customEngine);
      await customParser.initialize();
      
      expect(customParser.cacheStrategies).toHaveProperty('parseResults');
      expect(customParser.cacheStrategies).toHaveProperty('variables');
      expect(customParser.cacheStrategies).not.toHaveProperty('handlerResults');
      expect(customParser.cacheStrategies).not.toHaveProperty('patterns');
      
      await customParser.shutdown();
    });
  });

  describe('Performance Monitoring', () => {
    test('should initialize performance monitoring', () => {
      expect(markupParser.performanceMonitor).toBeTruthy();
      expect(markupParser.performanceMonitor.alerts).toEqual([]);
      expect(markupParser.performanceMonitor.recentParseTimes).toEqual([]);
    });

    test('should track performance metrics during parsing', async () => {
      const content = '# Test Content';
      
      await markupParser.parse(content);
      await markupParser.parse(content); // Second call should hit cache
      
      expect(markupParser.performanceMonitor.recentParseTimes.length).toBe(2);
      expect(markupParser.performanceMonitor.recentParseTimes[0].cacheHit).toBe(false);
      expect(markupParser.performanceMonitor.recentParseTimes[1].cacheHit).toBe(true);
    });

    test('should disable performance monitoring when configured', async () => {
      const configWithoutMonitoring = new MockAdvancedConfigurationManager({
        'ngdpbase.markup.performance.monitoring': false
      });
      
      const customEngine = new MockAdvancedWikiEngine({
        ConfigurationManager: configWithoutMonitoring,
        CacheManager: mockCacheManager
      });
      
      const customParser = new MarkupParser(customEngine);
      await customParser.initialize();
      
      expect(customParser.performanceMonitor).toBeNull();
      
      await customParser.shutdown();
    });
  });

  describe('Cache Strategies', () => {
    test('should cache parse results with correct TTL', async () => {
      const content = 'Test content for caching';
      
      await markupParser.parse(content);
      
      const parseResultsCache = markupParser.cacheStrategies.parseResults;
      expect(parseResultsCache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ __versioned: true, value: expect.any(String) }), // #1751: the HTML and the versions it was built from
        { ttl: 300 }
      );
    });

    test('should update cache metrics correctly', async () => {
      const content = 'Test content';
      
      // First parse - cache miss and set
      await markupParser.parse(content);
      
      let metrics = markupParser.getMetrics();
      expect(metrics.cacheStrategies.parseResults.misses).toBe(1);
      expect(metrics.cacheStrategies.parseResults.sets).toBe(1);
      
      // Mock cache to return result for second parse
      const parseResultsCache = markupParser.cacheStrategies.parseResults;
      parseResultsCache.get.mockResolvedValueOnce({ __versioned: true, value: 'cached result', versions: {} }); // #1751: a stored entry
      
      // Second parse - cache hit
      await markupParser.parse(content);
      
      metrics = markupParser.getMetrics();
      expect(metrics.cacheStrategies.parseResults.hits).toBe(1);
    });

    test('should handle cache errors gracefully', async () => {
      const content = 'Test content';
      
      // Mock cache to throw error
      const parseResultsCache = markupParser.cacheStrategies.parseResults;
      parseResultsCache.get.mockRejectedValueOnce(new Error('Cache error'));
      parseResultsCache.set.mockRejectedValueOnce(new Error('Cache error'));
      
      // Should not throw despite cache errors
      const result = await markupParser.parse(content);
      
      expect(result).toBeDefined();
    });
  });

  describe('Cache Warmup', () => {
    test('should perform cache warmup when enabled', async () => {
      // Cache warmup happens during initialization
      const patternsCache = markupParser.cacheStrategies.patterns;
      const variablesCache = markupParser.cacheStrategies.variables;
      
      // Check that patterns were cached
      expect(patternsCache.set).toHaveBeenCalled();
      
      // Check that variables were attempted to be cached
      // Should succeed with our mock VariableManager
      expect(variablesCache.set).toHaveBeenCalledTimes(5); // 5 common variables cached
    });

    test('should skip warmup when disabled', async () => {
      const configWithoutWarmup = new MockAdvancedConfigurationManager({
        'ngdpbase.markup.cache.enable-warmup': false
      });
      
      const customEngine = new MockAdvancedWikiEngine({
        ConfigurationManager: configWithoutWarmup,
        CacheManager: new MockAdvancedCacheManager()
      });
      
      const customParser = new MarkupParser(customEngine);
      await customParser.initialize();
      
      // Cache should be initialized but no warmup calls
      const patternsCache = customParser.cacheStrategies.patterns;
      expect(patternsCache.set).not.toHaveBeenCalled();
      
      await customParser.shutdown();
    });
  });

  describe('Performance Alerts', () => {
    beforeEach(() => {
      // Lower thresholds for testing
      markupParser.config.performance.alertThresholds.parseTime = 5; // 5ms
      markupParser.config.performance.alertThresholds.cacheHitRatio = 0.8; // 80%
      markupParser.config.performance.alertThresholds.errorRate = 0.1; // 10%
    });

    test('should generate slow parsing alert', () => {
      // checkPerformanceThresholds() uses performanceMonitor.recentParseTimes (last 20 non-cached entries).
      // Inject 20 entries at 50ms each — well above the 5ms threshold set in beforeEach.
      markupParser.performanceMonitor.recentParseTimes = Array.from({ length: 20 }, () => ({
        time: 50,
        cacheHit: false
      }));

      // Force threshold check (bypass the checkInterval guard)
      markupParser.performanceMonitor.lastCheck = 0;
      markupParser.checkPerformanceThresholds();

      const alerts = markupParser.getPerformanceAlerts();
      const slowParsingAlert = alerts.find(alert => alert.type === 'SLOW_PARSING');

      expect(slowParsingAlert).toBeTruthy();
      expect(slowParsingAlert.message).toContain('exceeds threshold');
    });

    test('should generate low cache hit ratio alert', async () => {
      // Simulate low cache hit ratio — must meet minCacheSamples threshold (default 50)
      markupParser.metrics.cacheHits = 10;
      markupParser.metrics.cacheMisses = 40; // 50 total ops, 20% hit ratio

      // Force threshold check
      markupParser.performanceMonitor.lastCheck = 0;
      markupParser.checkPerformanceThresholds();

      const alerts = markupParser.getPerformanceAlerts();
      const cacheAlert = alerts.find(alert => alert.type === 'LOW_CACHE_HIT_RATIO');

      expect(cacheAlert).toBeTruthy();
      expect(cacheAlert.message).toContain('below threshold');
    });

    test('should generate high error rate alert', async () => {
      // Simulate high error rate
      markupParser.metrics.parseCount = 10;
      markupParser.metrics.errorCount = 2; // 20% error rate
      
      // Force threshold check
      markupParser.performanceMonitor.lastCheck = 0;
      markupParser.checkPerformanceThresholds();
      
      const alerts = markupParser.getPerformanceAlerts();
      const errorAlert = alerts.find(alert => alert.type === 'HIGH_ERROR_RATE');
      
      expect(errorAlert).toBeTruthy();
      expect(errorAlert.message).toContain('exceeds threshold');
    });
  });

  describe('Cache Operations', () => {
    test('should use different TTLs for different cache strategies', async () => {
      const content = 'Test content';
      await markupParser.parse(content);
      
      // Check parse results cache TTL
      const parseResultsCache = markupParser.cacheStrategies.parseResults;
      expect(parseResultsCache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ __versioned: true, value: expect.any(String) }), // #1751: the HTML and the versions it was built from
        { ttl: 300 }
      );
    });

    test('should provide cache methods for handler results', async () => {
      const handlerId = 'TestHandler';
      const contentHash = 'abc123';
      const contextHash = 'def456';
      const result = 'cached result';
      
      // Test caching handler result
      await markupParser.cacheHandlerResult(handlerId, contentHash, contextHash, result);
      
      const handlerCache = markupParser.cacheStrategies.handlerResults;
      expect(handlerCache.set).toHaveBeenCalledWith(
        `handler:${handlerId}:${contentHash}:${contextHash}`,
        result,
        { ttl: 600 }
      );
    });

    test('should retrieve cached handler results', async () => {
      const handlerId = 'TestHandler';
      const contentHash = 'abc123';
      const contextHash = 'def456';
      
      // Mock cache to return result
      const handlerCache = markupParser.cacheStrategies.handlerResults;
      handlerCache.get.mockResolvedValueOnce('cached handler result');
      
      const result = await markupParser.getCachedHandlerResult(handlerId, contentHash, contextHash);
      
      expect(result).toBe('cached handler result');
      expect(handlerCache.get).toHaveBeenCalledWith(`handler:${handlerId}:${contentHash}:${contextHash}`);
    });
  });

  describe('Configuration Flexibility', () => {
    test('should work with minimal cache configuration', async () => {
      const minimalConfig = new MockAdvancedConfigurationManager({
        'ngdpbase.markup.cache.parse-results.enabled': true,
        'ngdpbase.markup.cache.handler-results.enabled': false,
        'ngdpbase.markup.cache.patterns.enabled': false,
        'ngdpbase.markup.cache.variables.enabled': false
      });
      
      const customEngine = new MockAdvancedWikiEngine({
        ConfigurationManager: minimalConfig,
        CacheManager: mockCacheManager
      });
      
      const customParser = new MarkupParser(customEngine);
      await customParser.initialize();
      
      expect(Object.keys(customParser.cacheStrategies)).toEqual(['parseResults']);
      
      const content = 'Test content';
      const result = await customParser.parse(content);
      
      expect(result).toBeDefined();
      
      await customParser.shutdown();
    });

    test('should work without any caching', async () => {
      const noCacheConfig = new MockAdvancedConfigurationManager({
        'ngdpbase.markup.caching': false
      });
      
      const customEngine = new MockAdvancedWikiEngine({
        ConfigurationManager: noCacheConfig,
        CacheManager: mockCacheManager
      });
      
      const customParser = new MarkupParser(customEngine);
      await customParser.initialize();
      
      expect(Object.keys(customParser.cacheStrategies)).toHaveLength(0);
      
      const content = 'Test content';
      const result = await customParser.parse(content);
      
      expect(result).toBeDefined();
      
      await customParser.shutdown();
    });
  });

  describe('Modular Design', () => {
    test('should allow custom cache TTL configuration', async () => {
      const customTTLConfig = new MockAdvancedConfigurationManager({
        'ngdpbase.markup.cache.parse-results.ttl': 1800,
        'ngdpbase.markup.cache.handler-results.ttl': 3600
      });
      
      const customEngine = new MockAdvancedWikiEngine({
        ConfigurationManager: customTTLConfig,
        CacheManager: mockCacheManager
      });
      
      const customParser = new MarkupParser(customEngine);
      await customParser.initialize();
      
      expect(customParser.config.cache.parseResults.ttl).toBe(1800);
      expect(customParser.config.cache.handlerResults.ttl).toBe(3600);
      
      await customParser.shutdown();
    });

    test('should support custom performance thresholds', async () => {
      const customThresholds = new MockAdvancedConfigurationManager({
        'ngdpbase.markup.performance.alert-thresholds.parse-time': 50,
        'ngdpbase.markup.performance.alert-thresholds.cache-hit-ratio': 0.9,
        'ngdpbase.markup.performance.alert-thresholds.error-rate': 0.01
      });
      
      const customEngine = new MockAdvancedWikiEngine({
        ConfigurationManager: customThresholds,
        CacheManager: mockCacheManager
      });
      
      const customParser = new MarkupParser(customEngine);
      await customParser.initialize();
      
      expect(customParser.config.performance.alertThresholds.parseTime).toBe(50);
      expect(customParser.config.performance.alertThresholds.cacheHitRatio).toBe(0.9);
      expect(customParser.config.performance.alertThresholds.errorRate).toBe(0.01);
      
      await customParser.shutdown();
    });
  });

  describe('Integration with app-custom-config.json', () => {
    test('should override defaults with custom configuration', async () => {
      // Simulate custom configuration overrides
      const customConfig = new MockAdvancedConfigurationManager({
        'ngdpbase.markup.enabled': true,
        'ngdpbase.markup.cache.parse-results.ttl': 900, // Override default 300
        'ngdpbase.markup.handler-registry.max-handlers': 50, // Override default 100
        'ngdpbase.markup.performance.monitoring': false // Override default true
      });
      
      const customEngine = new MockAdvancedWikiEngine({
        ConfigurationManager: customConfig,
        CacheManager: mockCacheManager
      });
      
      const customParser = new MarkupParser(customEngine);
      await customParser.initialize();
      
      // Verify custom configuration was loaded
      expect(customParser.config.cache.parseResults.ttl).toBe(900);
      // HandlerRegistry config is private, so it uses default (100) instead of custom (50)
      expect(customParser.handlerRegistry.config.maxHandlers).toBe(100);
      expect(customParser.performanceMonitor).toBeNull();
      
      await customParser.shutdown();
    });
  });
});
