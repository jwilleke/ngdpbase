import MarkupParser from '../MarkupParser';
import { type MockInstance } from 'vitest';
import { readThroughVersioned } from '../../cache/RegionCache';
import logger from '../../utils/logger';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ParserPerformanceHistory } from '../ParserPerformanceHistory';

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
    test('should initialize the one page cache region (#1751)', () => {
      expect(Object.keys(markupParser.cacheStrategies)).toEqual(['parseResults']);
    });

    test('should initialize cache metrics for the parse-results strategy', () => {
      expect(markupParser.metrics.cacheMetrics.size).toBe(1);
      expect(markupParser.metrics.cacheMetrics.has('parseResults')).toBe(true);
    });

    test('should respect parse-results cache configuration', async () => {
      const configWithoutParseCache = new MockAdvancedConfigurationManager({
        'ngdpbase.markup.cache.parse-results.enabled': false
      });
      
      const customEngine = new MockAdvancedWikiEngine({
        ConfigurationManager: configWithoutParseCache,
        CacheManager: mockCacheManager
      });
      
      const customParser = new MarkupParser(customEngine);
      await customParser.initialize();
      
      expect(customParser.cacheStrategies).not.toHaveProperty('parseResults');
      
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

  describe('Crossing and recovery lines instead of notifications (#2468)', () => {
    let warn: MockInstance;
    let info: MockInstance;
    const lines = (spy: MockInstance, text: string) =>
      spy.mock.calls.filter((c) => String(c[0]).includes(text));

    beforeEach(() => {
      warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      info = vi.spyOn(logger, 'info').mockImplementation(() => logger);
      markupParser.config.performance.alertThresholds.parseTime = 100;
    });
    afterEach(() => { vi.restoreAllMocks(); });

    const setAverage = (ms: number) => {
      markupParser.performanceMonitor.recentParseTimes = Array.from({ length: 20 }, () => ({ time: ms, cacheHit: false }));
    };
    const check = () => {
      markupParser.performanceMonitor.lastCheck = 0;
      markupParser.checkPerformanceThresholds();
    };

    test('five checks over the limit send no notification and write one warning; the return writes one info line', () => {
      setAverage(119.5);
      for (let i = 0; i < 5; i++) check();

      expect(mockNotificationManager.getNotifications()).toHaveLength(0);
      expect(lines(warn, 'Page building is over its limit')).toHaveLength(1);
      expect(lines(warn, 'Page building is over its limit')[0][0])
        .toBe('Page building is over its limit: average 119.5 ms for the last 20 pages, limit 100 ms.');
      expect(lines(warn, 'Performance Alert')).toHaveLength(0);
      expect(lines(info, 'Page building is back under its limit')).toHaveLength(0);
      // One entry per crossing stays in the in-memory list.
      expect(markupParser.getPerformanceAlerts().filter((a) => a.type === 'SLOW_PARSING')).toHaveLength(1);

      setAverage(82.1);
      check();
      check();

      expect(lines(info, 'Page building is back under its limit')).toHaveLength(1);
      expect(String(lines(info, 'Page building is back under its limit')[0][0]))
        .toMatch(/^Page building is back under its limit: average 82\.1 ms, limit 100 ms\. It was over for \d+ minutes?\.$/);
      expect(lines(warn, 'Page building is over its limit')).toHaveLength(1);
      expect(mockNotificationManager.getNotifications()).toHaveLength(0);
    });

    test('going over again after a recovery is a new crossing', () => {
      setAverage(150);
      check();
      setAverage(50);
      check();
      setAverage(150);
      check();
      expect(lines(warn, 'Page building is over its limit')).toHaveLength(2);
      expect(lines(info, 'Page building is back under its limit')).toHaveLength(1);
    });

    test('the cache ratio and the error rate are the last minute\'s, not the lifetime counters', () => {
      markupParser.config.performance.alertThresholds.cacheHitRatio = 0.5;
      markupParser.config.performance.alertThresholds.errorRate = 0.1;
      markupParser.config.performance.alertThresholds.minCacheSamples = 50;
      const crossings = (type: string) => markupParser.performanceMonitor.alerts.filter((a) => a.type === type).length;

      // Minute 1: 100 lookups, all hits; 100 pages, no failures.
      markupParser.metrics.cacheHits = 100;
      markupParser.metrics.parseCount = 100;
      check();
      expect(crossings('LOW_CACHE_HIT_RATIO')).toBe(0);
      expect(crossings('HIGH_ERROR_RATE')).toBe(0);

      // Minute 2: 60 more lookups with 6 hits (10%), 60 more pages with 30 failures (50%).
      // Lifetime is 106/160 = 66% hits and 30/160 = 19% failures: the lifetime hit ratio is
      // fine, but the minute is not.
      markupParser.metrics.cacheHits = 106;
      markupParser.metrics.cacheMisses = 54;
      markupParser.metrics.parseCount = 160;
      markupParser.metrics.errorCount = 30;
      check();
      expect(crossings('LOW_CACHE_HIT_RATIO')).toBe(1);
      expect(crossings('HIGH_ERROR_RATE')).toBe(1);

      // Minute 3: 60 more lookups, all hits, no new failures: back under, on the minute's numbers.
      markupParser.metrics.cacheHits = 166;
      markupParser.metrics.parseCount = 220;
      check();
      expect(lines(info, 'Stored copies are back above their limit')).toHaveLength(1);
      expect(lines(info, 'Page failures are back under their limit')).toHaveLength(1);
    });
  });

  describe('Recording every check (#2468)', () => {
    let dir: string;
    let parser;
    let warn: MockInstance;

    const makeParser = async (historyDir: string) => {
      const config = new MockAdvancedConfigurationManager();
      Object.assign(config, { getResolvedDataPath: (_key: string, _fallback: string) => historyDir });
      const engine = new MockAdvancedWikiEngine({ ConfigurationManager: config });
      const p = new MarkupParser(engine);
      await p.initialize();
      p.config.performance.alertThresholds.parseTime = 100;
      return p;
    };
    const check = (p) => {
      p.performanceMonitor.lastCheck = 0;
      p.checkPerformanceThresholds();
    };
    const stored = () => new ParserPerformanceHistory(dir).read();

    beforeEach(async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'markup-perf-'));
      warn = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      vi.spyOn(logger, 'info').mockImplementation(() => logger);
      parser = await makeParser(dir);
    });
    afterEach(async () => {
      await parser.shutdown();
      fs.rmSync(dir, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    test('every check, over the limit or under it, appends one line', async () => {
      parser.performanceMonitor.recentParseTimes = Array.from({ length: 20 }, () => ({ time: 119.5, cacheHit: false }));
      check(parser);
      parser.performanceMonitor.recentParseTimes = Array.from({ length: 20 }, () => ({ time: 40, cacheHit: false }));
      check(parser);

      await vi.waitFor(async () => { expect(await stored()).toHaveLength(2); });
      const [over, under] = await stored();
      expect(over.parse).toBeCloseTo(119.5);
      expect(under.parse).toBeCloseTo(40);
      expect(over.hit).toBeNull();   // no lookups that minute
      expect(over.err).toBeNull();   // nothing parsed that minute
      expect(Date.parse(over.t)).not.toBeNaN();
    });

    test('the line carries the minute\'s cache ratio, error rate and page count', async () => {
      parser.metrics.cacheHits = 3;
      parser.metrics.cacheMisses = 1;
      parser.metrics.parseCount = 10;
      parser.metrics.errorCount = 1;
      check(parser);

      await vi.waitFor(async () => { expect(await stored()).toHaveLength(1); });
      const [line] = await stored();
      expect(line.hit).toBeCloseTo(0.75);
      expect(line.err).toBeCloseTo(0.1);
      expect(line.n).toBe(10);
    });

    test('two checks inside 60 seconds write one line', async () => {
      parser.performanceMonitor.recentParseTimes = [{ time: 10, cacheHit: false }];
      parser.performanceMonitor.lastCheck = 0;
      parser.checkPerformanceThresholds();
      parser.checkPerformanceThresholds();
      parser.checkPerformanceThresholds();

      await vi.waitFor(async () => { expect(await stored()).toHaveLength(1); });
      await new Promise((r) => setTimeout(r, 50));
      expect(await stored()).toHaveLength(1);
    });

    test('a line is on disk when the check returns control, before any restart', async () => {
      parser.performanceMonitor.recentParseTimes = [{ time: 10, cacheHit: false }];
      check(parser);
      await vi.waitFor(async () => { expect(await stored()).toHaveLength(1); });

      const restarted = await makeParser(dir);
      try {
        expect(await stored()).toHaveLength(1);
      } finally {
        await restarted.shutdown();
      }
    });

    test('a write failure does not throw from the parse path and logs a warning', async () => {
      const blocker = path.join(dir, 'blocker');
      fs.writeFileSync(blocker, 'x');
      const broken = await makeParser(path.join(blocker, 'inside'));
      try {
        broken.performanceMonitor.recentParseTimes = [{ time: 10, cacheHit: false }];
        broken.performanceMonitor.lastCheck = 0;
        expect(() => broken.updatePerformanceMetrics(10, false)).not.toThrow();
        await vi.waitFor(() => {
          expect(warn.mock.calls.some((c) => /page building history/i.test(String(c[0])))).toBe(true);
        });
      } finally {
        await broken.shutdown();
      }
      expect(await broken.parse('still works', { pageName: 'P' })).toContain('still works');
    });
  });

  describe('Cache Operations', () => {
    test('should store parse results with the parse-results TTL', async () => {
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
  });

  describe('Configuration Flexibility', () => {
    test('should work with minimal cache configuration', async () => {
      const minimalConfig = new MockAdvancedConfigurationManager({
        'ngdpbase.markup.cache.parse-results.enabled': true
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
        'ngdpbase.markup.cache.parse-results.ttl': 1800
      });
      
      const customEngine = new MockAdvancedWikiEngine({
        ConfigurationManager: customTTLConfig,
        CacheManager: mockCacheManager
      });
      
      const customParser = new MarkupParser(customEngine);
      await customParser.initialize();
      
      expect(customParser.config.cache.parseResults.ttl).toBe(1800);
      
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
