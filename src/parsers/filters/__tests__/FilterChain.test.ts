import FilterChain from '../FilterChain';
import BaseFilter from '../BaseFilter';

// Test filter implementations
class TestFilter extends BaseFilter {
  constructor(id = 'TestFilter', priority = 100) {
    super(priority, { description: 'Test filter' });
    (this as { filterId: string }).filterId = id;
  }

  async process(content, context) {
    return content.replace(/test/g, 'FILTERED');
  }
}

class HighPriorityFilter extends BaseFilter {
  constructor() {
    super(200, { description: 'High priority test filter' });
    (this as { filterId: string }).filterId = 'HighPriorityFilter';
  }

  async process(content, context) {
    return content.replace(/high/g, 'HIGH_PRIORITY');
  }
}

class ErrorFilter extends BaseFilter {
  constructor() {
    super(150, { description: 'Filter that throws errors' });
    (this as { filterId: string }).filterId = 'ErrorFilter';
  }

  async process(content, context) {
    throw new Error('Test filter error');
  }
}

// Mock ConfigurationManager for modular testing
class MockConfigurationManager {
  constructor(config = {}) {
    this.config = {
      'ngdpbase.filters.enabled': true,
      'ngdpbase.filters.pipeline.max-filters': 50,
      'ngdpbase.filters.pipeline.timeout': 10000,
      'ngdpbase.filters.pipeline.enable-profiling': true,
      'ngdpbase.filters.pipeline.fail-on-error': false,
      ...config
    };
  }
  
  getProperty(key, defaultValue) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }
}

// Mock engine
const createMockEngine = (config = {}) => ({
  getManager: vi.fn((name) => {
    if (name === 'ConfigurationManager') return new MockConfigurationManager(config);
    if (name === 'NotificationManager') return {
      addNotification: vi.fn()
    };
    return null;
  })
});

describe('FilterChain Modular Configuration', () => {
  let filterChain;
  let mockEngine;

  beforeEach(async () => {
    mockEngine = createMockEngine();
    filterChain = new FilterChain(mockEngine);
    await filterChain.initialize({ engine: mockEngine });
  });

  afterEach(async () => {
    await filterChain.shutdown();
  });

  describe('Modular Configuration Loading', () => {
    test('should load default configuration from app-default-config.json simulation', async () => {
      expect(filterChain.config.enabled).toBe(true);
      expect(filterChain.config.maxFilters).toBe(50);
      expect(filterChain.config.timeout).toBe(10000);
      expect(filterChain.config.enableProfiling).toBe(true);
      expect(filterChain.config.failOnError).toBe(false);
    });

    test('should override with app-custom-config.json values', async () => {
      const customConfig = {
        'ngdpbase.filters.pipeline.max-filters': 25,
        'ngdpbase.filters.pipeline.timeout': 5000,
        'ngdpbase.filters.pipeline.fail-on-error': true
      };
      
      const customEngine = createMockEngine(customConfig);
      const customFilterChain = new FilterChain(customEngine);
      await customFilterChain.initialize({ engine: customEngine });
      
      expect(customFilterChain.config.maxFilters).toBe(25);  // Custom override
      expect(customFilterChain.config.timeout).toBe(5000);   // Custom override
      expect(customFilterChain.config.failOnError).toBe(true); // Custom override
      expect(customFilterChain.config.enableProfiling).toBe(true); // Default value
      
      await customFilterChain.shutdown();
    });

    test('should handle configuration loading errors gracefully', async () => {
      const errorEngine = {
        getManager: vi.fn(() => ({
          getProperty: vi.fn(() => { throw new Error('Config error'); })
        }))
      };
      
      const errorFilterChain = new FilterChain(errorEngine);
      
      // Should not throw
      await expect(errorFilterChain.initialize({ engine: errorEngine })).resolves.toBeUndefined();
      
      // Should use defaults
      expect(errorFilterChain.config.enabled).toBe(true);
      
      await errorFilterChain.shutdown();
    });

    test('should work without ConfigurationManager', async () => {
      const engineWithoutConfig = {
        getManager: vi.fn(() => null)
      };
      
      const noConfigFilterChain = new FilterChain(engineWithoutConfig);
      await noConfigFilterChain.initialize({ engine: engineWithoutConfig });
      
      // Should use built-in defaults
      expect(noConfigFilterChain.config.enabled).toBe(true);
      expect(noConfigFilterChain.config.maxFilters).toBe(50);
      
      await noConfigFilterChain.shutdown();
    });
  });

  describe('Filter Management', () => {
    test('should add filters successfully', () => {
      const filter = new TestFilter();
      
      const result = filterChain.addFilter(filter);
      
      expect(result).toBe(true);
      expect(filterChain.getFilter('TestFilter')).toBe(filter);
      expect(filterChain.getFilters()).toContain(filter);
    });

    test('should reject invalid filters', () => {
      expect(() => {
        filterChain.addFilter({});
      }).toThrow('must extend BaseFilter');
    });

    test('should enforce filter limit from configuration', () => {
      // Set low limit for testing
      filterChain.config.maxFilters = 2;
      
      filterChain.addFilter(new TestFilter('Filter1'));
      filterChain.addFilter(new TestFilter('Filter2', 200));
      
      expect(() => {
        filterChain.addFilter(new TestFilter('Filter3', 300));
      }).toThrow('maximum limit (2) reached');
    });

    test('should prevent duplicate filter IDs', () => {
      filterChain.addFilter(new TestFilter());
      
      expect(() => {
        filterChain.addFilter(new TestFilter()); // Same ID
      }).toThrow('already exists');
    });

    test('should remove filters successfully', () => {
      const filter = new TestFilter();
      filterChain.addFilter(filter);
      
      expect(filterChain.getFilter('TestFilter')).toBe(filter);
      
      const result = filterChain.removeFilter('TestFilter');
      
      expect(result).toBe(true);
      expect(filterChain.getFilter('TestFilter')).toBeNull();
    });

    test('should maintain priority order', () => {
      const lowFilter = new TestFilter('Low', 50);
      const highFilter = new HighPriorityFilter(); // priority 200
      const mediumFilter = new TestFilter('Medium', 100);
      
      filterChain.addFilter(lowFilter);
      filterChain.addFilter(highFilter);
      filterChain.addFilter(mediumFilter);
      
      const sortedFilters = filterChain.getFilters();
      const priorities = sortedFilters.map(f => f.priority);
      
      expect(priorities).toEqual([200, 100, 50]); // Descending order
    });
  });

  describe('Filter Execution', () => {
    test('should execute filters in priority order', async () => {
      const filter1 = new TestFilter('Filter1', 100);
      const filter2 = new HighPriorityFilter(); // priority 200
      
      filterChain.addFilter(filter1);
      filterChain.addFilter(filter2);
      
      const content = 'test high content';
      const context = { pageName: 'Test' };
      
      const result = await filterChain.process(content, context);
      
      // High priority filter should execute first
      expect(result).toBe('FILTERED HIGH_PRIORITY content');
    });

    test('should handle filter errors gracefully when failOnError is false', async () => {
      filterChain.config.failOnError = false;
      
      const errorFilter = new ErrorFilter();
      const goodFilter = new TestFilter();
      
      filterChain.addFilter(errorFilter);
      filterChain.addFilter(goodFilter);
      
      const content = 'test content';
      const context = { pageName: 'Test' };
      
      const result = await filterChain.process(content, context);
      
      // Should continue processing despite error
      expect(result).toBe('FILTERED content');
      expect(filterChain.stats.errorCount).toBe(0); // Chain error count
    });

    test('should fail fast when failOnError is true', async () => {
      filterChain.config.failOnError = true;
      
      const errorFilter = new ErrorFilter();
      filterChain.addFilter(errorFilter);
      
      const content = 'test content';
      const context = { pageName: 'Test' };
      
      await expect(filterChain.process(content, context)).rejects.toThrow('FilterChain execution failed');
    });

    test('should respect filter enable/disable state', async () => {
      const filter = new TestFilter();
      filterChain.addFilter(filter);
      
      // Disable filter
      filter.disable();
      filterChain.rebuildPriorityList();
      
      const content = 'test content';
      const result = await filterChain.process(content, {});
      
      expect(result).toBe('test content'); // Unchanged, filter disabled
    });

    test('should track performance statistics', async () => {
      const filter = new TestFilter();
      filterChain.addFilter(filter);

      const content = 'test content';
      await filterChain.process(content, {});
      await filterChain.process(content, {});

      const stats = filterChain.getStats();

      expect(stats.chain.executionCount).toBe(2);
      expect(stats.chain.totalTime).toBeGreaterThanOrEqual(0); // May be 0 for fast operations
      expect(stats.filters.TestFilter.executionCount).toBe(2);
    });
  });

  describe('Performance Monitoring', () => {
    test('should initialize performance monitoring when enabled', () => {
      expect(filterChain.performanceMonitor).toBeTruthy();
      expect(filterChain.performanceMonitor.enabled).toBe(true);
      expect(filterChain.performanceMonitor.recentExecutions).toEqual([]);
    });

    test('should disable performance monitoring when configured', async () => {
      const noPerfConfig = {
        'ngdpbase.filters.pipeline.enable-profiling': false
      };

      const customEngine = createMockEngine(noPerfConfig);
      const customFilterChain = new FilterChain(customEngine);
      await customFilterChain.initialize({ engine: customEngine });

      expect(customFilterChain.performanceMonitor).toBeFalsy(); // May be undefined or null

      await customFilterChain.shutdown();
    });

    test('should track recent executions for performance analysis', async () => {
      const filter = new TestFilter();
      filterChain.addFilter(filter);
      
      await filterChain.process('test content', {});
      
      expect(filterChain.performanceMonitor.recentExecutions.length).toBe(1);
      expect(filterChain.performanceMonitor.recentExecutions[0]).toHaveProperty('executionTime');
      expect(filterChain.performanceMonitor.recentExecutions[0]).toHaveProperty('success', true);
    });
  });

  describe('Configuration Flexibility', () => {
    test('should support different filter limits per deployment', async () => {
      const prodConfig = {
        'ngdpbase.filters.pipeline.max-filters': 100,
        'ngdpbase.filters.pipeline.timeout': 15000
      };
      
      const prodEngine = createMockEngine(prodConfig);
      const prodFilterChain = new FilterChain(prodEngine);
      await prodFilterChain.initialize({ engine: prodEngine });
      
      expect(prodFilterChain.config.maxFilters).toBe(100);
      expect(prodFilterChain.config.timeout).toBe(15000);
      
      await prodFilterChain.shutdown();
    });

    test('should disable entire filter system when configured', async () => {
      const disabledConfig = {
        'ngdpbase.filters.enabled': false
      };
      
      const disabledEngine = createMockEngine(disabledConfig);
      const disabledFilterChain = new FilterChain(disabledEngine);
      await disabledFilterChain.initialize({ engine: disabledEngine });
      
      expect(disabledFilterChain.config.enabled).toBe(false);
      
      // Processing should return content unchanged
      const content = 'test content';
      const result = await disabledFilterChain.process(content, {});
      
      expect(result).toBe(content);
      
      await disabledFilterChain.shutdown();
    });
  });

  describe('Filter State Management', () => {
    test('should enable and disable filters at runtime', () => {
      const filter = new TestFilter();
      filterChain.addFilter(filter);
      
      expect(filter.isEnabled()).toBe(true);
      expect(filterChain.getFilters(true)).toContain(filter);
      
      const disableResult = filterChain.disableFilter('TestFilter');
      expect(disableResult).toBe(true);
      expect(filter.isEnabled()).toBe(false);
      expect(filterChain.getFilters(true)).not.toContain(filter);
      
      const enableResult = filterChain.enableFilter('TestFilter');
      expect(enableResult).toBe(true);
      expect(filter.isEnabled()).toBe(true);
      expect(filterChain.getFilters(true)).toContain(filter);
    });

    test('should return false for non-existent filter state changes', () => {
      expect(filterChain.enableFilter('NonExistent')).toBe(false);
      expect(filterChain.disableFilter('NonExistent')).toBe(false);
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should collect comprehensive statistics', async () => {
      const filter = new TestFilter();
      filterChain.addFilter(filter);
      
      await filterChain.process('test content', {});
      
      const stats = filterChain.getStats();
      
      expect(stats).toHaveProperty('chain');
      expect(stats).toHaveProperty('filters');
      expect(stats).toHaveProperty('configuration');
      
      expect(stats.chain.executionCount).toBe(1);
      expect(stats.filters.TestFilter.executionCount).toBe(1);
    });

    test('should export state for persistence', () => {
      const filter = new TestFilter();
      filterChain.addFilter(filter);
      
      const state = filterChain.exportState();
      
      expect(state).toHaveProperty('config');
      expect(state).toHaveProperty('stats');
      expect(state).toHaveProperty('filters');
      
      expect(state.filters).toHaveLength(1);
      expect(state.filters[0].filterId).toBe('TestFilter');
    });

    test('should reset statistics', async () => {
      const filter = new TestFilter();
      filterChain.addFilter(filter);
      
      await filterChain.process('test content', {});
      expect(filterChain.stats.executionCount).toBe(1);
      
      filterChain.resetStats();
      expect(filterChain.stats.executionCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle individual filter errors gracefully', async () => {
      const errorFilter = new ErrorFilter();
      const goodFilter = new TestFilter();
      
      filterChain.addFilter(errorFilter);
      filterChain.addFilter(goodFilter);
      
      const content = 'test content';
      const result = await filterChain.process(content, {});
      
      // Good filter should still process despite error filter
      expect(result).toBe('FILTERED content');
    });

    test('should continue processing when ConfigurationManager fails', async () => {
      const errorEngine = {
        getManager: vi.fn(() => ({
          getProperty: vi.fn(() => { throw new Error('Config error'); })
        }))
      };
      
      const errorFilterChain = new FilterChain(errorEngine);
      
      // Should initialize with defaults
      await expect(errorFilterChain.initialize({ engine: errorEngine })).resolves.toBeUndefined();
      
      await errorFilterChain.shutdown();
    });
  });

  describe('Integration with MarkupParser', () => {
    test('should integrate seamlessly with MarkupParser configuration', async () => {
      // Test that FilterChain respects the same configuration patterns as other components
      const config = filterChain.getConfiguration();

      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('maxFilters');
      expect(config).toHaveProperty('timeout');
      expect(config).toHaveProperty('configurationSource');
    });
  });

  describe('getFilters() — all filters including disabled', () => {
    test('getFilters(false) returns all filters including disabled ones', async () => {
      const engine = createMockEngine();
      const fc = new FilterChain(engine);
      await fc.initialize({ engine });
      fc.addFilter(new TestFilter('EnabledFilter'));
      const all = fc.getFilters(false);
      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThanOrEqual(1);
      await fc.shutdown();
    });
  });

  describe('shutdown() error handling', () => {
    test('shutdown() continues when a filter throws during shutdown', async () => {
      const engine = createMockEngine();
      const fc = new FilterChain(engine);
      await fc.initialize({ engine });
      const badFilter = new TestFilter('BadShutdown');
      badFilter.shutdown = vi.fn().mockRejectedValue(new Error('shutdown fail'));
      fc.addFilter(badFilter);
      await expect(fc.shutdown()).resolves.not.toThrow();
    });
  });

  describe('performance threshold checking', () => {
    test('checkPerformanceThresholds() via enough recent executions', async () => {
      const engine = createMockEngine({
        'ngdpbase.filters.pipeline.enable-profiling': true
      });
      const fc = new FilterChain(engine);
      await fc.initialize({ engine });
      fc.addFilter(new TestFilter('PerfFilter'));
      // Run enough times to trigger threshold checking (needs 10+ executions)
      const ctx = { pageName: 'Test', engine };
      for (let i = 0; i < 12; i++) {
        await fc.process('test content', ctx);
      }
      await fc.shutdown();
    });
  });
});
