import logger from '../../utils/logger.js';
import type ParseContext from '../context/ParseContext.js';
import type { FilterValidationError } from './FilterChain.js';

/**
 * BaseFilter - Abstract base class for all content filters with modular configuration
 *
 * Provides the foundation for content filtering with complete modularity through
 * app-default-config.json and app-custom-config.json configuration support.
 *
 * Design Principles:
 * - Complete configuration modularity and reusability
 * - Zero hardcoded values - everything configurable
 * - Consistent interface across all filter types
 * - Performance monitoring and error handling
 * - Security-first design with configurable validation
 *
 * Related Issue: Phase 4 - Filter Pipeline Core
 * Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support
 */

/**
 * Pipeline phase a filter operates in (#614).
 *
 * - `'markup'` (default) — runs on raw markdown/JSPWiki content before
 *   Showdown rendering. ValidationFilter, SpamFilter operate here.
 * - `'html'` — runs on rendered HTML after Showdown. SecurityFilter
 *   (XSS prevention, dangerous-tag stripping, attribute allow-listing)
 *   operates here, since its rules target HTML constructs that don't
 *   exist in raw markdown.
 */
export type FilterPhase = 'markup' | 'html';

/**
 * Filter configuration options
 */
export interface FilterOptions {
  enabled?: boolean;
  timeout?: number;
  cacheResults?: boolean;
  cacheTTL?: number;
  version?: string;
  description?: string;
  category?: string;
  phase?: FilterPhase;
}

/**
 * Filter performance statistics
 */
export interface FilterStats {
  executionCount: number;
  totalTime: number;
  errorCount: number;
  lastExecuted: Date | null;
  averageTime: number;
}

/**
 * Filter configuration (from config files)
 */
export interface FilterConfig {
  enabled: boolean;
  priority: number;
  timeout: number;
  cacheResults: boolean;
  cacheTTL: number;
  reportErrors: boolean;
  logLevel: string;
}

/**
 * Filter metadata
 */
export interface FilterMetadata {
  id: string;
  version: string;
  description: string;
  category: string;
  priority: number;
  enabled: boolean;
  options: Required<FilterOptions>;
  stats: FilterStats & {
    filterId: string;
    priority: number;
    enabled: boolean;
    initialized: boolean;
    category: string;
  };
  configuration: FilterConfig | null;
}

/**
 * Filter error context
 */
export interface FilterErrorContext {
  filterId: string;
  error: string;
  stack?: string;
  contentLength: number;
  contentPreview: string;
  context: {
    pageName?: string;
    userName?: string;
  };
  stats: FilterStats;
  timestamp: string;
}

/**
 * Configuration summary
 */
export interface ConfigurationSummary {
  filterId: string;
  enabled: boolean;
  priority: number;
  configuration: FilterConfig | null;
  configurationSource: 'loaded' | 'defaults';
  options: Required<FilterOptions>;
}

/**
 * Initialization context (minimal interface for unconverted dependencies)
 */
export interface FilterInitializationContext {
  engine?: {
    getManager(name: string): unknown;
  };
}

/**
 * ParseContext re-export — the real class from `../context/ParseContext.js`.
 * Kept as a re-export so existing filters can keep their
 * `import { ParseContext }` paths unchanged. (#629 Pass 2)
 */
export type { ParseContext };

/**
 * ConfigurationManager minimal interface
 */
interface ConfigurationManager {
  getProperty(key: string, defaultValue?: unknown): unknown;
}

/**
 * BaseFilter - Abstract base class for all content filters
 */
abstract class BaseFilter {
  priority: number;
  readonly filterId: string;
  readonly version: string;
  readonly description: string;
  readonly category: string;
  readonly phase: FilterPhase;

  protected options: Required<FilterOptions>;
  protected stats: FilterStats;
  protected enabled: boolean;
  protected initialized: boolean;
  protected config: FilterConfig | null;

  /**
   * Create a content filter
   * @param priority - Filter priority (0-1000, higher = executed first)
   * @param options - Filter configuration options
   */
  constructor(priority: number = 100, options: FilterOptions = {}) {
    if (new.target === BaseFilter) {
      throw new Error('BaseFilter is abstract and cannot be instantiated directly');
    }

    // Validate priority
    if (typeof priority !== 'number' || priority < 0 || priority > 1000) {
      throw new Error('Priority must be a number between 0 and 1000');
    }

    // Core filter properties
    this.priority = priority;
    this.options = {
      enabled: true,
      timeout: 5000,
      cacheResults: true,
      cacheTTL: 600,
      version: '1.0.0',
      description: '',
      category: 'general',
      phase: 'markup',
      ...options
    };

    // Filter metadata
    this.filterId = this.constructor.name;
    this.version = this.options.version;
    this.description = this.options.description;
    this.category = this.options.category;
    this.phase = this.options.phase;

    // Performance tracking
    this.stats = {
      executionCount: 0,
      totalTime: 0,
      errorCount: 0,
      lastExecuted: null,
      averageTime: 0
    };

    // Filter state
    this.enabled = this.options.enabled;
    this.initialized = false;
    this.config = null;
  }

  /**
   * Initialize filter with modular configuration
   * @param context - Initialization context
   */
  async initialize(context: FilterInitializationContext = {}): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Load modular configuration
    this.loadModularConfiguration(context);

    // Perform custom initialization
    await this.onInitialize(context);

    this.initialized = true;
  }

  /**
   * Load configuration from app-default-config.json and app-custom-config.json
   * @param context - Initialization context
   */
  protected loadModularConfiguration(context: FilterInitializationContext): void {
    const configManager = context.engine?.getManager('ConfigurationManager') as ConfigurationManager | undefined;

    // Default configuration
    this.config = {
      enabled: true,
      priority: this.priority,
      timeout: 5000,
      cacheResults: true,
      cacheTTL: 600,
      reportErrors: true,
      logLevel: 'warn'
    };

    // Load from configuration files if available
    if (configManager) {
      try {
        const filterType = this.getFilterType();
        if (filterType) {
          // Load filter-specific configuration
          this.config.enabled = configManager.getProperty(
            `ngdpbase.filters.${filterType}.enabled`,
            this.config.enabled
          ) as boolean;
          this.config.priority = configManager.getProperty(
            `ngdpbase.filters.${filterType}.priority`,
            this.config.priority
          ) as number;

          // Update priority if configured
          if (this.config.priority !== this.priority) {
            this.priority = this.config.priority;
          }
        }
      } catch (error) {
        logger.warn(
          `Failed to load configuration for filter ${this.filterId}, using defaults: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Get filter type for configuration lookup (override in subclasses)
   * @returns Filter type for configuration
   */
  protected getFilterType(): string | null {
    // Map common filter names to configuration keys
    const typeMap: Record<string, string> = {
      'SpamFilter': 'spam',
      'SecurityFilter': 'security',
      'ValidationFilter': 'validation',
      'XSSFilter': 'security',
      'CSRFFilter': 'security'
    };

    return typeMap[this.filterId] || null;
  }

  /**
   * Custom initialization logic (override in subclasses)
   * @param _context - Initialization context
   */
  protected async onInitialize(_context: FilterInitializationContext): Promise<void> {
    // Override in subclasses for custom initialization
  }

  /**
   * Main filter processing method - MUST be implemented by subclasses
   * @param content - Content to filter
   * @param context - Parse context
   * @returns Filtered content
   */
  abstract process(content: string, context: ParseContext): Promise<string>;

  /**
   * Rule violations that must BLOCK a page save — MUST be implemented by
   * subclasses (#1037).
   *
   * Abstract on purpose. `FilterChain.collectErrors()` calls this on every
   * enabled filter, but skipped any filter that did not define it, so a filter
   * could opt out of save-time enforcement by simply not having the method —
   * invisibly, with nothing to grep for. SecurityFilter and SpamFilter both
   * did exactly that, which is why a page containing `<script>` saved cleanly
   * while a filter that would have caught it was enabled and running.
   *
   * Declaring it here turns that silence into a compile error. A filter that
   * genuinely blocks nothing returns `[]` — one explicit line stating a
   * position, rather than an absence nobody notices.
   *
   * Note the input: at save time this receives the page SOURCE, not rendered
   * HTML, regardless of the filter's `phase`. A filter whose `process()` works
   * on rendered output must not reuse that logic here — assuming otherwise is
   * what made SecurityFilter's `preventXSS()` entity-encode whole documents.
   *
   * Only `severity: 'error'` belongs here. Warnings are surfaced at render
   * time and must never stop a save.
   *
   * @param content - The page source about to be written
   * @param context - Parse context (pageName, userName, engine)
   * @returns Blocking violations; empty when the content is acceptable
   */
  abstract collectErrors(
    content: string,
    context: ParseContext
  ): Promise<FilterValidationError[]>;

  /**
   * Execute filter with performance tracking and error handling
   * @param content - Content to process
   * @param context - Parse context
   * @returns Processed content
   */
  async execute(content: string, context: ParseContext): Promise<string> {
    if (!this.enabled) {
      return content;
    }

    const startTime = Date.now();
    this.stats.executionCount++;

    try {
      const result = await this.process(content, context);

      // Update performance stats
      const executionTime = Date.now() - startTime;
      this.stats.totalTime += executionTime;
      this.stats.averageTime = this.stats.totalTime / this.stats.executionCount;
      this.stats.lastExecuted = new Date();

      return result;

    } catch (error) {
      this.stats.errorCount++;

      const errorContext = this.createErrorContext(error as Error, content, context);

      if (this.config?.reportErrors) {
        logger.error(`Filter ${this.filterId} execution failed: ${JSON.stringify(errorContext)}`);
      }

      // Return original content for graceful degradation
      return content;
    }
  }

  /**
   * Create error context for debugging (modular error handling)
   * @param error - The error that occurred
   * @param content - Content being processed
   * @param context - Parse context
   * @returns Error context
   */
  protected createErrorContext(error: Error, content: string, context: ParseContext): FilterErrorContext {
    return {
      filterId: this.filterId,
      error: error.message,
      stack: error.stack,
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + '...',
      context: {
        pageName: context.wikiContext?.pageName ?? undefined,
        userName: context.userName
      },
      stats: { ...this.stats },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Enable the filter
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable the filter
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if filter is enabled
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get filter statistics
   * @returns Filter statistics
   */
  getStats(): FilterStats & {
    filterId: string;
    priority: number;
    enabled: boolean;
    initialized: boolean;
    category: string;
    } {
    return {
      ...this.stats,
      filterId: this.filterId,
      priority: this.priority,
      enabled: this.enabled,
      initialized: this.initialized,
      category: this.category
    };
  }

  /**
   * Reset filter statistics
   */
  resetStats(): void {
    this.stats = {
      executionCount: 0,
      totalTime: 0,
      errorCount: 0,
      lastExecuted: null,
      averageTime: 0
    };
  }

  /**
   * Get filter metadata
   * @returns Filter metadata
   */
  getMetadata(): FilterMetadata {
    return {
      id: this.filterId,
      version: this.version,
      description: this.description,
      category: this.category,
      priority: this.priority,
      enabled: this.enabled,
      options: { ...this.options },
      stats: this.getStats(),
      configuration: this.config
    };
  }

  /**
   * Get configuration summary for debugging (modular introspection)
   * @returns Configuration summary
   */
  getConfigurationSummary(): ConfigurationSummary {
    return {
      filterId: this.filterId,
      enabled: this.enabled,
      priority: this.priority,
      configuration: this.config,
      configurationSource: this.config ? 'loaded' : 'defaults',
      options: this.options
    };
  }

  /**
   * Clean up filter resources (optional override)
   */
  async shutdown(): Promise<void> {
    await this.onShutdown();
    this.initialized = false;
  }

  /**
   * Custom shutdown logic (override in subclasses)
   */
  protected async onShutdown(): Promise<void> {
    // Override in subclasses for custom cleanup
  }

  /**
   * String representation of filter
   * @returns String representation
   */
  toString(): string {
    return `${this.filterId}(priority=${this.priority}, category=${this.category}, enabled=${this.enabled})`;
  }
}

// Export for ES modules
export default BaseFilter;

// Export for CommonJS (Jest compatibility)
