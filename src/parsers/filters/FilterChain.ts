/**
 * FilterChain - Modular content filtering pipeline with complete configuration support
 *
 * Provides a sophisticated, configurable filter system that processes content through
 * multiple stages with priority-based execution, performance monitoring, and error handling.
 *
 * Design Principles:
 * - Complete modularity through app-default-config.json and app-custom-config.json
 * - Zero hardcoded values - everything configurable
 * - Reusable architecture for any content filtering needs
 * - Performance monitoring and caching integration
 *
 * Related Issue: Phase 4 - Filter Pipeline Core
 * Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support
 */

import BaseFilter from './BaseFilter.js';
import type { FilterPhase } from './BaseFilter.js';
import logger from '../../utils/logger.js';
import type { ParseContext } from '../context/ParseContext.js';

/**
 * Structured error returned by FilterChain.collectErrors() (#596).
 * Filters that opt in implement their own collectErrors() returning rule
 * violations of `severity: 'error'`. The chain accumulates them across all
 * enabled filters; the save path (WikiRoutes.savePage) uses the array to
 * decide whether to block the save and what to surface to the editor.
 */
export interface FilterValidationError {
  filterId: string;
  rule: string;
  severity: 'error';
  message: string;
  line?: number;
  column?: number;
}

/**
 * Filter chain configuration
 */
export interface FilterChainConfig {
  enabled: boolean;
  maxFilters: number;
  timeout: number;
  enableProfiling: boolean;
  failOnError: boolean;
  cacheResults: boolean;
  cacheTTL: number;
  preventXSS: boolean;
  sanitizeHTML: boolean;
  stripDangerousContent: boolean;
  enableParallelExecution: boolean;
  maxConcurrentFilters: number;
}

/**
 * Filter execution statistics
 */
export interface FilterExecutionStats {
  executionCount: number;
  totalTime: number;
  errorCount: number;
  lastExecuted: Date | null;
}

/**
 * Filter chain statistics
 */
export interface FilterChainStats {
  executionCount: number;
  totalTime: number;
  filterExecutions: Map<string, FilterExecutionStats>;
  errorCount: number;
  lastExecution: Date | null;
}

/**
 * Performance execution record
 */
export interface PerformanceExecution {
  executionTime: number;
  success: boolean;
  timestamp: number;
}

/**
 * Alert thresholds
 */
export interface AlertThresholds {
  executionTime: number;
  errorRate: number;
}

/**
 * Performance monitor
 */
export interface PerformanceMonitor {
  enabled: boolean;
  recentExecutions: PerformanceExecution[];
  maxRecentEntries: number;
  alertThresholds: AlertThresholds;
}

/**
 * Initialization context
 */
export interface FilterChainInitContext {
  engine?: WikiEngine;
}

/**
 * WikiEngine minimal interface
 */
export interface WikiEngine {
  getManager(name: string): unknown;
}

/**
 * ConfigurationManager minimal interface
 */
interface ConfigurationManager {
  getProperty(key: string, defaultValue?: unknown): unknown;
}

/**
 * NotificationManager minimal interface
 */
interface NotificationManager {
  addNotification(notification: unknown): void;
}

/**
 * Chain statistics summary
 */
export interface ChainStatsSummary {
  executionCount: number;
  totalTime: number;
  averageTime: number;
  errorCount: number;
  lastExecution: Date | null;
  filterCount: number;
  enabledFilterCount: number;
}

/**
 * Extended filter chain statistics
 */
export interface ExtendedFilterChainStats {
  chain: ChainStatsSummary;
  filters: Record<string, FilterExecutionStats & { averageTime: number }>;
  configuration: {
    enabled: boolean;
    maxFilters: number;
    timeout: number;
    enableProfiling: boolean;
    failOnError: boolean;
  };
  performance: {
    recentExecutionCount: number;
    alertThresholds: AlertThresholds;
  } | null;
}

/**
 * Exported filter info
 */
export interface ExportedFilterInfo {
  filterId: string;
  priority: number;
  enabled: boolean;
  description: string;
}

/**
 * Exported chain state
 */
export interface ExportedChainState {
  config: FilterChainConfig;
  stats: Omit<FilterChainStats, 'filterExecutions'> & {
    filterExecutions: Record<string, FilterExecutionStats>;
  };
  filters: ExportedFilterInfo[];
}

/**
 * Configuration summary
 */
export interface ConfigurationSummary extends FilterChainConfig {
  filterCount: number;
  enabledFilterCount: number;
  configurationSource: string;
}

/**
 * FilterChain - Modular content filtering pipeline
 */
class FilterChain {
  private engine: WikiEngine | null;
  private filters: BaseFilter[];
  private filtersByPriority: BaseFilter[];
  private filterMap: Map<string, BaseFilter>;
  private config!: FilterChainConfig;
  private stats: FilterChainStats;
  private performanceMonitor: PerformanceMonitor | null;

  constructor(engine: WikiEngine | null = null) {
    this.engine = engine;
    this.filters = [];
    this.filtersByPriority = [];
    this.filterMap = new Map();
    this.performanceMonitor = null;

    // Performance and monitoring
    this.stats = {
      executionCount: 0,
      totalTime: 0,
      filterExecutions: new Map(),
      errorCount: 0,
      lastExecution: null
    };
  }

  /**
   * Initialize FilterChain with complete modular configuration
   * @param context - Initialization context
   */
  async initialize(context: FilterChainInitContext = {}): Promise<void> {
    this.engine = context.engine ?? null;

    // Load modular configuration from app-default-config.json and app-custom-config.json
    this.loadModularConfiguration();

    // Initialize filter performance monitoring
    this.initializePerformanceMonitoring();

    logger.debug('🔧 FilterChain initialized with modular configuration:');
    logger.debug(`   🔄 Max filters: ${this.config.maxFilters}`);
    logger.debug(`   ⏱️  Timeout: ${this.config.timeout}ms`);
    logger.debug(`   📊 Profiling: ${this.config.enableProfiling ? 'enabled' : 'disabled'}`);
    logger.debug(`   🛡️  Fail on error: ${this.config.failOnError ? 'enabled' : 'disabled'}`);
  }

  /**
   * Load modular configuration from app-default-config.json and app-custom-config.json
   * Demonstrates complete configuration modularity and reusability
   */
  loadModularConfiguration(): void {
    const configManager = this.engine?.getManager('ConfigurationManager') as ConfigurationManager | undefined;

    // Default configuration (equivalent to app-default-config.json values)
    this.config = {
      enabled: true,
      maxFilters: 50,
      timeout: 10000,
      enableProfiling: true,
      failOnError: false,
      cacheResults: true,
      cacheTTL: 600,

      // Security defaults
      preventXSS: true,
      sanitizeHTML: true,
      stripDangerousContent: true,

      // Performance defaults
      enableParallelExecution: false, // Sequential by default for safety
      maxConcurrentFilters: 3
    };

    // Load configuration from app-default-config.json and allow app-custom-config.json overrides
    if (configManager) {
      try {
        // Filter pipeline configuration (modular)
        this.config.enabled = configManager.getProperty('ngdpbase.filters.enabled', this.config.enabled) as boolean;
        this.config.maxFilters = configManager.getProperty('ngdpbase.filters.pipeline.max-filters', this.config.maxFilters) as number;
        this.config.timeout = configManager.getProperty('ngdpbase.filters.pipeline.timeout', this.config.timeout) as number;
        this.config.enableProfiling = configManager.getProperty('ngdpbase.filters.pipeline.enable-profiling', this.config.enableProfiling) as boolean;
        this.config.failOnError = configManager.getProperty('ngdpbase.filters.pipeline.fail-on-error', this.config.failOnError) as boolean;

        // Cache configuration (modular)
        this.config.cacheResults = configManager.getProperty('ngdpbase.filters.cache-results', this.config.cacheResults) as boolean;
        this.config.cacheTTL = configManager.getProperty('ngdpbase.filters.cache-ttl', this.config.cacheTTL) as number;

        // Performance configuration (modular)
        this.config.enableParallelExecution = configManager.getProperty('ngdpbase.filters.enable-parallel-execution', this.config.enableParallelExecution) as boolean;
        this.config.maxConcurrentFilters = configManager.getProperty('ngdpbase.filters.max-concurrent-filters', this.config.maxConcurrentFilters) as number;

      } catch (error) {
        logger.warn('⚠️  Failed to load FilterChain configuration, using defaults:', (error as Error).message);
      }
    }
  }

  /**
   * Initialize performance monitoring for filter execution
   */
  private initializePerformanceMonitoring(): void {
    if (!this.config.enableProfiling) {
      return;
    }

    // Initialize filter-specific performance tracking
    this.performanceMonitor = {
      enabled: true,
      recentExecutions: [],
      maxRecentEntries: 100,
      alertThresholds: {
        executionTime: 1000, // 1 second
        errorRate: 0.1 // 10%
      }
    };
  }

  /**
   * Add filter to the chain with modular configuration
   * @param filter - Filter to add
   * @param _options - Registration options
   * @returns True if added successfully
   */
  addFilter(filter: BaseFilter, _options: Record<string, unknown> = {}): boolean {
    // Validate filter
    if (!(filter instanceof BaseFilter)) {
      throw new Error('Filter must extend BaseFilter');
    }

    // Check filter limit (modular configuration)
    if (this.filters.length >= this.config.maxFilters) {
      throw new Error(`Cannot add filter: maximum limit (${this.config.maxFilters}) reached`);
    }

    // Check for duplicate filter IDs
    if (this.filterMap.has(filter.filterId)) {
      throw new Error(`Filter with ID ${filter.filterId} already exists`);
    }

    // Add to collections
    this.filters.push(filter);
    this.filterMap.set(filter.filterId, filter);

    // Initialize filter-specific stats
    this.stats.filterExecutions.set(filter.filterId, {
      executionCount: 0,
      totalTime: 0,
      errorCount: 0,
      lastExecuted: null
    });

    // Rebuild priority-sorted list
    this.rebuildPriorityList();

    logger.debug(`🔧 Filter added to chain: ${filter.filterId} (priority: ${filter.priority})`);
    return true;
  }

  /**
   * Remove filter from the chain
   * @param filterId - Filter ID to remove
   * @returns True if removed successfully
   */
  removeFilter(filterId: string): boolean {
    const filter = this.filterMap.get(filterId);
    if (!filter) {
      return false;
    }

    // Remove from collections
    this.filters = this.filters.filter(f => f.filterId !== filterId);
    this.filterMap.delete(filterId);
    this.stats.filterExecutions.delete(filterId);

    // Rebuild priority list
    this.rebuildPriorityList();

    logger.debug(`🗑️  Filter removed from chain: ${filterId}`);
    return true;
  }

  /**
   * Rebuild priority-sorted filter list (modular ordering)
   */
  private rebuildPriorityList(): void {
    this.filtersByPriority = this.filters
      .filter(filter => filter.isEnabled())
      .sort((a, b) => {
        // Sort by priority (higher first), then by filterId for consistency
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.filterId.localeCompare(b.filterId);
      });
  }

  /**
   * Process content through the filter chain with modular execution
   * @param content - Content to filter
   * @param context - Parse context
   * @returns Filtered content
   */
  async process(content: string, context: ParseContext, phase?: FilterPhase): Promise<string> {
    if (!this.config.enabled || !content) {
      return content;
    }

    const startTime = Date.now();
    this.stats.executionCount++;

    try {
      let processedContent = content;

      // Execute filters based on configuration. When `phase` is supplied,
      // only filters whose `phase` matches participate (#614 — markup-stage
      // vs html-stage). Without a phase, all enabled filters run for
      // backwards-compat with ad-hoc callers.
      if (this.config.enableParallelExecution) {
        processedContent = await this.executeFiltersParallel(processedContent, context, phase);
      } else {
        processedContent = await this.executeFiltersSequential(processedContent, context, phase);
      }

      // Update performance stats
      const executionTime = Date.now() - startTime;
      this.stats.totalTime += executionTime;
      this.stats.lastExecution = new Date();

      // Track performance for monitoring
      if (this.performanceMonitor) {
        this.trackFilterExecution(executionTime, true);
      }

      return processedContent;

    } catch (error) {
      this.stats.errorCount++;

      if (this.performanceMonitor) {
        this.trackFilterExecution(Date.now() - startTime, false);
      }

      if (this.config.failOnError) {
        throw new Error(`FilterChain execution failed: ${(error as Error).message}`);
      }

      logger.error('❌ FilterChain execution error (continuing with original content):', (error as Error).message);
      return content; // Return original content on error
    }
  }

  /**
   * Collect error-severity rule violations across all enabled filters without
   * mutating content. Used by the save path to decide whether to block a save
   * and what structured errors to surface to the editor (#596).
   *
   * Each filter that opts in exposes its own async `collectErrors(content,
   * context)` returning a `FilterValidationError[]`. Filters without that
   * method are skipped silently — they participate in render-time `process()`
   * only.
   *
   * @param content - Content to validate
   * @param context - Parse context
   * @returns Aggregated error-severity violations from all enabled filters
   */
  async collectErrors(content: string, context: ParseContext, phase?: FilterPhase): Promise<FilterValidationError[]> {
    if (!this.config.enabled || !content) return [];

    const allErrors: FilterValidationError[] = [];

    for (const filter of this.filtersByPriority) {
      if (!filter.isEnabled()) continue;
      if (phase !== undefined && filter.phase !== phase) continue;

      const collector = filter as BaseFilter & {
        collectErrors?: (c: string, ctx: ParseContext) => Promise<FilterValidationError[]>;
      };
      if (typeof collector.collectErrors !== 'function') continue;

      try {
        const errors = await collector.collectErrors(content, context);
        if (errors && errors.length > 0) allErrors.push(...errors);
      } catch (err) {
        logger.error(
          `❌ Filter ${filter.filterId} collectErrors failed:`,
          (err as Error).message
        );
      }
    }

    return allErrors;
  }

  /**
   * Execute filters sequentially (default, safe mode)
   * @param content - Content to process
   * @param context - Parse context
   * @returns Processed content
   */
  private async executeFiltersSequential(content: string, context: ParseContext, phase?: FilterPhase): Promise<string> {
    let processedContent = content;

    for (const filter of this.filtersByPriority) {
      // Skip filters that don't match the requested phase (#614).
      if (phase !== undefined && filter.phase !== phase) {
        continue;
      }
      const filterStartTime = Date.now();

      try {
        // Execute filter with timeout
        const timeoutPromise = new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error(`Filter ${filter.filterId} timeout`)), this.config.timeout).unref();
        });

         
        const filterPromise = filter.process(processedContent, context);
        processedContent = await Promise.race([filterPromise, timeoutPromise]);

        // Update filter-specific stats
        const filterTime = Date.now() - filterStartTime;
        const filterStats = this.stats.filterExecutions.get(filter.filterId);
        if (filterStats) {
          filterStats.executionCount++;
          filterStats.totalTime += filterTime;
          filterStats.lastExecuted = new Date();
        }

      } catch (error) {
        const filterStats = this.stats.filterExecutions.get(filter.filterId);
        if (filterStats) {
          filterStats.errorCount++;
        }

        logger.error(`❌ Filter ${filter.filterId} failed:`, (error as Error).message);

        if (this.config.failOnError) {
          throw error;
        }
        // Continue with next filter on error
      }
    }

    return processedContent;
  }

  /**
   * Execute filters in parallel (advanced mode - configurable)
   * @param content - Content to process
   * @param context - Parse context
   * @returns Processed content
   */
  private async executeFiltersParallel(content: string, context: ParseContext, phase?: FilterPhase): Promise<string> {
    // Group filters by priority for parallel execution within groups.
    // Skip filters that don't match the requested phase (#614).
    const priorityGroups = new Map<number, BaseFilter[]>();

    for (const filter of this.filtersByPriority) {
      if (phase !== undefined && filter.phase !== phase) continue;
      if (!priorityGroups.has(filter.priority)) {
        priorityGroups.set(filter.priority, []);
      }
      priorityGroups.get(filter.priority)?.push(filter);
    }

    let processedContent = content;

    // Execute each priority group
    const sortedGroups = Array.from(priorityGroups.entries()).sort((a, b) => b[0] - a[0]);
    for (const [, filtersInGroup] of sortedGroups) {
      if (filtersInGroup.length === 1) {
        // Single filter, execute normally
        processedContent = await this.executeFilter(filtersInGroup[0], processedContent, context);
      } else {
        // Multiple filters at same priority, execute in parallel
        const filterResults = await Promise.allSettled(
          filtersInGroup.map(filter => this.executeFilter(filter, processedContent, context))
        );

        // Use result from first successful filter, or original content if all fail
        const successResult = filterResults.find(
          (result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled'
        );
        if (successResult) {
          processedContent = successResult.value;
        }
      }
    }

    return processedContent;
  }

  /**
   * Execute a single filter with error handling
   * @param filter - Filter to execute
   * @param content - Content to process
   * @param context - Parse context
   * @returns Processed content
   */
  private async executeFilter(filter: BaseFilter, content: string, context: ParseContext): Promise<string> {
    const startTime = Date.now();

    try {
       
      const result = await filter.process(content, context);

      // Update stats
      const filterTime = Date.now() - startTime;
      const filterStats = this.stats.filterExecutions.get(filter.filterId);
      if (filterStats) {
        filterStats.executionCount++;
        filterStats.totalTime += filterTime;
        filterStats.lastExecuted = new Date();
      }

      return result;

    } catch (error) {
      const filterStats = this.stats.filterExecutions.get(filter.filterId);
      if (filterStats) {
        filterStats.errorCount++;
      }

      throw error;
    }
  }

  /**
   * Track filter execution for performance monitoring (modular monitoring)
   * @param executionTime - Execution time in milliseconds
   * @param success - Whether execution was successful
   */
  private trackFilterExecution(executionTime: number, success: boolean): void {
    if (!this.performanceMonitor) {
      return;
    }

    this.performanceMonitor.recentExecutions.push({
      executionTime,
      success,
      timestamp: Date.now()
    });

    // Limit recent entries
    if (this.performanceMonitor.recentExecutions.length > this.performanceMonitor.maxRecentEntries) {
      this.performanceMonitor.recentExecutions.shift();
    }

    // Check performance thresholds
    this.checkPerformanceThresholds();
  }

  /**
   * Check performance thresholds and generate alerts (modular alerting)
   */
  private checkPerformanceThresholds(): void {
    if (!this.performanceMonitor || this.performanceMonitor.recentExecutions.length < 10) {
      return;
    }

    const recent = this.performanceMonitor.recentExecutions.slice(-20);

    // Check average execution time
    const avgTime = recent.reduce((sum, exec) => sum + exec.executionTime, 0) / recent.length;
    if (avgTime > this.performanceMonitor.alertThresholds.executionTime) {
      this.generateAlert('SLOW_FILTER_EXECUTION', `Average filter execution time ${avgTime.toFixed(2)}ms exceeds threshold`);
    }

    // Check error rate
    const errorCount = recent.filter(exec => !exec.success).length;
    const errorRate = errorCount / recent.length;
    if (errorRate > this.performanceMonitor.alertThresholds.errorRate) {
      this.generateAlert('HIGH_FILTER_ERROR_RATE', `Filter error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold`);
    }
  }

  /**
   * Generate performance alert (modular alerting)
   * @param type - Alert type
   * @param message - Alert message
   */
  private generateAlert(type: string, message: string): void {
    logger.warn(`⚠️  FilterChain Performance Alert [${type}]: ${message}`);

    // Send to notification system if available
    const notificationManager = this.engine?.getManager('NotificationManager') as NotificationManager | undefined;
    if (notificationManager) {
      notificationManager.addNotification({
        type: 'performance',
        title: `FilterChain Alert: ${type}`,
        message,
        priority: 'medium',
        source: 'FilterChain'
      });
    }
  }

  /**
   * Get filter by ID
   * @param filterId - Filter ID
   * @returns Filter or null if not found
   */
  getFilter(filterId: string): BaseFilter | null {
    return this.filterMap.get(filterId) ?? null;
  }

  /**
   * Get all filters sorted by priority
   * @param enabledOnly - Only return enabled filters
   * @returns Filters sorted by priority
   */
  getFilters(enabledOnly: boolean = true): BaseFilter[] {
    if (enabledOnly) {
      return [...this.filtersByPriority];
    }
    return [...this.filters];
  }

  /**
   * Enable filter by ID
   * @param filterId - Filter ID
   * @returns True if successful
   */
  enableFilter(filterId: string): boolean {
    const filter = this.filterMap.get(filterId);
    if (filter) {
      filter.enable();
      this.rebuildPriorityList();
      logger.debug(`✅ Enabled filter: ${filterId}`);
      return true;
    }
    return false;
  }

  /**
   * Disable filter by ID
   * @param filterId - Filter ID
   * @returns True if successful
   */
  disableFilter(filterId: string): boolean {
    const filter = this.filterMap.get(filterId);
    if (filter) {
      filter.disable();
      this.rebuildPriorityList();
      logger.debug(`❌ Disabled filter: ${filterId}`);
      return true;
    }
    return false;
  }

  /**
   * Get comprehensive filter chain statistics (modular monitoring)
   * @returns Filter chain statistics
   */
  getStats(): ExtendedFilterChainStats {
    const filterStats: Record<string, FilterExecutionStats & { averageTime: number }> = {};
    for (const [filterId, stats] of this.stats.filterExecutions) {
      filterStats[filterId] = {
        ...stats,
        averageTime: stats.executionCount > 0 ? stats.totalTime / stats.executionCount : 0
      };
    }

    return {
      chain: {
        executionCount: this.stats.executionCount,
        totalTime: this.stats.totalTime,
        averageTime: this.stats.executionCount > 0 ? this.stats.totalTime / this.stats.executionCount : 0,
        errorCount: this.stats.errorCount,
        lastExecution: this.stats.lastExecution,
        filterCount: this.filters.length,
        enabledFilterCount: this.filtersByPriority.length
      },
      filters: filterStats,
      configuration: {
        enabled: this.config.enabled,
        maxFilters: this.config.maxFilters,
        timeout: this.config.timeout,
        enableProfiling: this.config.enableProfiling,
        failOnError: this.config.failOnError
      },
      performance: this.performanceMonitor ? {
        recentExecutionCount: this.performanceMonitor.recentExecutions.length,
        alertThresholds: this.performanceMonitor.alertThresholds
      } : null
    };
  }

  /**
   * Reset all filter statistics
   */
  resetStats(): void {
    this.stats = {
      executionCount: 0,
      totalTime: 0,
      filterExecutions: new Map(),
      errorCount: 0,
      lastExecution: null
    };

    // Re-initialize filter stats
    for (const filterId of this.filterMap.keys()) {
      this.stats.filterExecutions.set(filterId, {
        executionCount: 0,
        totalTime: 0,
        errorCount: 0,
        lastExecuted: null
      });
    }

    if (this.performanceMonitor) {
      this.performanceMonitor.recentExecutions = [];
    }
  }

  /**
   * Get configuration summary for debugging (modular introspection)
   * @returns Configuration summary
   */
  getConfiguration(): ConfigurationSummary {
    return {
      ...this.config,
      filterCount: this.filters.length,
      enabledFilterCount: this.filtersByPriority.length,
      configurationSource: this.engine?.getManager('ConfigurationManager') ? 'ConfigurationManager' : 'defaults'
    };
  }

  /**
   * Export filter chain state for persistence or debugging
   * @returns Serializable state
   */
  exportState(): ExportedChainState {
    return {
      config: this.config,
      stats: {
        executionCount: this.stats.executionCount,
        totalTime: this.stats.totalTime,
        errorCount: this.stats.errorCount,
        lastExecution: this.stats.lastExecution,
        filterExecutions: Object.fromEntries(this.stats.filterExecutions)
      },
      filters: this.filters.map(filter => ({
        filterId: filter.filterId,
        priority: filter.priority,
        enabled: filter.isEnabled(),
        description: filter.description
      }))
    };
  }

  /**
   * Clear all filters and reset state
   */
  async clearAll(): Promise<void> {
    for (const filter of this.filters) {
      try {
        await filter.shutdown();
      } catch (error) {
        logger.error(`❌ Error shutting down filter ${filter.filterId}:`, (error as Error).message);
      }
    }

    this.filters = [];
    this.filtersByPriority = [];
    this.filterMap.clear();
    this.resetStats();

    logger.debug('🔧 FilterChain cleared');
  }

  /**
   * Shutdown filter chain
   */
  async shutdown(): Promise<void> {
    logger.debug('🔧 FilterChain shutting down...');
    await this.clearAll();
    this.performanceMonitor = null;
  }
}

// Export for ES modules
export default FilterChain;

// Export for CommonJS (Jest compatibility)
