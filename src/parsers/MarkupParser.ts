import crypto from 'crypto';
import showdown from 'showdown';
import BaseManager from '../managers/BaseManager.js';
import { HandlerRegistry } from './handlers/HandlerRegistry.js';
import BaseSyntaxHandler from './handlers/BaseSyntaxHandler.js';
import FilterChain from './filters/FilterChain.js';
import { DOMParser as WikiDOMParser } from './dom/DOMParser.js';
import DOMVariableHandler from './dom/handlers/DOMVariableHandler.js';
import DOMPluginHandler from './dom/handlers/DOMPluginHandler.js';
import DOMLinkHandler from './dom/handlers/DOMLinkHandler.js';
import logger from '../utils/logger.js';
import { guardShowdownInput } from '../utils/showdownGuard.js';
import JSPWikiPreprocessor from './handlers/JSPWikiPreprocessor.js';
import PluginSyntaxHandler from './handlers/PluginSyntaxHandler.js';
import WikiTagHandler from './handlers/WikiTagHandler.js';
import WikiFormHandler from './handlers/WikiFormHandler.js';
import LinkParserHandler from './handlers/LinkParserHandler.js';
import ParseContext from './context/ParseContext.js';
import WikiDocument from './dom/WikiDocument.js';
import type { LinkedomElement, LinkedomNode } from './dom/WikiDocument.js';
import { convertEmojiShortcodes } from './data/emoji-map.js';
import type RegionCache from '../cache/RegionCache.js';
import type { WikiEngine } from '../types/WikiEngine.js';

// ============================================================================
// Type Definitions
// ============================================================================

/** Configuration for MarkupParser */
export interface MarkupParserConfig extends Record<string, unknown> {
  /** Whether MarkupParser is enabled */
  enabled: boolean;
  /** Whether caching is enabled */
  caching: boolean;
  /** Cache TTL in seconds */
  cacheTTL: number;
  /** Handler registry configuration */
  handlerRegistry: HandlerRegistryConfig;
  /** Handler configurations */
  handlers: Record<string, HandlerConfig>;
  /** Cache configuration */
  cache: CacheConfig;
  /** Performance configuration */
  performance: PerformanceConfig;
  /** Emoji shortcode conversion */
  emoji?: { enabled: boolean };
}

/** Handler registry configuration */
export interface HandlerRegistryConfig {
  /** Whether to enable dependency resolution */
  enableDependencyResolution?: boolean;
  /** Maximum handler priority */
  maxPriority?: number;
  /** Maximum number of handlers */
  maxHandlers?: number;
  /** Whether to allow duplicate priorities */
  allowDuplicatePriorities?: boolean;
  /** Whether to enable conflict detection */
  enableConflictDetection?: boolean;
  /** Default handler timeout in ms */
  defaultTimeout?: number;
}

/** Individual handler configuration */
export interface HandlerConfig {
  /** Whether handler is enabled */
  enabled: boolean;
  /** Handler priority */
  priority: number;
}

/** Cache configuration */
export interface CacheConfig {
  /** Parse results cache strategy */
  parseResults: CacheStrategyConfig;
  /** Handler results cache strategy */
  handlerResults: CacheStrategyConfig;
  /** Patterns cache strategy */
  patterns: CacheStrategyConfig;
  /** Variables cache strategy */
  variables: CacheStrategyConfig;
  /** Whether to enable cache warmup */
  enableWarmup: boolean;
  /** Whether to enable metrics */
  metricsEnabled: boolean;
}

/** Cache strategy configuration */
export interface CacheStrategyConfig {
  /** Whether this strategy is enabled */
  enabled: boolean;
  /** Time to live in seconds */
  ttl: number;
  /** Maximum cache size */
  maxSize: number;
}

/** Performance configuration */
export interface PerformanceConfig {
  /** Whether performance monitoring is enabled */
  monitoring: boolean;
  /** Alert thresholds */
  alertThresholds: AlertThresholds;
}

/** Performance alert thresholds */
export interface AlertThresholds {
  /** Parse time threshold in milliseconds */
  parseTime: number;
  /** Cache hit ratio threshold (0-1) */
  cacheHitRatio: number;
  /** Error rate threshold (0-1) */
  errorRate: number;
  /** Minimum cache samples for metrics */
  minCacheSamples: number;
}

/** Parse context */
export interface ParseContextData {
  /** Page name */
  pageName?: string;
  /** User name */
  userName?: string;
  /** User context object */
  userContext?: unknown;
  /** Request information */
  requestInfo?: unknown;
  /** Code blocks extracted during parsing */
  codeBlocks?: string[];
  /** Protected HTML blocks */
  protectedBlocks?: string[];
  /** Syntax tokens */
  syntaxTokens?: unknown[];
  /** Additional context properties */
  [key: string]: unknown;
}

/** Extracted JSPWiki element */
export interface ExtractedElement {
  /** Element type */
  type: 'variable' | 'plugin' | 'link' | 'escaped' | 'style' | 'inline-style' | 'footnote-ref' | 'footnote-def' | 'code' | 'fenced-code';
  /** Original syntax */
  syntax: string;
  /** Unique ID */
  id: number;
  /** Position in content */
  position?: number;
  /** Variable name (for variables) */
  varName?: string;
  /** Plugin/tag inner content (for plugins) */
  inner?: string;
  /** Link target (for links) */
  target?: string;
  /** Escaped literal content (for escaped) */
  literal?: string;
  /** CSS class name (for style blocks) */
  className?: string;
  /** Style block content (for style blocks) */
  styleContent?: string;
  /** Accumulated CSS classes from parent style blocks (for nested styles) */
  accumulatedClasses?: string[];
  /** Footnote identifier — the id portion of [^id] or [^id]: text */
  footnoteId?: string;
  /** Footnote definition text — the content after [^id]: */
  footnoteText?: string;
  /** Raw text content for inline code spans (`...`) and fenced code blocks (```...```) */
  codeContent?: string;
  /** Language tag from fenced code blocks (e.g. 'javascript' from ```javascript) */
  codeLanguage?: string;
  /** #907: inline-style variant — css | sup | sub | strike | class (#938) */
  inlineVariant?: 'css' | 'sup' | 'sub' | 'strike' | 'class';
  /** #907: raw CSS declarations for inline-style variant 'css' (parenthesis body) */
  cssRaw?: string;
  /** #938: space-separated class list for inline-style variant 'class' */
  classNames?: string;
}

/** Configuration manager interface for type safety */
interface ConfigurationManagerInterface {
  getProperty<T>(key: string, defaultValue: T): T;
  isInitialized(): boolean;
}

/** Cache manager interface for type safety */
interface CacheManagerInterface {
  isInitialized(): boolean;
  region(name: string): RegionCache;
}

/** Variable manager interface for type safety */
interface VariableManagerInterface {
  expandVariables(content: string, context: Record<string, unknown>): Promise<string>;
}

/** Rendering manager interface for type safety */
interface RenderingManagerInterface {
  converter?: {
    makeHtml(content: string): string;
  };
}

/** Notification manager interface for type safety */
interface NotificationManagerInterface {
  addNotification(notification: Record<string, unknown>): void;
}

/** Result of extraction */
export interface ExtractionResult {
  /** Sanitized content with placeholders */
  sanitized: string;
  /** Extracted JSPWiki elements */
  jspwikiElements: ExtractedElement[];
  /** Unique UUID for this extraction */
  uuid: string;
}

/** Parser metrics */
export interface ParserMetrics {
  /** Number of parses performed */
  parseCount: number;
  /** Total parse time in milliseconds */
  totalParseTime: number;
  /** Number of errors */
  errorCount: number;
  /** Number of cache hits */
  cacheHits: number;
  /** Number of cache misses */
  cacheMisses: number;
  /** Cache metrics by strategy */
  cacheMetrics: Map<string, CacheMetrics>;
}

/** Cache metrics for a strategy */
export interface CacheMetrics {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Number of cache sets */
  sets: number;
}

/** Performance monitor state */
export interface PerformanceMonitor {
  /** Performance alerts */
  alerts: PerformanceAlert[];
  /** Last check timestamp */
  lastCheck: number;
  /** Check interval in milliseconds */
  checkInterval: number;
  /** Recent parse times */
  recentParseTimes: ParseTimeEntry[];
  /** Recent error rates */
  recentErrorRates: number[];
  /** Maximum recent entries to keep */
  maxRecentEntries: number;
}

/** Performance alert */
export interface PerformanceAlert {
  /** Alert type */
  type: string;
  /** Alert message */
  message: string;
  /** Timestamp */
  timestamp: string;
  /** Related metrics */
  metrics: unknown;
}

/** Parse time entry */
export interface ParseTimeEntry {
  /** Parse time in milliseconds */
  time: number;
  /** Whether this was a cache hit */
  cacheHit: boolean;
  /** Timestamp */
  timestamp: number;
}

/** Extended metrics returned by getMetrics() */
export interface ExtendedMetrics extends ParserMetrics {
  /** Average parse time */
  averageParseTime: number;
  /** Cache hit ratio */
  cacheHitRatio: number;
  /** Handler registry stats */
  handlerRegistry?: unknown;
  /** Filter chain stats */
  filterChain?: unknown;
  /** Cache strategies stats */
  cacheStrategies?: Record<string, unknown>;
  /** Performance monitoring stats */
  performance?: unknown;
}

/**
 * MarkupParser - Comprehensive markup parsing engine for JSPWiki compatibility
 *
 * ============================================================================
 * RENDERING PIPELINE (Issue #120, Issue #185):
 * ============================================================================
 *
 * **WikiDocument DOM Extraction Pipeline** (Issues #115-#120):
 * 1. Extract JSPWiki syntax before markdown parsing (extractJSPWikiSyntax())
 * 2. Create WikiDocument DOM nodes (createDOMNode())
 * 3. Parse markdown with Showdown (makeHtml())
 * 4. Merge DOM nodes into HTML (mergeDOMNodes())
 *
 * This pipeline fixes the markdown heading bug (#110, #93) and provides
 * robust JSPWiki syntax processing without order dependencies.
 *
 * The legacy 7-phase string-based pipeline was removed in Issue #185.
 *
 * ============================================================================
 *
 * Related Issues:
 * - #185 - Remove deprecated 7-phase legacy parser pipeline
 * - #114 - WikiDocument DOM Solution (Epic)
 * - #115-#120 - Implementation Phases
 * - #110, #93 - Markdown heading bug fixes
 */

/**
 * Safely extract error message from unknown error type
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error).message;
    if (typeof msg === 'string') {
      return msg;
    }
  }
  return 'Unknown error';
}

class MarkupParser extends BaseManager {
  /** Handler registry for syntax handlers */
  handlerRegistry: HandlerRegistry;

  /** Content filter chain */
  filterChain: FilterChain | null;

  /** Parse result cache */
  cache: RegionCache | null;

  /** Caching strategies by content type */
  cacheStrategies: Record<string, RegionCache>;

  /** Performance monitoring state */
  performanceMonitor: PerformanceMonitor | null;

  /** Parser performance metrics */
  metrics: ParserMetrics;

  /** DOM-based parser for JSPWiki syntax */
  domParser: WikiDOMParser;

  /** Variable expansion handler */
  domVariableHandler: DOMVariableHandler;

  /** Plugin execution handler */
  domPluginHandler: DOMPluginHandler;

  /** Link resolution handler */
  domLinkHandler: DOMLinkHandler;

  /** Parser configuration - overrides BaseManager's generic config */
  protected declare config: MarkupParserConfig;

  /**
   * Creates a new MarkupParser instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
    this.handlerRegistry = new HandlerRegistry(engine);
    // #1117: the chain is owned by FilterManager; resolved in initialize().
    this.filterChain = null;
    this.cache = null;
    this.cacheStrategies = {};
    this.performanceMonitor = null;
    this.metrics = {
      parseCount: 0,
      totalParseTime: 0,
      errorCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheMetrics: new Map()
    };

    // Initialize DOM-based parser (Phase 2 migration - GitHub Issue #93)
    this.domParser = new WikiDOMParser({
      debug: false,
      throwOnError: false
    });

    // Initialize DOM-based variable handler (Phase 3 migration - GitHub Issue #93)
     
    this.domVariableHandler = new DOMVariableHandler(engine);

    // Initialize DOM-based plugin handler (Phase 4 migration - GitHub Issue #107)
     
    this.domPluginHandler = new DOMPluginHandler(engine);

    // Initialize DOM-based link handler (Phase 5 migration - GitHub Issue #108)
     
    this.domLinkHandler = new DOMLinkHandler(engine);
  }

  /**
   * Initialize the MarkupParser
   */
  async initialize(config: Partial<MarkupParserConfig> = {}): Promise<void> {
    await super.initialize(config);

    // Load configuration from ConfigurationManager
    this.loadConfiguration();

    // Initialize advanced cache integration
    await this.initializeAdvancedCaching();

    // HandlerRegistry uses default configuration
    // (config property is private, no public setter available)

    // Initialize performance monitoring
    this.initializePerformanceMonitoring();

    // #1117: FilterManager owns the chain — registration, built-ins, and the
    // contributed path all live there. The parser only consumes it. Absent
    // manager (or pipeline disabled) → null chain → both process() calls in
    // the pipeline are skipped by their existing guards.
    const filterManager = this.engine.getManager('FilterManager') as
      { getFilterChain?: () => FilterChain | null } | null;
    this.filterChain = filterManager?.getFilterChain?.() ?? null;

    // Initialize DOM handlers
    await this.domVariableHandler.initialize();
    await this.domPluginHandler.initialize();
    await this.domLinkHandler.initialize();

    // Register default handlers
    await this.registerDefaultHandlers();

    logger.debug('✅ MarkupParser initialized with DOM extraction pipeline');
    logger.debug(`⚙️  Configuration loaded: ${this.config.enabled ? 'enabled' : 'disabled'}`);
    logger.debug(`🗄️  Cache strategies: ${Object.keys(this.cacheStrategies).join(', ')}`);
  }

  /**
   * Check if MarkupParser is initialized (required for RenderingManager integration)
   * @returns {boolean} - True if initialized
   */
  isInitialized(): boolean {
    // #1117: the filter chain is no longer required — it belongs to
    // FilterManager, and a parser without one still parses (filtering off).
    return !!(this.initialized && this.config && this.handlerRegistry);
  }

  /**
   * Register default syntax handlers based on configuration
   */
  async registerDefaultHandlers(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // NOTE: EscapedSyntaxHandler and VariableSyntaxHandler removed in favor of DOM-based parsing
    // See Issue #110 - JSPWiki Variable Syntax
    // The DOM parser (Phase 0) handles escaping and variables without regex interference

    // Register JSPWikiPreprocessor (Phase 1) - processes %%.../%% blocks and tables BEFORE markdown
    const jspwikiPreprocessor = new JSPWikiPreprocessor(this.engine);

    try {
      await this.registerHandler(jspwikiPreprocessor);
      logger.debug('📋 JSPWikiPreprocessor registered successfully (Phase 1)');
    } catch (error) {
      logger.warn('⚠️  Failed to register JSPWikiPreprocessor:', getErrorMessage(error));
    }

    // Register PluginSyntaxHandler if enabled
    if (this.config.handlers.plugin.enabled) {
      const pluginHandler = new PluginSyntaxHandler(this.engine);
      pluginHandler.priority = this.config.handlers.plugin.priority;

      try {
        await this.registerHandler(pluginHandler);
        logger.debug(`🔌 PluginSyntaxHandler registered (priority: ${pluginHandler.priority})`);
      } catch (error) {
        logger.warn('⚠️  Failed to register PluginSyntaxHandler:', getErrorMessage(error));
      }
    }

    // Register WikiTagHandler if enabled
    if (this.config.handlers.wikitag.enabled) {
      const wikiTagHandler = new WikiTagHandler(this.engine);
      wikiTagHandler.priority = this.config.handlers.wikitag.priority;

      try {
        await this.registerHandler(wikiTagHandler);
        logger.debug(`🏷️  WikiTagHandler registered (priority: ${wikiTagHandler.priority})`);
      } catch (error) {
        logger.warn('⚠️  Failed to register WikiTagHandler:', getErrorMessage(error));
      }
    }

    // Register WikiFormHandler if enabled
    if (this.config.handlers.form.enabled) {
      const wikiFormHandler = new WikiFormHandler(this.engine);
      wikiFormHandler.priority = this.config.handlers.form.priority;

      try {
        await this.registerHandler(wikiFormHandler);
        logger.debug(`📝 WikiFormHandler registered (priority: ${wikiFormHandler.priority})`);
      } catch (error) {
        logger.warn('⚠️  Failed to register WikiFormHandler:', getErrorMessage(error));
      }
    }

    // InterWikiLinkHandler is now replaced by unified LinkParserHandler
    // Registration moved to after WikiStyleHandler for optimal priority

    // AttachmentHandler was retired (#1231). Every `[{ATTACH …}]` form is
    // extracted into a placeholder by JSPWikiPreprocessor (95) before Phase
    // 2.6 reaches a handler at 75, and AttachPlugin (#274) renders all of
    // them — the handler's permission check and thumbnail write path were
    // unreachable, which is how they hid a fabricated principal (#1181).

    // WikiStyleHandler and WikiTableHandler are DEPRECATED
    // Replaced by JSPWikiPreprocessor which runs in Phase 1 (before markdown)
    // This ensures table headers stay together and aren't wrapped in <p> tags
    //
    // Old registration code kept for reference (disabled):
    // if (this.config.handlers.style.enabled) {
    //   const WikiStyleHandler = require('./handlers/WikiStyleHandler');
    //   const styleHandler = new WikiStyleHandler(this.engine);
    //   await this.registerHandler(styleHandler);
    // }
    // const WikiTableHandler = require('./handlers/WikiTableHandler');
    // const tableHandler = new WikiTableHandler(this.engine);
    // await this.registerHandler(tableHandler);

    // Register LinkParserHandler (unified link processing replacing WikiLinkHandler + InterWikiLinkHandler)
    const linkParserHandler = new LinkParserHandler(this.engine);

    try {
      await this.registerHandler(linkParserHandler);
      logger.debug('🔗 LinkParserHandler registered successfully (unified link processing for all link types)');
    } catch (error) {
      logger.warn('⚠️  Failed to register LinkParserHandler - CRITICAL ISSUE:', getErrorMessage(error));
    }

    const handlerCount = this.getHandlers().length;
    logger.debug(`🎯 Registered ${handlerCount} syntax handlers total`);
    
    if (handlerCount > 0) {
      const handlerNames = this.getHandlers().map(h => (h as { handlerId: string }).handlerId).join(', ');
      logger.debug(`📋 Active handlers: ${handlerNames}`);
    }
  }

  /**
   * Load configuration from ConfigurationManager
   */
  loadConfiguration(): void {
    const configManager = this.engine.getManager<ConfigurationManagerInterface>('ConfigurationManager');
    
    // Default configuration
    this.config = {
      enabled: true,
      caching: true,
      cacheTTL: 300,
      handlerRegistry: {
        maxHandlers: 100,
        allowDuplicatePriorities: true,
        enableDependencyResolution: true,
        enableConflictDetection: true,
        defaultTimeout: 5000
      },
      handlers: {
        plugin: { enabled: true, priority: 90 },
        wikitag: { enabled: true, priority: 95 },
        form: { enabled: true, priority: 85 },
        interwiki: { enabled: true, priority: 80 },
        style: { enabled: true, priority: 70 },
        wikilink: { enabled: true, priority: 50 }, // ESSENTIAL for basic functionality
        search: { enabled: true, priority: 65 },
        rss: { enabled: true, priority: 60 }
      },
      // #1117: filter configuration moved to FilterManager with the chain.
      cache: {
        parseResults: { enabled: true, ttl: 300, maxSize: 1000 },
        handlerResults: { enabled: true, ttl: 600, maxSize: 2000 },
        patterns: { enabled: true, ttl: 3600, maxSize: 100 },
        variables: { enabled: true, ttl: 900, maxSize: 500 },
        enableWarmup: true,
        metricsEnabled: true
      },
      performance: {
        monitoring: true,
        alertThresholds: {
          parseTime: 100, // ms
          cacheHitRatio: 0.2, // 20%
          errorRate: 0.05, // 5%
          minCacheSamples: 50 // Minimum cache operations before alerting
        }
      },
      emoji: { enabled: true }
    };

    // Load from configuration manager if available
    if (configManager) {
      try {
        this.config.enabled = configManager.getProperty('ngdpbase.markup.enabled', this.config.enabled);
        this.config.caching = configManager.getProperty('ngdpbase.markup.caching', this.config.caching);
        this.config.cacheTTL = configManager.getProperty('ngdpbase.markup.cache-ttl', this.config.cacheTTL);
        // Propagate global cache-ttl as default for all strategy TTLs;
        // strategy-specific keys (read below) will override per-strategy.
        this.config.cache.parseResults.ttl = this.config.cacheTTL;
        this.config.cache.handlerResults.ttl = this.config.cacheTTL;
        this.config.cache.patterns.ttl = this.config.cacheTTL;
        this.config.cache.variables.ttl = this.config.cacheTTL;

        // Handler registry configuration
        this.config.handlerRegistry.maxHandlers = configManager.getProperty('ngdpbase.markup.handler-registry.max-handlers', this.config.handlerRegistry.maxHandlers);
        this.config.handlerRegistry.allowDuplicatePriorities = configManager.getProperty('ngdpbase.markup.handler-registry.allow-duplicate-priorities', this.config.handlerRegistry.allowDuplicatePriorities);
        this.config.handlerRegistry.enableDependencyResolution = configManager.getProperty('ngdpbase.markup.handler-registry.enable-dependency-resolution', this.config.handlerRegistry.enableDependencyResolution);
        this.config.handlerRegistry.enableConflictDetection = configManager.getProperty('ngdpbase.markup.handler-registry.enable-conflict-detection', this.config.handlerRegistry.enableConflictDetection);
        this.config.handlerRegistry.defaultTimeout = configManager.getProperty('ngdpbase.markup.handler-registry.default-timeout', this.config.handlerRegistry.defaultTimeout);
        
        // Individual handler configuration
        for (const handlerName of Object.keys(this.config.handlers)) {
          const handler = this.config.handlers[handlerName];
          handler.enabled = configManager.getProperty(`ngdpbase.markup.handlers.${handlerName}.enabled`, handler.enabled);
          handler.priority = configManager.getProperty(`ngdpbase.markup.handlers.${handlerName}.priority`, handler.priority);
        }
        
        // Advanced cache configuration
        this.config.cache.parseResults.enabled = configManager.getProperty('ngdpbase.markup.cache.parse-results.enabled', this.config.cache.parseResults.enabled);
        this.config.cache.parseResults.ttl = configManager.getProperty('ngdpbase.markup.cache.parse-results.ttl', this.config.cache.parseResults.ttl);
        this.config.cache.parseResults.maxSize = configManager.getProperty('ngdpbase.markup.cache.parse-results.max-size', this.config.cache.parseResults.maxSize);
        this.config.cache.handlerResults.enabled = configManager.getProperty('ngdpbase.markup.cache.handler-results.enabled', this.config.cache.handlerResults.enabled);
        this.config.cache.handlerResults.ttl = configManager.getProperty('ngdpbase.markup.cache.handler-results.ttl', this.config.cache.handlerResults.ttl);
        this.config.cache.handlerResults.maxSize = configManager.getProperty('ngdpbase.markup.cache.handler-results.max-size', this.config.cache.handlerResults.maxSize);
        this.config.cache.patterns.enabled = configManager.getProperty('ngdpbase.markup.cache.patterns.enabled', this.config.cache.patterns.enabled);
        this.config.cache.patterns.ttl = configManager.getProperty('ngdpbase.markup.cache.patterns.ttl', this.config.cache.patterns.ttl);
        this.config.cache.variables.enabled = configManager.getProperty('ngdpbase.markup.cache.variables.enabled', this.config.cache.variables.enabled);
        this.config.cache.variables.ttl = configManager.getProperty('ngdpbase.markup.cache.variables.ttl', this.config.cache.variables.ttl);
        this.config.cache.enableWarmup = configManager.getProperty('ngdpbase.markup.cache.enable-warmup', this.config.cache.enableWarmup);
        this.config.cache.metricsEnabled = configManager.getProperty('ngdpbase.markup.cache.metrics-enabled', this.config.cache.metricsEnabled);
        
        // Performance monitoring configuration
        this.config.performance.monitoring = configManager.getProperty('ngdpbase.markup.performance.monitoring', this.config.performance.monitoring);
        this.config.performance.alertThresholds.parseTime = configManager.getProperty('ngdpbase.markup.performance.alert-thresholds.parse-time', this.config.performance.alertThresholds.parseTime);
        this.config.performance.alertThresholds.cacheHitRatio = configManager.getProperty('ngdpbase.markup.performance.alert-thresholds.cache-hit-ratio', this.config.performance.alertThresholds.cacheHitRatio);
        this.config.performance.alertThresholds.errorRate = configManager.getProperty('ngdpbase.markup.performance.alert-thresholds.error-rate', this.config.performance.alertThresholds.errorRate);
        this.config.performance.alertThresholds.minCacheSamples = configManager.getProperty('ngdpbase.markup.performance.alert-thresholds.min-cache-samples', this.config.performance.alertThresholds.minCacheSamples);

        // Emoji shortcode conversion
        this.config.emoji = { enabled: configManager.getProperty('ngdpbase.markup.emoji.enabled', true) };

      } catch (err) {
        logger.warn('⚠️  Failed to load MarkupParser config from ConfigurationManager, using defaults:', getErrorMessage(err));
      }
    }
  }

  /**
   * Configure handler registry with loaded configuration
   * NOTE: Removed - HandlerRegistry.config is private, no public setter available.
   * HandlerRegistry uses default configuration which is sufficient.
   */
  // configureHandlerRegistry() {
  //   // Apply configuration to handler registry
  //   this.handlerRegistry.config = {
  //     ...this.handlerRegistry.config,
  //     ...this.config.handlerRegistry
  //   };
  // }

  /**
   * Initialize advanced caching integration with multiple cache strategies
   */
  async initializeAdvancedCaching(): Promise<void> {
    if (!this.config.caching) {
      logger.debug('🗄️  MarkupParser caching disabled by configuration');
      return;
    }
    
    const cacheManager = this.engine.getManager<CacheManagerInterface>('CacheManager');
    if (!cacheManager || !cacheManager.isInitialized()) {
      logger.warn('⚠️  CacheManager not available, parsing will not be cached');
      return;
    }

    // Initialize multiple cache strategies
    this.cacheStrategies = {};

    // Parse Results Cache - Full content parsing results
    if (this.config.cache.parseResults.enabled) {
      this.cacheStrategies.parseResults = cacheManager.region('MarkupParser-ParseResults');
      this.metrics.cacheMetrics.set('parseResults', { hits: 0, misses: 0, sets: 0 });
    }

    // Handler Results Cache - Individual handler outputs
    if (this.config.cache.handlerResults.enabled) {
      this.cacheStrategies.handlerResults = cacheManager.region('MarkupParser-HandlerResults');
      this.metrics.cacheMetrics.set('handlerResults', { hits: 0, misses: 0, sets: 0 });
    }

    // Pattern Compilation Cache - Pre-compiled regex patterns
    if (this.config.cache.patterns.enabled) {
      this.cacheStrategies.patterns = cacheManager.region('MarkupParser-Patterns');
      this.metrics.cacheMetrics.set('patterns', { hits: 0, misses: 0, sets: 0 });
    }

    // Variable Resolution Cache - System variable lookups
    if (this.config.cache.variables.enabled) {
      this.cacheStrategies.variables = cacheManager.region('MarkupParser-Variables');
      this.metrics.cacheMetrics.set('variables', { hits: 0, misses: 0, sets: 0 });
    }

    // Set legacy cache reference for backward compatibility
    this.cache = this.cacheStrategies.parseResults || null;

    const strategiesCount = Object.keys(this.cacheStrategies).length;
    logger.debug(`🗄️  MarkupParser advanced caching initialized with ${strategiesCount} strategies`);
    logger.debug(`📊 Cache TTLs: parse=${this.config.cache.parseResults.ttl}s, handlers=${this.config.cache.handlerResults.ttl}s, patterns=${this.config.cache.patterns.ttl}s`);

    // Perform cache warmup if enabled
    if (this.config.cache.enableWarmup) {
      await this.performCacheWarmup();
    }
  }

  /**
   * Initialize performance monitoring system
   */
  initializePerformanceMonitoring(): void {
    if (!this.config.performance.monitoring) {
      return;
    }

    this.performanceMonitor = {
      alerts: [],
      lastCheck: Date.now(),
      checkInterval: 60000, // 1 minute
      
      // Performance tracking
      recentParseTimes: [],
      recentErrorRates: [],
      maxRecentEntries: 100
    };

    logger.debug('📊 Performance monitoring initialized with alert thresholds:', this.config.performance.alertThresholds);
  }

  /**
   * Perform cache warmup for frequently accessed content
   */
  async performCacheWarmup(): Promise<void> {
    logger.debug('🔥 Starting MarkupParser cache warmup...');
    
    try {
      // Warm up common patterns
      const commonPatterns = [
        /\[\{(\w+)\s*([^}]*)\}\]/g, // Plugin syntax
        /\$\{(\w+)\}/g, // Variable syntax
        /\[\w+:\w+\]/g, // InterWiki syntax
        /<wiki:(\w+)/g // WikiTag syntax
      ];

      for (const pattern of commonPatterns) {
        if (this.cacheStrategies.patterns) {
          const cacheKey = `pattern:${pattern.source}`;
          await this.cacheStrategies.patterns.set(cacheKey, pattern, { ttl: this.config.cache.patterns.ttl });
        }
      }

      // Warm up common variables
      const commonVariables = ['pagename', 'username', 'applicationname', 'version', 'totalpages'];
      if (this.cacheStrategies.variables) {
        const variableManager = this.engine.getManager<VariableManagerInterface>('VariableManager');
        if (variableManager) {
          for (const varName of commonVariables) {
            try {
              const cacheKey = `var:${varName}:default`;
              const value = await this.resolveSystemVariable(varName, {});
              await this.cacheStrategies.variables.set(cacheKey, value, { ttl: this.config.cache.variables.ttl });
            } catch {
              // Skip variables that can't be resolved without context
            }
          }
        }
      }

      logger.debug('🔥 Cache warmup completed');
      
    } catch (error) {
      logger.warn('⚠️  Cache warmup failed:', getErrorMessage(error));
    }
  }

  /**
   * Resolve system variable for cache warmup
   * @param varName - Variable name
   * @param context - Context object
   * @returns Variable value
   */
  async resolveSystemVariable(varName: string, context: Record<string, unknown>): Promise<string> {
    const variableManager = this.engine.getManager<VariableManagerInterface>('VariableManager');
    if (!variableManager) {
      throw new Error('VariableManager not available');
    }

    // Create minimal context for system variables
    const minimalContext = {
      pageName: 'warmup',
      userName: 'system',
      ...context
    };

    return variableManager.expandVariables(`\${${varName}}`, minimalContext);
  }

  /**
   * Main parsing method - uses WikiDocument DOM extraction pipeline
   * @param content - Raw content to parse
   * @param context - Parsing context (page, user, etc.)
   * @returns Processed HTML content
   */
  async parse(content: string, context: Record<string, unknown> = {}): Promise<string> {
    if (!content) {
      return '';
    }

    // Check if MarkupParser is enabled
    if (!this.config.enabled) {
      logger.debug('🔧 MarkupParser disabled, falling back to basic rendering');
      // Fall back to basic markdown conversion
      const renderingManager = this.engine.getManager<RenderingManagerInterface>('RenderingManager');
      if (renderingManager && renderingManager.converter) {
        // Guarded like every other makeHtml entry point (#1000). A degraded
        // path is still reachable with attacker-supplied content — POST
        // /api/preview renders an arbitrary request body — so "this only runs
        // when the parser is disabled" is not a reason to skip the guard.
        return renderingManager.converter.makeHtml(guardShowdownInput(content));
      }
      return content;
    }

    const startTime = Date.now();
    this.metrics.parseCount++;

    try {
      logger.debug('🔄 Using WikiDocument DOM extraction pipeline');

      // Check cache first
      const cacheKey = this.generateCacheKey(content, context);
      if (this.cacheStrategies.parseResults) {
        const cached = await this.getCachedParseResult(cacheKey);
        if (cached) {
          this.updateCacheMetrics('parseResults', 'hit');
          this.metrics.cacheHits++;
          this.updatePerformanceMetrics(Date.now() - startTime, true);
          logger.debug(`✅ Cache hit for extraction pipeline (${Date.now() - startTime}ms)`);
          return cached;
        }
        this.updateCacheMetrics('parseResults', 'miss');
        this.metrics.cacheMisses++;
      }

      // Expand ${pagename} / ${username} context variables before DOM extraction.
      // These are template-style variables (not JSPWiki [{$var}] syntax) that are
      // replaced with values from the parse context. Code blocks are protected by
      // the extraction pipeline; variables in code blocks will not be expanded.
      //
      // Context may arrive nested (view path: { pageContext: { pageName, ... }, engine })
      // or flat (preview path: { pageName, userName, ... }). Normalize before reading.
      const pageCtxData = ((context.pageContext ?? context) as Record<string, unknown>);
      const resolvedPageName = (pageCtxData.pageName ?? context.pageName) as string | undefined;
      const resolvedUserCtx = (pageCtxData.userContext ?? context.userContext) as Record<string, unknown> | undefined;
      const resolvedUserName = (resolvedUserCtx?.username ?? resolvedUserCtx?.userName ?? pageCtxData.userName ?? context.userName) as string | undefined;
      if (resolvedPageName !== undefined) {
        content = content.replace(/\$\{pagename\}/gi, String(resolvedPageName));
        // ${pageslug} — the current page's slug (keyword/URL form). Bridges the
        // name-vs-slug gap: keywords follow slug convention ("2026-trip-west")
        // while ${pagename} yields the display name ("2026 trip west"), so
        // self-scoping plugins like [{Search user-keywords='${pageslug}'}] and
        // [{MediaPlugin keyword='${pageslug}'}] match. Authoritative (stored
        // slug) with generateSlug fallback; only looked up when the token is
        // actually present (hot path).
        if (/\$\{pageslug\}/i.test(content)) {
          let slug = '';
          try {
            const pm = this.engine.getManager<{ getPageMetadata?: (id: string) => Promise<{ slug?: string } | null> }>('PageManager');
            const meta = pm?.getPageMetadata ? await pm.getPageMetadata(String(resolvedPageName)) : null;
            if (meta?.slug) slug = meta.slug;
          } catch { /* fall through to derived slug */ }
          if (!slug) {
            const vm = this.engine.getManager<{ generateSlug?: (t: string) => string }>('ValidationManager');
            slug = vm?.generateSlug
              ? vm.generateSlug(String(resolvedPageName))
              : String(resolvedPageName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
          }
          content = content.replace(/\$\{pageslug\}/gi, slug);
        }
      }
      if (resolvedUserName !== undefined) {
        content = content.replace(/\$\{username\}/gi, String(resolvedUserName));
      }

      // Parse using extraction pipeline
      const result = await this.parseWithDOMExtraction(content, context);

      // Cache the result
      await this.cacheParseResult(cacheKey, result);

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.metrics.totalParseTime += processingTime;
      this.updatePerformanceMetrics(processingTime, false);

      logger.debug(`✅ Extraction pipeline completed (${processingTime}ms)`);

      // Warn if parse time is slow
      if (processingTime > 100) {
        const slowPageCtx = ((context.pageContext ?? context) as Record<string, unknown>);
        const rawPageName = slowPageCtx.pageName ?? context.pageName;
        const slowPageName = typeof rawPageName === 'string' ? rawPageName : 'unknown';
        logger.warn(`⚠️  Slow parse: ${processingTime}ms for page ${slowPageName}`);
      }

      return result;

    } catch (error) {
      logger.error('❌ Extraction pipeline error:', error);
      this.metrics.errorCount++;

      // Return original content on critical failure
      return content;
    }
  }

  /**
   * Register a syntax handler
   * @param handler - Handler instance
   * @param options - Registration options
   * @returns True if registration successful
   */
  async registerHandler(handler: BaseSyntaxHandler, options: Record<string, unknown> = {}): Promise<boolean> {
    // Check if handler type is enabled in configuration
    const handlerType = this.getHandlerTypeFromId(handler.handlerId);
    if (handlerType && this.config.handlers[handlerType] && !this.config.handlers[handlerType].enabled) {
      logger.debug(`🔧 Handler ${handler.handlerId} disabled by configuration, skipping registration`);
      return false;
    }
    
    return await this.handlerRegistry.registerHandler(handler, options);
  }

  /**
   * Get handler type from handler ID for configuration lookup (modular mapping)
   * @param handlerId - Handler ID
   * @returns Handler type or null
   */
  getHandlerTypeFromId(handlerId: string): string | null {
    const typeMap: Record<string, string> = {
      // Phase 2 handlers
      'PluginSyntaxHandler': 'plugin',
      'WikiTagHandler': 'wikitag',
      'WikiFormHandler': 'form',

      // Phase 3 handlers (advanced) — AttachmentHandler retired (#1231)
      'WikiStyleHandler': 'style',
      'LinkParserHandler': 'linkparser', // Unified handler replacing both WikiLinkHandler and InterWikiLinkHandler
      'SearchPluginHandler': 'search',
      'RSSHandler': 'rss',
      
      // Future Phase 4 handlers (filters)
      'SpamFilterHandler': 'filter-spam',
      'SecurityFilterHandler': 'filter-security',
      'ValidationFilterHandler': 'filter-validation'
    };
    
    return typeMap[handlerId] || null;
  }

  /**
   * Get configuration for a specific handler type
   * @param handlerType - Handler type (plugin, wikitag, etc.)
   * @returns Handler configuration
   */
  getHandlerConfig(handlerType: string): HandlerConfig {
    return this.config.handlers[handlerType] || { enabled: true, priority: 100 };
  }

  /**
   * Unregister a syntax handler
   * @param handlerId - Handler identifier
   * @returns True if unregistration successful
   */
  async unregisterHandler(handlerId: string): Promise<boolean> {
    return await this.handlerRegistry.unregisterHandler(handlerId);
  }

  /**
   * Get handler by ID
   * @param handlerId - Handler identifier
   * @returns Handler or null if not found
   */
  getHandler(handlerId: string): unknown {
    return this.handlerRegistry.getHandler(handlerId);
  }

  /**
   * Get all handlers sorted by priority
   * @param enabledOnly - Only return enabled handlers
   * @returns Handlers sorted by priority
   */
  getHandlers(enabledOnly = true): unknown[] {
    return this.handlerRegistry.getHandlersByPriority(enabledOnly);
  }

  /**
   * Get the FilterChain (#596), which FilterManager owns (#1117).
   *
   * A delegating view kept for existing callers (the admin stats route,
   * legacy save-path lookups). New code should ask FilterManager directly.
   * Returns null when the pipeline is disabled or the manager is absent —
   * callers should treat a null chain as "validation skipped, proceed".
   *
   * @returns The FilterChain instance, or null
   */
  getFilterChain(): FilterChain | null {
    return this.filterChain;
  }

  /**
   * Enable handler by ID
   * @param handlerId - Handler identifier
   * @returns True if successful
   */
  enableHandler(handlerId: string): boolean {
    return this.handlerRegistry.enableHandler(handlerId);
  }

  /**
   * Disable handler by ID
   * @param handlerId - Handler identifier
   * @returns True if successful
   */
  disableHandler(handlerId: string): boolean {
    return this.handlerRegistry.disableHandler(handlerId);
  }

  /**
   * Generate cache key for content and context
   * @param content - Content to cache
   * @param context - Parse context
   * @returns Cache key
   */
  /**
   * #907: sanitize a raw inline-CSS declaration string against the security
   * config. Returns validated `prop: val; …` (empty when disabled or nothing
   * passes). Shared by the DOM inline-style node builder.
   *
   * Gate: `ngdpbase.style.security.allow-inline-css`. Each property must be in
   * `ngdpbase.style.security.allowed-properties`; values with `javascript:`,
   * `url(`, `expression(`, or angle brackets are dropped.
   */
  private sanitizeInlineCss(cssRaw: string): string {
    const cfg = this.engine.getManager<ConfigurationManagerInterface>('ConfigurationManager');
    const allow = cfg ? cfg.getProperty('ngdpbase.style.security.allow-inline-css', false) : false;
    if (!allow) return '';
    const allowedProps = new Set(
      String(cfg?.getProperty('ngdpbase.style.security.allowed-properties', 'color,background-color,font-weight,font-style,text-align') ?? '')
        .split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
    );
    const unsafe = /javascript:|url\(|expression\(|[<>]/i;
    return cssRaw.split(';')
      .map(d => d.trim())
      .filter(Boolean)
      .map(d => {
        const idx = d.indexOf(':');
        if (idx < 0) return null;
        const prop = d.slice(0, idx).trim().toLowerCase();
        const val = d.slice(idx + 1).trim();
        if (!prop || !val || !allowedProps.has(prop) || unsafe.test(val)) return null;
        return `${prop}: ${val}`;
      })
      .filter((d): d is string => d !== null)
      .join('; ');
  }

  /**
   * #907: build a DOM node for an inline JSPWiki style — the unified path that
   * replaced the Step 0.55 string replacements. `variant` selects the wrapper
   * (`css` → `<span style>`, `sup` → `<sup>`, `sub` → `<sub>`, `strike` →
   * `<del>`); `inner` is resolved for wiki syntax via appendWikiNodes (parity
   * with block styles). For `css` with inline CSS disabled or no safe
   * declarations, the wrapper degrades to a plain `<span>` (content preserved,
   * never leaked as literal markup). Used by BOTH the top-level extraction
   * resolver and the cell/block scanner (appendWikiNodes).
   */
  private async buildInlineStyleNode(
    variant: 'css' | 'sup' | 'sub' | 'strike' | 'class',
    cssRaw: string,
    inner: string,
    context: ParseContext | undefined,
    wikiDocument: WikiDocument,
    idStart: number,
    outerId?: number,
    classNames?: string
  ): Promise<ReturnType<typeof WikiDocument.prototype.createElement>> {
    const attrs: Record<string, string> = {};
    if (outerId !== undefined) attrs['data-jspwiki-id'] = outerId.toString();
    let tag: string;
    if (variant === 'sup') tag = 'sup';
    else if (variant === 'sub') tag = 'sub';
    else if (variant === 'strike') tag = 'del';
    else if (variant === 'class') {
      // #938: class names are already constrained to [A-Za-z][\w-]* runs by the
      // extraction regex, so there is nothing injectable to escape here.
      tag = 'span';
      if (classNames) attrs['class'] = classNames;
    }
    else {
      tag = 'span';
      const style = this.sanitizeInlineCss(cssRaw);
      if (style) attrs['style'] = style;
    }
    const el = wikiDocument.createElement(tag, attrs);
    await this.appendWikiNodes(inner, el, context, wikiDocument, idStart);
    return el;
  }

  generateCacheKey(content: string, context: ParseContextData): string {
    const contentHash = crypto.createHash('md5').update(content).digest('hex');

    // Context may arrive nested ({ pageContext: { pageName, requestInfo } }) or flat.
    // Handle both so the cache key is correct regardless of call site.
    const pageCtx = (context.pageContext ?? context) as Record<string, unknown>;
    const requestInfo = (pageCtx.requestInfo ?? context.requestInfo) as Record<string, unknown> | undefined;
    // Include query-string params so paginated pages (?page=2) get distinct cache entries
    const query = (requestInfo?.['query'] ?? {}) as Record<string, unknown>;

    // Include user preferences that affect rendering ({$date}, {$time}, {$timestamp})
    const userCtx = (pageCtx.userContext ?? context.userContext) as Record<string, unknown> | undefined;
    const prefs = userCtx?.['preferences'] as Record<string, unknown> | undefined;

    const contextHash = crypto.createHash('md5')
      .update(JSON.stringify({
        pageName: pageCtx.pageName ?? context.pageName,
        userName: pageCtx.userName ?? context.userName,
        query,
        // Preferences affecting date/time variable rendering (#341)
        userLocale: (prefs?.['locale'] ?? userCtx?.['locale']),
        userTimezone: (prefs?.['timezone'] ?? userCtx?.['timezone']),
        userDateFormat: prefs?.['dateFormat'],
        userTimeFormat: prefs?.['timeFormat'],
        // My Links pinned pages affect LeftMenu rendering (#537)
        navPinnedPages: prefs?.['nav.pinnedPages'],
        timestamp: Math.floor(Date.now() / 300000) // 5-minute buckets
      }))
      .digest('hex');

    return `parse:${contentHash}:${contextHash}`;
  }

  /**
   * Extract style blocks using state-stack parsing for proper nesting support
   *
   * Uses JSPWiki-style state tracking:
   * - When %%class-name found: push to stack with accumulated classes from parents
   * - When /% found: pop from stack, create element with all accumulated classes
   *
   * @param content - Content to extract style blocks from
   * @param elements - Array to push extracted elements into
   * @param uuid - UUID for placeholders
   * @param startId - Starting ID for elements
   * @returns Object with processed content and next available ID
   */
  private extractStyleBlocksWithStack(
    content: string,
    elements: ExtractedElement[],
    uuid: string,
    startId: number
  ): { content: string; nextId: number } {
    const lines = content.split('\n');
    const result: string[] = [];
    const stack: Array<{
      className: string;
      startLine: number;
      contentLines: string[];
      accumulatedClasses: string[];
      /** #907: raw CSS for a block-form `%%(css)` opener (vs a class opener). */
      cssRaw?: string;
    }> = [];

    let id = startId;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Check for style block opening: %%class-name (on its own line).
      // Multiple space-separated classes are allowed (e.g. %%btn btn-sm) —
      // they all land on the one wrapper element, matching how CSS utility
      // frameworks compose.
      const openMatch = line.match(/^\s*%%([a-zA-Z0-9_-]+(?:[ \t]+[a-zA-Z0-9_-]+)*)[ \t]*$/);
      if (openMatch) {
        const className = openMatch[1].replace(/[ \t]+/g, ' ');
        // Calculate accumulated classes from parent blocks
        const parentClasses = stack.map(s => s.className).filter(Boolean);
        stack.push({
          className,
          startLine: i,
          contentLines: [],
          accumulatedClasses: [...parentClasses, className]
        });
        i++;
        continue;
      }

      // #907: block-form inline CSS opener — `%%(prop:val; …)` on its own line
      // wrapping following block content (e.g. `%%(font-size:.9;)` around a
      // table). Emits a styled block wrapper, symmetric with the inline form.
      const openCssMatch = line.match(/^\s*%%(\((?:[^()]|\([^()]*\))*\))[ \t]*$/);
      if (openCssMatch) {
        const parentClasses = stack.map(s => s.className).filter(Boolean);
        stack.push({
          className: '',
          startLine: i,
          contentLines: [],
          accumulatedClasses: [...parentClasses],
          cssRaw: openCssMatch[1].slice(1, -1)
        });
        i++;
        continue;
      }

      // Check for style block closing: /% or %% (on its own line)
      // JSPWiki supports both syntaxes for closing style blocks
      if (/^\s*(?:\/%|%%)\s*$/.test(line)) {
        if (stack.length > 0) {
          const block = stack.pop()!;
          const blockContent = block.contentLines.join('\n');

          // Create element with accumulated classes (all parent + this)
          elements.push({
            type: 'style',
            syntax: `%%${block.cssRaw ? `(${block.cssRaw})` : block.className}\n${blockContent}\n/%`,
            className: block.className,
            styleContent: blockContent,
            accumulatedClasses: block.accumulatedClasses,
            cssRaw: block.cssRaw, // #907: block-form inline CSS
            id: id++,
            position: block.startLine
          });

          // Create placeholder
          const placeholder = `<span data-jspwiki-placeholder="${uuid}-${id - 1}"></span>`;

          if (stack.length > 0) {
            // Nested block: add placeholder to parent's content
            stack[stack.length - 1].contentLines.push(placeholder);
          } else {
            // Top-level block: add to result
            result.push(placeholder);
          }
        }
        i++;
        continue;
      }

      // Regular content line
      if (stack.length > 0) {
        // Inside a block: accumulate content
        stack[stack.length - 1].contentLines.push(line);
      } else {
        // Outside any block: pass through
        result.push(line);
      }
      i++;
    }

    // Handle unclosed blocks (error tolerance - output as-is)
    while (stack.length > 0) {
      const block = stack.pop()!;
      // Prepend the opening tag and content to result
      result.unshift(`%%${block.cssRaw ? `(${block.cssRaw})` : block.className}`);
      result.push(...block.contentLines);
    }

    return {
      content: result.join('\n'),
      nextId: id
    };
  }

  /**
   * Extract JSPWiki-specific syntax from content for DOM-based processing
   *
   * This method implements the pre-extraction strategy from Issue #114.
   * Instead of tokenizing both markdown and JSPWiki syntax (which causes conflicts),
   * we extract ONLY JSPWiki syntax and let Showdown handle all markdown.
   *
   * Extraction order:
   * 1. Variables: [{$username}] → __JSPWIKI_uuid_0__
   * 2. Plugins: [{TableOfContents}] → __JSPWIKI_uuid_1__
   * 3. Escaped: [[{$var}] → __JSPWIKI_uuid_2__ (stores literal [{$var}])
   * 4. Wiki links: [PageName] → __JSPWIKI_uuid_3__ (but not markdown [text](url))
   *
   * Code blocks are already protected by Phase 1 preprocessing, so JSPWiki syntax
   * inside code blocks won't be extracted.
   *
   * @param {string} content - Raw wiki content
   * @param {ParseContext} context - Parse context (for code block protection)
   * @returns {Object} - { sanitized, jspwikiElements, uuid }
   *
   * Related: #114 (WikiDocument DOM Solution), #115 (Phase 1 Implementation)
   *
   * @example
   * const input = "## Heading\n\nUser: [{$username}]";
   * const { sanitized, jspwikiElements, uuid } = parser.extractJSPWikiSyntax(input);
   * // sanitized: "## Heading\n\nUser: <span data-jspwiki-placeholder="abc123-0"></span>"
   * // jspwikiElements: [{ type: 'variable', varName: '$username', id: 0, ... }]
   * // uuid: "abc123"
   */
  extractJSPWikiSyntax(content: string, _context: Record<string, unknown> = {}): { sanitized: string; jspwikiElements: ExtractedElement[]; uuid: string } {
    const jspwikiElements: ExtractedElement[] = [];
    const uuid = crypto.randomUUID().substring(0, 8);
    let sanitized = content;
    let id = 0;

    // IMPORTANT: Extraction order matters!

    // Step 0: Extract code blocks as DOM nodes so their content is never re-parsed.
    // Both fenced code blocks and inline code spans are extracted here.
    // Using DOM nodes (textContent setter) is the only safe guarantee — restoring
    // raw content back into the text pipeline (the old __CODEBLOCK_N__ approach)
    // allowed PluginSyntaxHandler (Phase 2.6) to execute plugins inside code blocks.

    // Fenced code blocks — line-scanner instead of regex.
    // The regex approach failed on CRLF line endings (view path reads pages from disk
    // with \r\n; preview path receives \n-normalized text from the browser editor).
    // The scanner normalises line endings, finds opening/closing ``` fences reliably,
    // and pushes each block directly into the WikiDocument node pipeline as literal text.
    {
      const inputLines = sanitized.split(/\r?\n/);
      const outputLines: string[] = [];
      let li = 0;
      while (li < inputLines.length) {
        const fenceOpen = inputLines[li].match(/^(`{3,})(\S*)\s*$/);
        if (fenceOpen) {
          const fence = fenceOpen[1]; // the actual backtick sequence (``` or longer)
          const lang = fenceOpen[2] || '';
          const contentLines: string[] = [];
          const startLine = li;
          li++;
          // Collect lines until matching closing fence (same length, no language tag)
          while (li < inputLines.length && !new RegExp(`^${fence}\\s*$`).test(inputLines[li])) {
            contentLines.push(inputLines[li]);
            li++;
          }
          if (li < inputLines.length) li++; // skip closing fence line
          const codeContent = contentLines.join('\n') + (contentLines.length > 0 ? '\n' : '');
          const syntax = `${fence}${lang}\n${codeContent}${fence}`;
          jspwikiElements.push({
            type: 'fenced-code',
            syntax,
            codeLanguage: lang,
            codeContent,
            id: id++,
            position: startLine
          });
          outputLines.push(`<span data-jspwiki-placeholder="${uuid}-${id - 1}"></span>`);
        } else {
          outputLines.push(inputLines[li]);
          li++;
        }
      }
      sanitized = outputLines.join('\n');
    }

    // #940/#944: mask `%` inside inline code spans before ANY style extraction.
    //
    // A style run must never close on a `/%` that belongs to a code span. On
    // docs/haddock-styles this line:
    //
    //   you can use %%tip-predefinedStyles Use the `%~%style../%` markup.
    //
    // let the run swallow into the backticks and close on the `/%` *inside*
    // them. That tore the code span apart; the orphaned backtick then paired
    // with a later one, forming a <code> spanning lines, and every subsequent
    // extraction landed in that broken context — 81 unrestored placeholders
    // across the page, none of which reproduced when any single line was
    // rendered alone.
    //
    // Masking rather than extracting: code spans cannot be pulled out here,
    // because the block-style extractor below must still see raw backtick
    // pairs (table-cell content is resolved by appendWikiNodes, which needs
    // them intact). Substituting a same-length sentinel for `%` preserves
    // every offset while making the span invisible to the style patterns.
    // Restored immediately after block extraction, before backtick handling.
    //
    // Written as an escape, never as a literal NUL byte in this file: a raw NUL
    // makes grep treat MarkupParser.ts as binary and silently suppress matches.
    const CODE_PCT = '\u0000';
    sanitized = sanitized.replace(/`[^`\n]*`/g, (span) => span.replace(/%/g, CODE_PCT));

    // #907: inline styles %%(css)…/%, %%sup…/%, %%sub…/%, %%strike…/% become
    // typed `inline-style` elements resolved to DOM nodes (no more Step 0.55
    // string passes). Innermost-first loop so nesting resolves bottom-up: the
    // inner match's placeholder contains no %% or /%, so the outer matches next
    // round. Content that reaches here without a close is left untouched.
    //
    // MUST run BEFORE the block-style stack extractor: inline `%%… /%` runs
    // (e.g. per-row colour swatches inside a table) each carry their own `/%`,
    // which would otherwise be mis-paired as the closing of an enclosing
    // `%%class` block. Replacing them with placeholders first leaves the block
    // extractor a clean open/close structure.
    {
      // Paren body allows one level of nested parens so functional CSS values
      // (`url(x)`, `rgb(…)`) don't truncate extraction — they're still security-
      // stripped at node build, but the whole style extracts and safe
      // declarations survive rather than the run rendering as literal text.
      // Close syntax: `/%` or `%%` (both valid JSPWiki closers, #592). The `%%`
      // closer must NOT be another opener (`%%(`, `%%sup/sub/strike`) — that
      // disambiguation lets a nested run's inner style match first (its content
      // has no opener/closer), so nesting resolves bottom-up.
      // The `%%` closer must not itself be an opener. #938 widened what counts
      // as an opener to include bare class names, so the lookahead has to
      // exclude `%%class ` too — otherwise `%%a %%b X/%` reads the second `%%`
      // as A's closer and emits an empty `<span class="a">` followed by the
      // rest as stray text.
      const NOT_AN_OPENER = String.raw`(?!\(|sup|sub|strike|[A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)*[ \t])`;
      const inlinePattern = new RegExp(
        String.raw`%%(\((?:[^()]|\([^()]*\))*\)|sup|sub|strike)[ \t]+((?:(?!%%|\/%)[\s\S])*?)[ \t]*(?:\/%|%%${NOT_AN_OPENER})`
      );
      // #938: bare class-name runs — `%%feed-badge feed-badge--green GREEN/%`.
      // Inner content is `[^\n]` (SAME LINE ONLY), unlike the variants above.
      // That restriction is load-bearing, not cosmetic: this extractor runs
      // BEFORE extractStyleBlocksWithStack, so a multi-line inner would let a
      // *block* opener (`%%table-fit` alone on its line) match here and swallow
      // the block's closing `/%`. A block opener's `/%` is always on a later
      // line, so confining the match to one line makes that impossible.
      // No conflict the other way either: the block opener regex is anchored
      // `^\s*%%…$`, so a same-line run was never a block-opener candidate.
      // #944: the class token runs up to the FIRST space — everything after it
      // is content. Multiple classes are DOT-separated (`%%btn.btn-info.btn-xs`),
      // matching JSPWiki and what docs/haddock-styles documents.
      //
      // The original #939 form accepted space-separated classes inline
      // (`[A-Za-z][\w-]*(?:[ \t]+[A-Za-z][\w-]*)*`) and silently ate the
      // content: `%%lead Hello there/%` produced `class="lead Hello"` with only
      // "there" as the body, and `%%lead one two three four/%` swallowed three
      // words. Inline, space-separation is inherently ambiguous — nothing marks
      // where the class list ends and the content begins. Block form keeps
      // spaces because there the class list IS the whole line.
      const inlineClassPattern = new RegExp(
        String.raw`%%([A-Za-z][\w-]*(?:\.[A-Za-z][\w-]*)*)[ \t]+((?:(?!%%|\/%)[^\n])*?)[ \t]*(?:\/%|%%${NOT_AN_OPENER})`
      );
      let guard = 0;
      for (;;) {
        if (guard++ >= 5000) break;
        const mVariant = inlinePattern.exec(sanitized);
        const mClass = inlineClassPattern.exec(sanitized);
        // Earliest match wins. Nesting still resolves bottom-up regardless of
        // which pattern hits: both forbid `%%`/`/%` inside their inner group,
        // so only an innermost run can match on any given round.
        let m: RegExpExecArray;
        let isClass: boolean;
        if (mVariant && mClass) {
          isClass = mClass.index < mVariant.index;
          m = isClass ? mClass : mVariant;
        } else if (mClass) {
          isClass = true;
          m = mClass;
        } else if (mVariant) {
          isClass = false;
          m = mVariant;
        } else {
          break;
        }
        const head = m[1];
        const inner = m[2] ?? '';
        const isCss = !isClass && head.startsWith('(');
        const variant: 'css' | 'sup' | 'sub' | 'strike' | 'class' = isClass
          ? 'class'
          : (isCss ? 'css' : (head as 'sup' | 'sub' | 'strike'));
        jspwikiElements.push({
          type: 'inline-style',
          syntax: m[0],
          inlineVariant: variant,
          cssRaw: isCss ? head.slice(1, -1) : undefined,
          // #944: `btn.btn-info.btn-xs` -> `class="btn btn-info btn-xs"`.
          classNames: isClass ? head.replace(/\./g, ' ') : undefined,
          inner,
          id: id++,
          position: m.index
        });
        sanitized = sanitized.slice(0, m.index)
          + `<span data-jspwiki-placeholder="${uuid}-${id - 1}"></span>`
          + sanitized.slice(m.index + m[0].length);
      }
    }

    // Step 0.5: Extract JSPWiki style blocks %%class-name ... /%
    // MUST run before inline backtick extraction so that table cell content retains
    // raw backtick pairs — appendWikiNodes resolves them directly to <code> nodes.
    // (If backticks ran first, style block content would contain placeholder spans
    // that populateCell cannot resolve, causing them to render as literal text.)
    const styleResult = this.extractStyleBlocksWithStack(sanitized, jspwikiElements, uuid, id);
    sanitized = styleResult.content;
    id = styleResult.nextId;

    // #940/#944: un-mask the `%` characters hidden inside code spans above.
    // Both style extractors have run, so the sentinel has served its purpose
    // and the literal text must be intact before backtick handling turns these
    // spans into <code>.
    // The sweep must cover the extracted elements too, not just `sanitized`.
    // Both extractors above MOVE text out of `sanitized` into ExtractedElement
    // fields, so a masked `%` that was carried into an element's content would
    // survive every later pass and reach the browser as a raw NUL byte. That is
    // exactly what shipped in the first cut of this fix: the page rendered
    // correctly (0 leaks, all code spans intact) while emitting 40 stray NULs.
    // Un-masking is 1 char -> 1 char, so no recorded offset moves.
    const unmask = (value: string): string => value.split(CODE_PCT).join('%');
    if (sanitized.includes(CODE_PCT)) {
      sanitized = unmask(sanitized);
    }
    for (const element of jspwikiElements) {
      const fields = element as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(fields)) {
        if (typeof value === 'string' && value.includes(CODE_PCT)) {
          fields[key] = unmask(value);
        } else if (Array.isArray(value)) {
          fields[key] = (value as unknown[]).map((item) =>
            typeof item === 'string' && item.includes(CODE_PCT) ? unmask(item) : item
          );
        }
      }
    }

    // Inline code spans — CommonMark variable-length backtick delimiters
    // (#753). A run of N backticks opens; a run of *exactly* N backticks
    // closes. Runs of any other length are content. The previous regex
    // `/`([^`]+)`/g` only handled N=1 and orphaned the leftover backticks
    // when N > 1, which then paired with downstream backticks (often inside
    // later fenced placeholders) and leaked `<span data-jspwiki-placeholder>`
    // tags into the rendered HTML.
    //
    // Runs after style block extraction so backticks inside table cells are
    // handled directly by appendWikiNodes rather than pre-converted to
    // placeholder spans.
    {
      const out: string[] = [];
      let i = 0;
      while (i < sanitized.length) {
        if (sanitized[i] !== '`') {
          out.push(sanitized[i]);
          i++;
          continue;
        }
        // Backtick run starts at i. Measure its length.
        const openStart = i;
        while (i < sanitized.length && sanitized[i] === '`') i++;
        const openLen = i - openStart;
        // Look for a closing run of *exactly* openLen backticks.
        let scan = i;
        let closeStart = -1;
        let closeEnd = -1;
        while (scan < sanitized.length) {
          if (sanitized[scan] !== '`') {
            scan++;
            continue;
          }
          const runStart = scan;
          while (scan < sanitized.length && sanitized[scan] === '`') scan++;
          if (scan - runStart === openLen) {
            closeStart = runStart;
            closeEnd = scan;
            break;
          }
          // Different-length run: part of the content, keep scanning.
        }
        if (closeStart === -1) {
          // No matching close — emit the opening backticks as literal text.
          out.push(sanitized.substring(openStart, i));
          continue;
        }
        // Extract content between the open and close runs. CommonMark: if
        // the content has both a leading and trailing space and is not
        // entirely spaces, strip one space from each end.
        const rawContent = sanitized.substring(i, closeStart);
        let content = rawContent;
        if (
          content.length >= 2 &&
          content.startsWith(' ') &&
          content.endsWith(' ') &&
          /[^ ]/.test(content)
        ) {
          content = content.substring(1, content.length - 1);
        }
        const syntax = sanitized.substring(openStart, closeEnd);
        jspwikiElements.push({
          type: 'code',
          syntax,
          codeContent: content,
          id: id++,
          position: openStart
        });
        out.push(`<span data-jspwiki-placeholder="${uuid}-${id - 1}"></span>`);
        i = closeEnd;
      }
      sanitized = out.join('');
    }

    // Step 0.55 moved — see parseWithDOMExtraction() after Phase 2.5.
    // Running it here (before JSPWikiPreprocessor) caused table cell content
    // converted to <sup>/<sub> to be subsequently destroyed by escapeHtml().

    // Step 0.56: Convert JSPWiki status boxes to Bootstrap alerts
    // These are typically block-level but handled here for consistency
    sanitized = sanitized.replace(
      /%%information\s+([\s\S]*?)\s*(?:\/%|%%)/gi,
      '<div class="alert alert-info" role="alert">$1</div>'
    );
    sanitized = sanitized.replace(
      /%%warning\s+([\s\S]*?)\s*(?:\/%|%%)/gi,
      '<div class="alert alert-warning" role="alert">$1</div>'
    );
    sanitized = sanitized.replace(
      /%%error\s+([\s\S]*?)\s*(?:\/%|%%)/gi,
      '<div class="alert alert-danger" role="alert">$1</div>'
    );

    // Step 0.6: Convert JSPWiki line break syntax
    // In JSPWiki, \\ (two backslashes) forces a line break
    // Must happen after code blocks are protected so we don't break code
    // Three backslashes (\\\ ) forces a flush after images (also converts to <br>)
    sanitized = sanitized.replace(/\\\\\\/g, '<br class="wiki-clearfix">'); // \\\ = flush/clearfix
    sanitized = sanitized.replace(/\\\\/g, '<br>'); // \\ = line break

    // Step 0.7: Convert emoji shortcodes (:name:) to Unicode characters.
    // Runs after Step 0 code extraction so shortcodes inside backticks or
    // fenced blocks are already protected as UUID placeholders and won't fire.
    if (this.config?.emoji?.enabled !== false) {
      sanitized = convertEmojiShortcodes(sanitized);
    }

    // Step 1: Extract ESCAPED syntax FIRST (before anything else)
    // Matches: [[{$var}], [[{Plugin}]
    // Result: Literal [{$var}] or [{Plugin}] in output
    sanitized = sanitized.replace(/\[\[\{([^}]+)\}\]/g, (match: string, inner: string, offset: number) => {
      jspwikiElements.push({
        type: 'escaped',
        syntax: match,
        literal: `[{${inner}}]`, // What should appear in output
        id: id++,
        position: offset
      });
      return `<span data-jspwiki-placeholder="${uuid}-${id - 1}"></span>`;
    });

    // Step 2: Extract variables [{$varname}]
    // Matches: [{$username}], [{$pagename}], etc.
    // Does NOT match: [{Plugin}], [[{$escaped}] (already extracted)
    sanitized = sanitized.replace(/\[\{(\$\w+)\}\]/g, (match: string, varName: string, offset: number) => {
      jspwikiElements.push({
        type: 'variable',
        syntax: match,
        varName: varName, // Includes the $
        id: id++,
        position: offset
      });
      return `<span data-jspwiki-placeholder="${uuid}-${id - 1}"></span>`;
    });

    // Step 3: Extract plugins [{PluginName params}]
    // Matches: [{TableOfContents}], [{Search query='wiki'}]
    // Does NOT match: [{$variable}] (already extracted), [{] (malformed)
    // Requires: At least one word character after [{
    sanitized = sanitized.replace(/\[\{([A-Za-z]\w*[^}]*)\}\]/g, (match: string, inner: string, offset: number) => {
      jspwikiElements.push({
        type: 'plugin',
        syntax: match,
        inner: inner.trim(),
        id: id++,
        position: offset
      });
      return `<span data-jspwiki-placeholder="${uuid}-${id - 1}"></span>`;
    });

    // Step 3.5: Extract single-line footnote definitions [^id]: text
    // Must run BEFORE Step 4 so the [^id] on a definition line is not extracted
    // as a footnote-ref, leaving a dangling ": text" in the content.
    sanitized = sanitized.replace(/^\[\^([^\]\s]+)\]:\s*(.+)$/mg,
      (match: string, fnId: string, fnText: string, offset: number) => {
        jspwikiElements.push({
          type: 'footnote-def',
          syntax: match,
          footnoteId: fnId,
          footnoteText: fnText,
          id: id++,
          position: offset
        });
        return `<span data-jspwiki-placeholder="${uuid}-${id - 1}"></span>`;
      }
    );

    // Step 3.6: Extract multi-paragraph footnote definitions [^id]: \n    continuation
    sanitized = sanitized.replace(
      /^\[\^([\d\w-]+)\]:\s*((\n+(\s{2,4}|\t).+)+)$/mg,
      (match: string, fnId: string, fnText: string, _a: string, _b: string, offset: number) => {
        jspwikiElements.push({
          type: 'footnote-def',
          syntax: match,
          footnoteId: fnId,
          footnoteText: fnText.trim(),
          id: id++,
          position: offset
        });
        return `<span data-jspwiki-placeholder="${uuid}-${id - 1}"></span>`;
      }
    );

    // Step 4: Universal bracket scanner — extract ALL [content] not followed by (
    // Classification is done on the inner content AFTER extraction, not during matching.
    //   inner starts with [  → escaped literal  [[PageName] → literal [PageName]
    //   inner starts with ^  → footnote-ref     [^1]        → <a href="#footnote-1">
    //   inner is blank       → pass through     [ ]         → task-list checkbox
    //   otherwise            → wiki link        [PageName], [Display|Target]
    sanitized = sanitized.replace(/\[([^\]]*)\](?!\()/g,
      (match: string, inner: string, offset: number) => {
        // Pass through blank brackets (task-list checkboxes [ ])
        if (inner.trim() === '') return match;

        // Pass through malformed JSPWiki syntax [{...  (no closing }])
        // Steps 2 and 3 already consumed valid [{$var}] and [{Plugin}]; anything
        // starting with { here is malformed and should be left as literal text.
        if (inner.startsWith('{')) return match;

        if (inner.startsWith('[')) {
          // [[text] → escaped literal [text]
          jspwikiElements.push({
            type: 'escaped',
            syntax: match,
            literal: inner + ']',  // inner is "[text", restore the closing ]
            id: id++,
            position: offset
          });
        } else if (inner.startsWith('^')) {
          // [^id] → footnote reference
          jspwikiElements.push({
            type: 'footnote-ref',
            syntax: match,
            footnoteId: inner.slice(1),  // drop leading ^
            id: id++,
            position: offset
          });
        } else {
          // Wiki link: [PageName] or [Display|Target]
          jspwikiElements.push({
            type: 'link',
            syntax: match,
            target: inner.trim(),
            id: id++,
            position: offset
          });
        }
        return `<span data-jspwiki-placeholder="${uuid}-${id - 1}"></span>`;
      }
    );

    return {
      sanitized,      // Content with JSPWiki syntax replaced by placeholders
      jspwikiElements, // Array of extracted elements with metadata
      uuid            // Unique identifier for this extraction (prevents collisions)
    };
  }

  /**
   * Creates a text node for escaped JSPWiki syntax
   *
   * This is a helper method for Phase 2 DOM node creation (Issue #116).
   * Escaped syntax like [[{$var}]] should render as literal text [{$var}].
   *
   * @param element - Extracted escaped element
   * @param wikiDocument - WikiDocument to create node in
   * @returns DOM node containing the escaped literal text
   *
   * @example
   * const element = { type: 'escaped', literal: '[{$username}]', id: 0, ... };
   * const node = createTextNodeForEscaped(element, wikiDoc);
   * // Returns: <span class="wiki-escaped" data-jspwiki-id="0">[{$username}]</span>
   */
  createTextNodeForEscaped(element: ExtractedElement, wikiDocument: WikiDocument): unknown {
    // Create a span element to maintain consistency with other handlers
    // (all handlers return elements with data-jspwiki-id for merge phase)
    const node = wikiDocument.createElement('span', {
      'class': 'wiki-escaped',
      'data-jspwiki-id': element.id.toString()
    });

    // Set the literal text content (already extracted in element.literal)
    node.textContent = element.literal ?? '';

    return node;
  }

  /**
   * Creates a DOM node from a JSPWiki style block (%%class-name ... /%)
   *
   * This handles table-related style classes (table-striped, sortable, etc.)
   * by parsing JSPWiki table syntax and creating HTML tables with proper styling.
   * For non-table styles, wraps content in a styled div/span.
   *
   * @param element - Extracted style element
   * @param context - Rendering context
   * @param wikiDocument - WikiDocument to create node in
   * @returns DOM node for the styled content
   *
   * @example
   * // For table styles:
   * const element = { type: 'style', className: 'table-striped', styleContent: '|| H1 ||\n| D1 |' };
   * const node = createNodeFromStyleBlock(element, context, wikiDoc);
   * // Returns: <table class="table table-striped">...</table>
   */
  async createNodeFromStyleBlock(element: ExtractedElement, context: ParseContext, wikiDocument: WikiDocument): Promise<unknown> {
    // Use accumulated classes (from nested styles) if available, otherwise single class
    const classes = element.accumulatedClasses || [element.className ?? ''];
    const classString = classes.filter(c => c).join(' ');
    const content = element.styleContent ?? '';

    // Check if content has JSPWiki table syntax (|| header || or | cell |)
    const hasTableSyntax = /^\s*\|/m.test(content);

    if (hasTableSyntax) {
      // Generate table with all accumulated classes
      return await this.createTableNode(content, classString, element.id, wikiDocument, context);
    }

    // JSPWiki Rule: Determine element type based on content
    // Block content (newlines, lists, placeholders for nested blocks) → <div>, inline → <span>
    const hasPlaceholder = content.includes('data-jspwiki-placeholder');
    const isBlockContent = content.includes('\n') ||
                           /^\s*[-*#]/m.test(content) ||  // List syntax
                           hasPlaceholder;  // Nested block placeholder

    const tagName = isBlockContent ? 'div' : 'span';
    const nodeAttrs: Record<string, string> = { 'data-jspwiki-id': element.id.toString() };
    if (classString) nodeAttrs['class'] = classString;
    // #907: block-form inline CSS (%%(css) … /%) — sanitised style attribute.
    if (element.cssRaw) {
      const style = this.sanitizeInlineCss(element.cssRaw);
      if (style) nodeAttrs['style'] = style;
    }
    const node = wikiDocument.createElement(tagName, nodeAttrs);

    // Use innerHTML for content with placeholders (nested style block nodes — resolved by mergeDOMNodes)
    // For all other content, scan for all wiki syntax and resolve directly to DOM nodes.
    if (MarkupParser.isRawCodeBlock(classes, content)) {
      // Raw code/CSS dump — no markdown pass. Keeps its existing path exactly.
      if (hasPlaceholder) node.innerHTML = content;
      else await this.appendWikiNodes(content, node, context, wikiDocument, element.id * 1000);
    } else if (hasPlaceholder) {
      // Nested blocks. This path has always written content through innerHTML,
      // so raw HTML passes through — 10 pages depend on it, almost all for
      // <sup>/<sub> in chemistry and units notation. Markdown runs WITHOUT
      // escaping here so that stays true: the trust level is unchanged, markdown
      // is simply added. (Escaping here instead would have rendered `m<sup>2</sup>`
      // as visible tags on those pages.)
      await this.appendMarkdownBlockNodes(content, node, context, wikiDocument, element.id * 1000, false);
    } else if (isBlockContent) {
      // #1039: block content also gets the markdown pass. Style-block content is
      // lifted out at Step 0.5, before Showdown runs on the document, so a
      // heading, list or **bold** inside `%%information … /%` reached the reader
      // as literal source. Only inline (`span`) content skips this — Showdown
      // wraps output in <p>, which has no business inside a span.
      await this.appendMarkdownBlockNodes(content, node, context, wikiDocument, element.id * 1000);
    } else {
      await this.appendWikiNodes(content, node, context, wikiDocument, element.id * 1000);
    }
    return node;
  }

  /**
   * Creates an HTML table node from JSPWiki table syntax
   *
   * @param content - JSPWiki table content (|| header || and | cell | syntax)
   * @param className - CSS class to apply (e.g., 'table-striped')
   * @param elementId - Element ID for tracking
   * @param wikiDocument - WikiDocument to create node in
   * @returns HTML table element
   */
  /**
   * Named HTML entities decoded inside DOM-built inner text (#907 follow-up).
   * Authors write `&nbsp;`, `&copy;`, etc. as raw entities in wiki source; when
   * that text becomes a real DOM text node its `&` would otherwise serialize to
   * `&amp;` and the literal `&nbsp;` would show. Decoding to the actual char
   * makes serialization round-trip correctly. Kept small on purpose — the
   * common set; numeric `&#…;`/`&#x…;` are handled generically.
   */
  private static readonly NAMED_ENTITIES: Record<string, string> = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    copy: '©', reg: '®', trade: '™', mdash: '—',
    ndash: '–', hellip: '…', deg: '°', times: '×',
    laquo: '«', raquo: '»', middot: '·'
  };

  /**
   * Decode a small set of named + all numeric HTML entities in plain text.
   * Single pass, so a double-encoded `&amp;nbsp;` decodes only its outer `&amp;`
   * (never double-decodes). Text nodes re-escape on serialization, so this is
   * display-idempotent and cannot introduce markup. Code spans are NOT run
   * through this — literal `&nbsp;` in backticks stays literal.
   */
  private decodeTextEntities(s: string): string {
    if (s.indexOf('&') === -1) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, body: string) => {
      if (body[0] === '#') {
        const cp = (body[1] === 'x' || body[1] === 'X')
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        if (Number.isFinite(cp) && cp > 0 && cp <= 0x10FFFF) {
          try { return String.fromCodePoint(cp); } catch { return m; }
        }
        return m;
      }
      const named = MarkupParser.NAMED_ENTITIES[body];
      return named !== undefined ? named : m;
    });
  }

  /**
   * Scans `content` for all JSPWiki wiki syntax (mirrors Steps 1–4 of extractJSPWikiSyntax)
   * and appends the resolved child nodes directly to `node`. Text between matches is appended
   * as text nodes. Used by createNodeFromStyleBlock and populateCell (via createTableNode).
   *
   * @param content  - Raw cell/block text containing wiki syntax
   * @param node     - Target element to append children to
   * @param context  - ParseContext for variable/plugin resolution
   * @param wikiDocument - WikiDocument for node creation
   * @param idStart  - Starting ID for created elements (must not collide with outer IDs)
   */
  private async appendWikiNodes(
    content: string,
    node: ReturnType<typeof WikiDocument.prototype.createElement>,
    context: ParseContext | undefined,
    wikiDocument: WikiDocument,
    idStart: number
  ): Promise<void> {
    // Combined pattern — mirrors Steps 0–4 of extractJSPWikiSyntax:
    //   Group 1: `code`            inline code span → <code>
    //   Group 2: [[{inner}]        escaped plugin literal → text [{inner}]
    //   Group 3: [{$varname}]      variable (varname without $)
    //   Group 4: [{PluginName...}] plugin
    //   Group 5: [inner]           bracket (link, escaped [[, blank pass-through)
    //   Group 6: <span data-jspwiki-placeholder="…"></span> — an already-
    //             extracted element (e.g. #907 inline styles hoisted at the
    //             top level that landed inside a table cell). Preserved as a
    //             real element so mergeDOMNodes resolves it later.
    const wikiPattern = /`([^`\n]+)`|\[\[\{([^}]*)\}\]|\[\{\$(\w+)\}\]|\[\{([A-Za-z]\w*[^}]*)\}\]|\[([^\]]*)\](?!\()|<span data-jspwiki-placeholder="([^"]*)"><\/span>/g;

    if (!wikiPattern.test(content)) {
      node.textContent = this.decodeTextEntities(content);
      return;
    }

    const handlerContext = (context ?? {}) as unknown as Record<string, unknown>;
    let idCounter = idStart;
    wikiPattern.lastIndex = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = wikiPattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        node.appendChild(wikiDocument.createTextNode(this.decodeTextEntities(content.substring(lastIndex, match.index))));
      }

      node.appendChild(
        await this.createWikiNodeFromMatch(match, idCounter++, handlerContext, wikiDocument)
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      node.appendChild(wikiDocument.createTextNode(this.decodeTextEntities(content.substring(lastIndex))));
    }
  }

  /**
   * Build the DOM node for one wikiPattern match — the shared body of
   * appendWikiNodes and appendMarkdownBlockNodes, so both resolve wiki syntax
   * identically. Always returns a node; the literal cases return a text node.
   */
  private async createWikiNodeFromMatch(
    match: RegExpExecArray,
    elemId: number,
    handlerContext: Record<string, unknown>,
    wikiDocument: WikiDocument
  ): Promise<LinkedomNode> {
    const text = (s: string): LinkedomNode => wikiDocument.createTextNode(s);

    if (match[6] !== undefined) {
      // #907: preserve an already-extracted placeholder span (inline style,
      // etc.) so the final mergeDOMNodes pass can resolve it.
      return wikiDocument.createElement('span', { 'data-jspwiki-placeholder': match[6] });
    }

    if (match[1] !== undefined) {
      // Inline code: `content` → <code>content</code>
      const code = wikiDocument.createElement('code', {});
      code.textContent = match[1];
      return code;
    }

    if (match[2] !== undefined) {
      // Escaped plugin literal: [[{inner}] → literal [{inner}]
      return text(`[{${match[2]}}]`);
    }

    if (match[3] !== undefined) {
      // Variable: [{$varname}]
      const varElement = { type: 'variable' as const, syntax: match[0], varName: `$${match[3]}`, id: elemId, position: match.index };
      try {
        return await this.domVariableHandler.createNodeFromExtract(varElement, handlerContext, wikiDocument);
      } catch { return text(match[0]); }
    }

    if (match[4] !== undefined) {
      // Plugin: [{PluginName...}]
      const pluginElement = { type: 'plugin' as const, syntax: match[0], inner: match[4].trim(), id: elemId, position: match.index };
      try {
        return await this.domPluginHandler.createNodeFromExtract(
          pluginElement,
          handlerContext as Parameters<typeof this.domPluginHandler.createNodeFromExtract>[1],
          wikiDocument
        );
      } catch { return text(match[0]); }
    }

    if (match[5] !== undefined) {
      // Bracket: [inner] — classify same as Step 4
      const inner = match[5];
      if (inner.trim() === '' || inner.startsWith('{')) return text(match[0]);
      // Escaped: [[PageName] → literal [PageName]
      if (inner.startsWith('[')) return text(inner + ']');

      const linkElement = { type: 'link' as const, syntax: match[0], target: inner.trim(), id: elemId, position: match.index };
      try {
        return await this.domLinkHandler.createNodeFromExtract(linkElement, {}, wikiDocument);
      } catch { return text(match[0]); }
    }

    return text(match[0]);
  }

  /**
   * Is this style block a raw code/CSS dump rather than prose? (#1039)
   *
   * These must NOT go through the markdown pass. `%%add-css` is JSPWiki's
   * convention for a stylesheet, and running Showdown over CSS corrupts it:
   * a CSS comment's asterisks read as emphasis markers, so a comment around the
   * word `pagination.less` rendered as `/<em>pagination.less</em>/` on nine CSS
   * documentation pages. Those pages exist to show the CSS accurately, so that
   * is a real defect rather than a cosmetic one.
   *
   * Two signals, both cheap: the class name, and a CSS comment anywhere in the
   * content (which catches a stylesheet pasted into a differently-named block).
   * Checked against the full corpus — every mangled block matched, and no block
   * containing real markdown did.
   */
  private static isRawCodeBlock(classes: string[], content: string): boolean {
    if (classes.some((c) => c === 'add-css' || c === 'prettify')) return true;
    return /\/\*/.test(content) && /\*\//.test(content);
  }

  /** `&`, `<`, `>` only — enough to keep source text inert through Showdown. */
  private escapeForMarkdown(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Resolve a style block's BLOCK content with both the wiki pass and the
   * markdown pass (#1039).
   *
   * Style-block content is lifted out at Step 0.5, before Showdown runs on the
   * document, and was then handed to appendWikiNodes — which resolves wiki
   * syntax and emits everything else as text nodes. So markdown inside a block
   * reached the reader as literal source: `## Introduction` displayed its own
   * hashes, and `**bold**` its own asterisks, while the identical markup one
   * line outside the block rendered normally. 12 pages were affected.
   *
   * Raw HTML worked in there by accident, which is why it went unnoticed — an
   * author who reached for `<br>` got a line break and had no reason to suspect
   * the block was inert. That is also how the one raw `<br>` that #1038's
   * migration could not convert came to exist.
   *
   * ## Why slots rather than converting each text run
   *
   * Wiki syntax must still resolve to the same nodes it does today, so the two
   * passes have to interleave. Converting each text run between wiki matches
   * separately would cut block constructs in half — a list item containing a
   * link would become a one-item list, a stray fragment, and another list.
   *
   * Instead every wiki match is replaced by an empty slot span, Showdown runs
   * over the whole scaffold, and the resolved nodes are swapped back in
   * afterwards. Block structure survives because Showdown sees the block whole.
   *
   * ## Why the text is escaped first
   *
   * Text between matches is escaped before Showdown sees it, which keeps the
   * exact inertness the text-node path had: `<script>` in a block stays visible
   * text, as it does today. Markdown syntax is untouched by that escaping, so
   * this is strictly additive — it grants markdown without granting raw HTML.
   */
  private async appendMarkdownBlockNodes(
    content: string,
    node: ReturnType<typeof WikiDocument.prototype.createElement>,
    context: ParseContext | undefined,
    wikiDocument: WikiDocument,
    idStart: number,
    escapeText = true
  ): Promise<void> {
    const renderingManager = this.engine.getManager<RenderingManagerInterface>('RenderingManager');
    const converter = renderingManager?.converter;
    if (!converter) {
      // No converter (degraded engine, some unit harnesses) — the wiki pass on
      // its own is still better than nothing, and is what shipped before.
      await this.appendWikiNodes(content, node, context, wikiDocument, idStart);
      return;
    }

    const wikiPattern = /`([^`\n]+)`|\[\[\{([^}]*)\}\]|\[\{\$(\w+)\}\]|\[\{([A-Za-z]\w*[^}]*)\}\]|\[([^\]]*)\](?!\()|<span data-jspwiki-placeholder="([^"]*)"><\/span>/g;
    const handlerContext = (context ?? {}) as unknown as Record<string, unknown>;
    const slots: LinkedomNode[] = [];

    let scaffold = '';
    let lastIndex = 0;
    let idCounter = idStart;
    let match: RegExpExecArray | null;

    const asText = (raw: string): string => {
      const decoded = this.decodeTextEntities(raw);
      return escapeText ? this.escapeForMarkdown(decoded) : decoded;
    };

    while ((match = wikiPattern.exec(content)) !== null) {
      if (match.index > lastIndex) scaffold += asText(content.substring(lastIndex, match.index));
      scaffold += `<span data-md-slot="${slots.length}"></span>`;
      slots.push(await this.createWikiNodeFromMatch(match, idCounter++, handlerContext, wikiDocument));
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) scaffold += asText(content.substring(lastIndex));

    // NCM line breaks, after escaping so these are the only tags we introduce.
    // Mirrors the document-level rewrite the markup phase performs (see the
    // `\\` / `\\\` handling around MarkupParser:1777).
    scaffold = scaffold
      .replace(/\\{3}/g, '<br class="wiki-clearfix">')
      .replace(/\\{2}/g, '<br>');

    const html = converter.makeHtml(guardShowdownInput(scaffold));

    const holder = wikiDocument.createElement('div', {});
    holder.innerHTML = html;

    for (const slot of holder.querySelectorAll('[data-md-slot]')) {
      const replacement = slots[Number(slot.getAttribute('data-md-slot'))];
      if (replacement) slot.replaceWith(replacement);
    }

    while (holder.firstChild) node.appendChild(holder.firstChild);
  }

  /**
   * Split a table cell on its line breaks — `<br>` or NCM's `\\` / `\\\` —
   * leaving inline code spans intact (#1038).
   *
   * A plain `cell.split(/<br\s*\/?>|\\{2,3}/i)` was the first cut, and it broke
   * the pages that DOCUMENT these sequences. `Using Current Time Plugin` has a
   * SimpleDateFormat reference table whose "escape for text" row carries `\\`
   * as its example value; splitting emptied that cell and put a line break in
   * it, so the page stopped showing the thing it was explaining.
   *
   * Backticking the value does not rescue it on its own. Splitting first cuts
   * `` `\\` `` into two lone backticks, which are no longer a code span by the
   * time the wiki/plain decision runs — the cell then renders literal
   * backticks AROUND a break, which is worse than where it started. Keeping
   * the span whole is what lets appendWikiNodes see it and emit `<code>`.
   *
   * Only %%style tables need this. A plain markdown table reaches
   * JSPWikiPreprocessor, where inline code is placeholder-extracted upstream
   * and never arrives here as backticks at all — which is precisely why a
   * plain-table probe reported this method as redundant. It is not.
   *
   * Code is inert elsewhere in this pipeline for the same reason —
   * SecurityFilter.collectErrors blanks it before scanning, and
   * migrate-br-to-ncm skips it — so a style-block cell should not be the one
   * place a backtick fails to mean "this is a literal".
   *
   * A break outside the span still splits: `` `\\` is an escape\\next `` gives
   * two segments, not three.
   */
  private splitCellOnBreaks(cell: string): string[] {
    // One alternation, code FIRST so a break inside a span is consumed as part
    // of the span rather than matched on its own.
    const token = /`[^`\n]*`|<br\s*\/?>|\\{2,3}/gi;

    const segments: string[] = [];
    let current = '';
    let lastIndex = 0;

    for (const match of cell.matchAll(token)) {
      current += cell.slice(lastIndex, match.index);
      lastIndex = match.index + match[0].length;

      if (match[0].startsWith('`')) {
        current += match[0]; // a code span is content, not a break
      } else {
        segments.push(current);
        current = '';
      }
    }

    segments.push(current + cell.slice(lastIndex));
    return segments;
  }

  private async createTableNode(content: string, className: string, elementId: number, wikiDocument: WikiDocument, context?: ParseContext): Promise<unknown> {
    const lines = content.split('\n').filter(line => /^\s*\|/.test(line));

    // Parse rows using bracket-aware splitting
    const rows: Array<{ isHeader: boolean; cells: string[] }> = [];
    for (const line of lines) {
      const trimmed = line.trim();
      const isHeader = trimmed.startsWith('||');

      const delimiter = isHeader ? '||' : '|';
      const parts = this.splitCellsBracketAware(trimmed, delimiter);

      // Remove empty first/last elements (from leading/trailing delimiters)
      const cells = parts
        .slice(1, parts[parts.length - 1].trim() === '' ? -1 : undefined)
        .map(c => c.trim());

      rows.push({ isHeader, cells });
    }

    // Build CSS classes - always include 'table' base class
    const classes = ['table'];
    if (className) {
      classes.push(className);
    }

    // Create table element
    const table = wikiDocument.createElement('table', {
      'class': classes.join(' '),
      'data-jspwiki-id': elementId.toString()
    });

    // Separate header and body rows
    const headerRows = rows.filter(r => r.isHeader);
    const bodyRows = rows.filter(r => !r.isHeader);

    // Counter for link element IDs within this table
    let linkIdCounter = elementId * 1000;

    // Helper: populate a table cell, resolving all wiki syntax.
    // For cells with no wiki syntax and possible <br> content, uses a fast path.
    // Otherwise delegates to appendWikiNodes for the combined scanner.
    const populateCell = async (el: ReturnType<typeof wikiDocument.createElement>, cell: string): Promise<void> => {
      // Line breaks are resolved FIRST, before the wiki/plain decision (#1038).
      //
      // Cells used to support no line break at all when they contained wiki
      // syntax: appendWikiNodes emits leftover content as text nodes, which
      // escape by definition, so a break rendered as a literal `&lt;br&gt;`.
      // And `\\` never worked in a %%style table at all, because style-block
      // content is extracted at Step 0.5, before the markup phase rewrites
      // `\\` into a <br> (MarkupParser:1778).
      //
      // Splitting here handles both syntaxes on both paths. It also makes
      // #1037's `no-raw-br` message honest inside a cell: without it those
      // pages render correctly but can never be saved, because the suggested
      // alternative does not work there.
      const segments = this.splitCellOnBreaks(cell);

      for (let i = 0; i < segments.length; i++) {
        if (i > 0) el.appendChild(wikiDocument.createElement('br', {}));
        const segment = segments[i];
        if (segment === '') continue;

        const hasWiki = /`[^`\n]+`|\[\[\{|\[\{\$|\[\{[A-Za-z]|\[|data-jspwiki-placeholder/.test(segment);
        if (!hasWiki) {
          // Plain text: a text node escapes it, which is what a cell wants.
          el.appendChild(wikiDocument.createTextNode(segment));
          continue;
        }

        await this.appendWikiNodes(segment, el, context, wikiDocument, linkIdCounter);
        linkIdCounter += 100; // advance past any IDs appendWikiNodes may have used
      }
    };

    // Create thead if there are header rows
    if (headerRows.length > 0) {
      const thead = wikiDocument.createElement('thead', {});
      for (const row of headerRows) {
        const tr = wikiDocument.createElement('tr', {});
        for (const cell of row.cells) {
          const th = wikiDocument.createElement('th', {});
          await populateCell(th, cell);
          tr.appendChild(th);
        }
        thead.appendChild(tr);
      }
      table.appendChild(thead);
    }

    // Create tbody if there are body rows
    if (bodyRows.length > 0) {
      const tbody = wikiDocument.createElement('tbody', {});
      let autoRowNum = 0;
      for (const row of bodyRows) {
        const tr = wikiDocument.createElement('tr', {});
        const hasAutoNum = row.cells.some(c => c === '#');
        if (hasAutoNum) autoRowNum++;
        for (const cell of row.cells) {
          const td = wikiDocument.createElement('td', {});
          await populateCell(td, cell === '#' ? String(autoRowNum) : cell);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
    }

    return table;
  }

  /**
   * Split text by a delimiter while respecting [...] bracket groups.
   * Pipes inside [wiki link|PageName] are not treated as cell delimiters.
   */
  private splitCellsBracketAware(text: string, delimiter: string): string[] {
    const cells: string[] = [];
    let current = '';
    let bracketDepth = 0;
    let i = 0;

    while (i < text.length) {
      if (text[i] === '[') {
        bracketDepth++;
        current += text[i];
        i++;
        continue;
      }
      if (text[i] === ']') {
        bracketDepth = Math.max(0, bracketDepth - 1);
        current += text[i];
        i++;
        continue;
      }

      if (bracketDepth === 0 && text.substring(i, i + delimiter.length) === delimiter) {
        cells.push(current);
        current = '';
        i += delimiter.length;
        continue;
      }

      current += text[i];
      i++;
    }
    cells.push(current);

    return cells;
  }

  /**
   * Creates a DOM node from an extracted element (Phase 2 dispatcher)
   *
   * This is the dispatcher method for Phase 2 that routes extracted elements
   * to the appropriate handler based on element type.
   *
   * @param element - Extracted element from extractJSPWikiSyntax()
   * @param context - Rendering context
   * @param wikiDocument - WikiDocument to create node in
   * @returns DOM node for the element
   *
   * @example
   * const element = { type: 'variable', varName: '$username', id: 0 };
   * const node = await createDOMNode(element, context, wikiDoc);
   * // Returns: <span class="wiki-variable">JohnDoe</span>
   */
  async createDOMNode(element: ExtractedElement, context: ParseContext, wikiDocument: WikiDocument): Promise<unknown> {
    // Cast context to Record for handler compatibility (handlers extract what they need)
    const handlerContext = context as unknown as Record<string, unknown>;

    switch (element.type) {
    case 'variable':
      // Variable: [{$username}]
      return await this.domVariableHandler.createNodeFromExtract(
        element as unknown as Parameters<typeof this.domVariableHandler.createNodeFromExtract>[0],
        handlerContext,
        wikiDocument
      );

    case 'plugin':
      // Plugin: [{TableOfContents}]
      return await this.domPluginHandler.createNodeFromExtract(
        element as unknown as Parameters<typeof this.domPluginHandler.createNodeFromExtract>[0],
        handlerContext as Parameters<typeof this.domPluginHandler.createNodeFromExtract>[1],
        wikiDocument
      );

    case 'link':
      // Link: [HomePage] or [Display|Target]
      return await this.domLinkHandler.createNodeFromExtract(
        element as unknown as Parameters<typeof this.domLinkHandler.createNodeFromExtract>[0],
        handlerContext,
        wikiDocument
      );

    case 'escaped':
      // Escaped: [[{$var}]] → [{$var}]  or  [[PageName] → [PageName]
      return this.createTextNodeForEscaped(element, wikiDocument);

    case 'footnote-ref': {
      // [^1] → <a id="footnote-ref-1" href="#footnote-1"><sup>[1]</sup></a>
      //
      // #1125: the id is the back-link target — FootnotesPlugin's sidecar
      // list links each entry to `#footnote-ref-<id>`, which resolved to
      // nothing before this. A page referencing one footnote twice emits the
      // id twice; browsers jump to the first occurrence, which is the wanted
      // destination, so the duplicate-id wart is accepted over threading
      // per-parse state through the render.
      const fnId = element.footnoteId ?? '';
      const refNode = wikiDocument.createElement('a', {
        'id': `footnote-ref-${fnId}`,
        'href': `#footnote-${fnId}`,
        'class': 'footnote-ref',
        'data-jspwiki-id': element.id.toString()
      });
      const sup = wikiDocument.createElement('sup', {});
      sup.textContent = `[${fnId}]`;
      refNode.appendChild(sup);
      return refNode;
    }

    case 'footnote-def': {
      // [^1]: text → <small class="footnote" id="footnote-1"><a href="#footnote-1"><sup>[1]</sup></a>: text</small>
      const fnId = element.footnoteId ?? '';
      const defNode = wikiDocument.createElement('small', {
        'class': 'footnote',
        'id': `footnote-${fnId}`,
        'data-jspwiki-id': element.id.toString()
      });
      const anchor = wikiDocument.createElement('a', { 'href': `#footnote-${fnId}` });
      const defSup = wikiDocument.createElement('sup', {});
      defSup.textContent = `[${fnId}]`;
      anchor.appendChild(defSup);
      defNode.appendChild(anchor);
      // Append definition text safely — textContent escapes HTML entities
      const textSpan = wikiDocument.createElement('span', {});
      textSpan.textContent = `: ${element.footnoteText ?? ''}`;
      defNode.appendChild(textSpan);
      return defNode;
    }

    case 'code': {
      // Inline code span: `content` → <code>content</code>
      // textContent setter safely escapes HTML characters — no wiki syntax can fire
      const codeNode = wikiDocument.createElement('code', {
        'data-jspwiki-id': element.id.toString()
      });
      codeNode.textContent = element.codeContent ?? '';
      return codeNode;
    }

    case 'fenced-code': {
      // Fenced code block: ```lang\ncontent\n``` → <pre><code class="language-lang">content</code></pre>
      // textContent setter safely escapes HTML — no wiki syntax can fire inside code blocks
      const lang = element.codeLanguage ?? '';
      const codeAttrs: Record<string, string> = {};
      if (lang) {
        codeAttrs['class'] = `language-${lang}`;
      }
      const innerCode = wikiDocument.createElement('code', codeAttrs);
      innerCode.textContent = element.codeContent ?? '';
      // data-jspwiki-id must be on the outermost node so mergeDOMNodes can find it
      const preNode = wikiDocument.createElement('pre', { 'data-jspwiki-id': element.id.toString() });
      preNode.appendChild(innerCode);
      return preNode;
    }

    case 'style':
      // Style block: %%class-name ... /%
      return await this.createNodeFromStyleBlock(element, context, wikiDocument);

    case 'inline-style':
      // #907: inline %%(css)/sup/sub/strike … /% → DOM node
      // #938: plus bare class runs → <span class="…">
      return await this.buildInlineStyleNode(
        element.inlineVariant ?? 'css',
        element.cssRaw ?? '',
        element.inner ?? '',
        context,
        wikiDocument,
        element.id * 1000,
        element.id,
        element.classNames
      );

    default: {
      logger.error(`❌ Unknown element type: ${String(element.type)}`);
      // Return error node
      const errorNode = wikiDocument.createElement('span', {
        'class': 'wiki-error',
        'data-jspwiki-id': element.id.toString()
      });
      errorNode.textContent = `[Error: Unknown type ${String(element.type)}]`;
      return errorNode;
    }
    }
  }

  /**
   * Merges DOM nodes back into Showdown-generated HTML (Phase 3)
   *
   * Replaces HTML comment placeholders (<!--JSPWIKI-uuid-id-->) in the HTML with
   * the rendered DOM nodes. Processes nodes in reverse ID order to
   * handle nested JSPWiki syntax correctly.
   *
   * Uses HTML comments as placeholders to avoid Showdown interpreting them as markdown.
   *
   * @param html - HTML from Showdown with placeholders
   * @param nodes - Array of DOM nodes with data-jspwiki-id
   * @param uuid - UUID from extraction phase
   * @returns Final HTML with nodes merged in
   *
   * @example
   * // Input HTML: "<p>User: <!--JSPWIKI-abc123-0--></p>"
   * // Node 0: <span data-jspwiki-id="0">JohnDoe</span>
   * // Output: "<p>User: <span>JohnDoe</span></p>"
   */
  mergeDOMNodes(html: string, nodes: unknown[], uuid: string): string {
    if (!nodes || nodes.length === 0) {
      return html;
    }

    let result = html;

    // Sort nodes by ID (descending) to handle nested replacements correctly
    // Example: Plugin containing variable must be replaced after the plugin
    const sortedNodes = Array.from(nodes).sort((a, b) => {
      const elemA = a as LinkedomElement;
      const elemB = b as LinkedomElement;
      const idA = parseInt(elemA.getAttribute('data-jspwiki-id') || '0');
      const idB = parseInt(elemB.getAttribute('data-jspwiki-id') || '0');
      return idB - idA; // Descending order
    });

    for (const node of sortedNodes) {
      const element = node as LinkedomElement;
      const id = element.getAttribute('data-jspwiki-id');
      const placeholder = `<span data-jspwiki-placeholder="${uuid}-${id}"></span>`;

      // Render node to HTML
      let rendered: string;
      if (element.outerHTML) {
        rendered = element.outerHTML;
      } else if (element.textContent !== undefined) {
        // Fallback for nodes without outerHTML
        rendered = element.textContent ?? '';
      } else {
        // Empty node
        rendered = '';
      }

      // Strip internal routing attribute — never expose it in final HTML
      rendered = rendered.replace(/ data-jspwiki-id="[^"]*"/g, '');

      // Replace placeholder with rendered HTML
      // Use regex with 'g' flag to replace all occurrences
      const placeholderRegex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      result = result.replace(placeholderRegex, rendered);
    }

    return result;
  }

  /**
   * Parses wiki markup using DOM extraction strategy (Phase 1-3)
   *
   * This is the new parsing method that implements the WikiDocument DOM solution:
   * 1. Extract JSPWiki syntax (variables, plugins, links, escaped)
   * 2. Create DOM nodes from extracted elements
   * 3. Let Showdown parse the sanitized markdown
   * 4. Merge DOM nodes back into the HTML
   *
   * This approach fixes the markdown heading bug by letting Showdown handle
   * ALL markdown parsing while WikiDocument handles ONLY JSPWiki syntax.
   *
   * @param content - Wiki markup content
   * @param context - Rendering context
   * @returns Rendered HTML
   *
   * @example
   * const html = await parser.parseWithDOMExtraction('## Hello\nUser: [{$username}]', context);
   * // Returns: "<h2>Hello</h2>\n<p>User: <span>JohnDoe</span></p>"
   */
  async parseWithDOMExtraction(content: string, context: Record<string, unknown>): Promise<string> {
    logger.debug('🔄 Starting DOM extraction parse...');

    // Create ParseContext to properly extract nested userContext/requestInfo
    const parseContext = new ParseContext(content, context, this.engine);

    // Phase 1: Extract JSPWiki syntax
    const { sanitized, jspwikiElements, uuid } = this.extractJSPWikiSyntax(content, parseContext as unknown as Record<string, unknown>);
    logger.debug(`📦 Extracted ${jspwikiElements.length} JSPWiki elements`);

    // Phase 2: Create WikiDocument and build DOM nodes
    const wikiDocument = new WikiDocument(content);

    const nodes = [];
    for (const element of jspwikiElements) {
      try {
        const node = await this.createDOMNode(element, parseContext, wikiDocument);
        nodes.push(node);
      } catch (error) {
        logger.error(`❌ Error creating DOM node for element ${element.id}:`, getErrorMessage(error));
        // Create error node
        const errorNode = wikiDocument.createElement('span', {
          'class': 'wiki-error',
          'data-jspwiki-id': element.id.toString()
        });
        errorNode.textContent = `[Error: ${getErrorMessage(error)}]`;
        nodes.push(errorNode);
      }
    }
    logger.debug(`🔨 Created ${nodes.length} DOM nodes`);

    // Phase 2.5: Run JSPWikiPreprocessor on sanitized content to convert
    // bare JSPWiki table syntax (||/|) to HTML before Showdown runs.
    // Style-block tables are already handled by extractStyleBlocksWithStack,
    // but bare tables (not in %%.../%% blocks) need processing here.
    let preprocessed = sanitized;
    const jspwikiPreprocessor = this.getHandler('JSPWikiPreprocessor') as BaseSyntaxHandler | null;
    if (jspwikiPreprocessor) {
      try {
        preprocessed = await jspwikiPreprocessor.process(preprocessed, parseContext);
      } catch (error) {
        logger.warn('⚠️  JSPWikiPreprocessor failed, using raw content:', getErrorMessage(error));
      }
    }

    // #907: inline styles (%%(css)/sup/sub/strike … /%) are now extracted to
    // typed `inline-style` elements in Phase 1 and resolved to DOM nodes — the
    // former Step 0.55 string replacements (sup/sub/strike + #906
    // convertInlineCssStyles) are retired. Any inline styles inside table cells
    // are handled by appendWikiNodes during cell population.

    // Phase 2.6: Run all other registered handlers (custom/addon handlers) on preprocessed content.
    // JSPWiki syntax has already been extracted (UUID placeholders), so built-in handlers like
    // PluginSyntaxHandler are no-ops here. Custom handlers with their own patterns will run.
    const allHandlers = this.getHandlers(true) as BaseSyntaxHandler[];
    for (const handler of allHandlers) {
      if ((handler as BaseSyntaxHandler & { handlerId: string }).handlerId === 'JSPWikiPreprocessor') {
        continue; // Already ran above
      }
      try {
        preprocessed = await handler.process(preprocessed, parseContext);
      } catch (error) {
        logger.warn(`⚠️  Handler ${(handler as BaseSyntaxHandler & { handlerId: string }).handlerId ?? 'unknown'} failed:`, getErrorMessage(error));
      }
    }

    // Phase 2.7: Run markup-stage filters (#596 / #614). ValidationFilter and
    // SpamFilter operate on raw markdown/JSPWiki content (their rules look
    // for malformed plugin syntax, blacklisted words, etc.). SecurityFilter
    // is phase:'html' and is skipped here; it runs at Phase 4.5 below.
    if (this.filterChain) {
      try {
        preprocessed = await this.filterChain.process(preprocessed, parseContext, 'markup');
      } catch (error) {
        logger.warn('⚠️  FilterChain.process(markup) failed:', getErrorMessage(error));
      }
    }

    // Phase 3: Let Showdown parse the sanitized markdown.
    //
    // #599: guard the input first. showdown 2.1.0 backtracks catastrophically on
    // unclosed link openers — 12 KB of `[](` blocks the event loop for 16s — and
    // no patched release exists or is coming. See src/utils/showdownGuard.ts.
    const guarded = guardShowdownInput(preprocessed);
    const renderingManager = this.engine.getManager<RenderingManagerInterface>('RenderingManager');
    let showdownHtml: string;
    if (renderingManager && renderingManager.converter) {
      showdownHtml = renderingManager.converter.makeHtml(guarded);
    } else {
      // Fallback if RenderingManager not available (testing)
      const converter = new showdown.Converter({
        tables: true,
        strikethrough: true,
        tasklists: true,
        simpleLineBreaks: false,
        ghCodeBlocks: true,
        ghHeaderIds: true
      });
      showdownHtml = converter.makeHtml(guarded);
    }
    logger.debug('📝 Showdown processed markdown');

    // Phase 4: Merge DOM nodes back into the HTML
    const finalHtml = this.mergeDOMNodes(showdownHtml, nodes, uuid);
    logger.debug('✅ Merge complete');

    // Phase 4.5: Run html-stage filters (#614). SecurityFilter (XSS prevention,
    // dangerous-tag stripping, attribute allow-listing) operates on rendered
    // HTML. Markup-stage filters (ValidationFilter, SpamFilter) already ran at
    // Phase 2.7 and don't run here.
    if (this.filterChain) {
      try {
        return await this.filterChain.process(finalHtml, parseContext, 'html');
      } catch (error) {
        logger.warn('⚠️  FilterChain.process(html) failed:', getErrorMessage(error));
        return finalHtml;
      }
    }

    return finalHtml;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): ExtendedMetrics {
    const metrics: ExtendedMetrics = { ...this.metrics, averageParseTime: 0, cacheHitRatio: 0 };
    
    // Calculate averages
    metrics.averageParseTime = this.metrics.parseCount > 0 
      ? this.metrics.totalParseTime / this.metrics.parseCount 
      : 0;
    
    metrics.cacheHitRatio = (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
      ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
      : 0;

    // Add handler registry metrics
    metrics.handlerRegistry = this.handlerRegistry.getStats();
    
    // Add filter chain metrics
    if (this.filterChain) {
      metrics.filterChain = this.filterChain.getStats();
    }

    // Add advanced cache metrics
    const cacheStrategies: Record<string, unknown> = {};
    this.metrics.cacheMetrics.forEach((cacheStats, strategy) => {
      const total = cacheStats.hits + cacheStats.misses;
      cacheStrategies[strategy] = {
        ...cacheStats,
        hitRatio: total > 0 ? cacheStats.hits / total : 0,
        total: total
      };
    });
    metrics.cacheStrategies = cacheStrategies;

    // Add performance monitoring data
    if (this.performanceMonitor) {
      // Calculate recent performance stats first
      const recentTimes = this.performanceMonitor.recentParseTimes.slice(-20);
      const nonCachedTimes = recentTimes.filter(entry => !entry.cacheHit);

      const recentStats = recentTimes.length > 0 ? {
        averageParseTime: nonCachedTimes.length > 0
          ? nonCachedTimes.reduce((sum, entry) => sum + entry.time, 0) / nonCachedTimes.length
          : 0,
        cachedParseCount: recentTimes.filter(entry => entry.cacheHit).length,
        nonCachedParseCount: nonCachedTimes.length
      } : null;

      metrics.performance = {
        monitoring: this.config.performance.monitoring,
        alertCount: this.performanceMonitor.alerts.length,
        recentParseCount: this.performanceMonitor.recentParseTimes.length,
        alerts: this.performanceMonitor.alerts.slice(-10), // Last 10 alerts
        recentStats
      };
    }

    return metrics;
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      parseCount: 0,
      totalParseTime: 0,
      errorCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheMetrics: new Map()
    };
  }

  /**
   * Get cached parse result
   * @param cacheKey - Cache key
   * @returns Cached result or null
   */
  async getCachedParseResult(cacheKey: string): Promise<string | null> {
    if (!this.cacheStrategies.parseResults) {
      return null;
    }
    
    try {
      return await this.cacheStrategies.parseResults.get(cacheKey) ?? null;
    } catch (error) {
      logger.warn('⚠️  Cache get failed:', getErrorMessage(error));
      return null;
    }
  }

  /**
   * Cache parse result
   * @param cacheKey - Cache key
   * @param content - Content to cache
   */
  async cacheParseResult(cacheKey: string, content: string): Promise<void> {
    if (!this.cacheStrategies.parseResults) {
      return;
    }
    
    try {
      await this.cacheStrategies.parseResults.set(cacheKey, content, { 
        ttl: this.config.cache.parseResults.ttl 
      });
      this.updateCacheMetrics('parseResults', 'set');
    } catch (error) {
      logger.warn('⚠️  Cache set failed:', getErrorMessage(error));
    }
  }

  /**
   * Get cached handler result
   * @param handlerId - Handler ID
   * @param contentHash - Content hash
   * @param contextHash - Context hash
   * @returns Cached result or null
   */
  async getCachedHandlerResult(handlerId: string, contentHash: string, contextHash: string): Promise<string | null> {
    if (!this.cacheStrategies.handlerResults) {
      return null;
    }
    
    try {
      const cacheKey = `handler:${handlerId}:${contentHash}:${contextHash}`;
      const result = await this.cacheStrategies.handlerResults.get(cacheKey);

      if (result) {
        this.updateCacheMetrics('handlerResults', 'hit');
        return result as string;
      } else {
        this.updateCacheMetrics('handlerResults', 'miss');
        return null;
      }
    } catch (error) {
      logger.warn('⚠️  Handler cache get failed:', getErrorMessage(error));
      return null;
    }
  }

  /**
   * Cache handler result
   * @param handlerId - Handler ID
   * @param contentHash - Content hash
   * @param contextHash - Context hash
   * @param result - Result to cache
   */
  async cacheHandlerResult(handlerId: string, contentHash: string, contextHash: string, result: string): Promise<void> {
    if (!this.cacheStrategies.handlerResults) {
      return;
    }
    
    try {
      const cacheKey = `handler:${handlerId}:${contentHash}:${contextHash}`;
      await this.cacheStrategies.handlerResults.set(cacheKey, result, { 
        ttl: this.config.cache.handlerResults.ttl 
      });
      this.updateCacheMetrics('handlerResults', 'set');
    } catch (error) {
      logger.warn('⚠️  Handler cache set failed:', getErrorMessage(error));
    }
  }

  /**
   * Flush the handler-results cache.
   * Call this whenever the set of known pages changes (page created or deleted) so
   * that cached RED-LINK resolutions are discarded and the next render re-evaluates
   * link targets against the updated page inventory.
   */
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async invalidateHandlerCache(): Promise<void> {
    if (this.cacheStrategies.handlerResults) {
      try {
        await this.cacheStrategies.handlerResults.clear();
        logger.debug('🗑️  MarkupParser handler-results cache flushed (page inventory changed)');
      } catch (error) {
        logger.warn('⚠️  Failed to flush handler-results cache:', getErrorMessage(error));
      }
    }
  }

  /**
   * Update cache metrics for specific strategy
   * @param strategy - Cache strategy name
   * @param operation - Operation type (hit, miss, set)
   */
  updateCacheMetrics(strategy: string, operation: 'hit' | 'miss' | 'set'): void {
    if (!this.config.cache.metricsEnabled) {
      return;
    }
    
    const metrics = this.metrics.cacheMetrics.get(strategy);
    if (metrics) {
      metrics[operation === 'hit' ? 'hits' : operation === 'miss' ? 'misses' : 'sets']++;
    }
  }

  /**
   * Update performance metrics and check thresholds
   * @param processingTime - Processing time in milliseconds
   * @param cacheHit - Whether this was a cache hit
   */
  updatePerformanceMetrics(processingTime: number, cacheHit: boolean): void {
    if (!this.performanceMonitor) {
      return;
    }

    // Track recent parse times
    this.performanceMonitor.recentParseTimes.push({
      time: processingTime,
      cacheHit: cacheHit,
      timestamp: Date.now()
    });

    // Limit recent entries
    if (this.performanceMonitor.recentParseTimes.length > this.performanceMonitor.maxRecentEntries) {
      this.performanceMonitor.recentParseTimes.shift();
    }

    // Check performance thresholds
    this.checkPerformanceThresholds();
  }

  /**
   * Check performance thresholds and generate alerts
   */
  checkPerformanceThresholds(): void {
    if (!this.performanceMonitor) {
      return;
    }

    const now = Date.now();
    
    // Only check every minute
    if (now - this.performanceMonitor.lastCheck < this.performanceMonitor.checkInterval) {
      return;
    }

    this.performanceMonitor.lastCheck = now;

    // Check average parse time threshold
    const recentTimes = this.performanceMonitor.recentParseTimes
      .filter(entry => !entry.cacheHit) // Only non-cached times
      .slice(-20); // Last 20 entries

    if (recentTimes.length > 0) {
      const avgTime = recentTimes.reduce((sum, entry) => sum + entry.time, 0) / recentTimes.length;
      
      if (avgTime > this.config.performance.alertThresholds.parseTime) {
        this.generatePerformanceAlert('SLOW_PARSING', `Average parse time ${avgTime.toFixed(2)}ms exceeds threshold ${this.config.performance.alertThresholds.parseTime}ms`);
      }
    }

    // Check cache hit ratio (only if we have enough samples)
    const totalCacheOps = this.metrics.cacheHits + this.metrics.cacheMisses;
    const minSamples = this.config.performance.alertThresholds.minCacheSamples || 50;

    if (totalCacheOps >= minSamples) {
      const hitRatio = this.metrics.cacheHits / totalCacheOps;

      if (hitRatio < this.config.performance.alertThresholds.cacheHitRatio) {
        this.generatePerformanceAlert('LOW_CACHE_HIT_RATIO', `Cache hit ratio ${(hitRatio * 100).toFixed(1)}% below threshold ${(this.config.performance.alertThresholds.cacheHitRatio * 100).toFixed(1)}%`);
      }
    }

    // Check error rate
    if (this.metrics.parseCount > 0) {
      const errorRate = this.metrics.errorCount / this.metrics.parseCount;
      
      if (errorRate > this.config.performance.alertThresholds.errorRate) {
        this.generatePerformanceAlert('HIGH_ERROR_RATE', `Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold ${(this.config.performance.alertThresholds.errorRate * 100).toFixed(1)}%`);
      }
    }
  }

  /**
   * Generate performance alert
   * @param type - Alert type
   * @param message - Alert message
   */
  generatePerformanceAlert(type: string, message: string): void {
    if (!this.performanceMonitor) {
      return;
    }

    const alert = {
      type,
      message,
      timestamp: new Date().toISOString(),
      metrics: this.getMetrics()
    };

    this.performanceMonitor.alerts.push(alert);

    // Limit alerts to prevent memory issues
    if (this.performanceMonitor.alerts.length > 100) {
      this.performanceMonitor.alerts.shift();
    }

    logger.warn(`⚠️  MarkupParser Performance Alert [${type}]: ${message}`);
    
    // Optionally send to notification system
    const notificationManager = this.engine.getManager<NotificationManagerInterface>('NotificationManager');
    if (notificationManager) {
      notificationManager.addNotification({
        type: 'performance',
        title: `MarkupParser Performance Alert: ${type}`,
        message,
        priority: 'medium',
        source: 'MarkupParser'
      });
    }
  }

  /**
   * Get performance alerts
   * @returns Array of performance alerts
   */
  getPerformanceAlerts(): unknown[] {
    return this.performanceMonitor ? [...this.performanceMonitor.alerts] : [];
  }

  /**
   * Clear performance alerts
   */
  clearPerformanceAlerts(): void {
    if (this.performanceMonitor) {
      this.performanceMonitor.alerts = [];
    }
  }

  async shutdown(): Promise<void> {
    logger.debug('🔧 MarkupParser shutting down...');
    
    // Clear handler registry
    await this.handlerRegistry.clearAll();
    
    // #1117: drop the reference only — FilterManager owns the chain and
    // shuts it down; a consumer must not destroy shared state.
    this.filterChain = null;
    
    // Clear cache references
    this.cache = null;
    this.cacheStrategies = {};
    
    // Clear performance monitor
    this.performanceMonitor = null;
    
    // Clear phases
    // Phases removed in Issue #185
    
    await super.shutdown();
  }
}

export default MarkupParser;

// Export for CommonJS (Jest compatibility)
