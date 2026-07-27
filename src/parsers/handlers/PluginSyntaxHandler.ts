import BaseSyntaxHandler, { InitializationContext, ParseContext } from './BaseSyntaxHandler.js';
import * as crypto from 'crypto';
import logger from '../../utils/logger.js';

/**
 * Plugin match information
 */
interface PluginMatch {
  fullMatch: string;
  pluginName: string;
  paramString: string;
  bodyContent: string | null;
  index: number;
  length: number;
}

/**
 * Plugin validation result
 */
interface PluginValidation {
  isValid: boolean;
  errors: string[];
  params: Record<string, unknown>;
}

/**
 * Handler configuration
 */
interface HandlerConfig {
  priority?: number;
}

/**
 * Wiki engine interface
 */
interface WikiEngine {
  getManager(name: string): unknown;
}

/**
 * Markup parser interface
 */
interface MarkupParser {
  getHandlerConfig(name: string): HandlerConfig;
  getCachedHandlerResult(handlerId: string, contentHash: string, contextHash: string): Promise<string | null>;
  cacheHandlerResult(handlerId: string, contentHash: string, contextHash: string, result: string): Promise<void>;
}

/**
 * Plugin manager interface
 */
interface PluginManager {
  execute(pluginName: string, pageName: string, params: Record<string, unknown>, context: Record<string, unknown>): Promise<string>;
}

/**
 * Rendering manager interface
 */
interface RenderingManager {
  getLinkGraph(): Record<string, unknown>;
}

/**
 * Extended parse context for the plugin handler. After #629 Pass 2, the
 * fields/methods previously redeclared here all live on the real ParseContext
 * (or are accessible via `wikiContext.X`).
 */
type PluginParseContext = ParseContext;

/**
 * PluginSyntaxHandler - Enhanced plugin syntax processing
 *
 * Handles JSPWiki-style plugin syntax: [{PluginName param=value}]
 * with advanced parameter parsing and validation.
 *
 * Related Issue: #58 - Enhanced Plugin Syntax Handler
 * Depends On: #56 - Handler Registration and Priority System
 */
class PluginSyntaxHandler extends BaseSyntaxHandler {
  declare handlerId: string;
  private engine: WikiEngine | null;
  private config: HandlerConfig | null;

  constructor(engine: WikiEngine | null = null) {
    super(
      /(?<!\[)\[\{(\w+)\s*([^}]*)\}\]/g, // Pattern: [{PluginName params}] — [[{ prefix is escape (not executed)
      90, // High priority - process before most other handlers
      {
        description: 'Enhanced JSPWiki-style plugin syntax handler with advanced parameter parsing',
        version: '2.0.0',
        dependencies: ['PluginManager'],
        timeout: 10000 // 10 second timeout for plugin execution
      }
    );
    this.handlerId = 'PluginSyntaxHandler';
    this.engine = engine;
    this.config = null;
  }

  /**
   * Initialize handler with configuration
   * @param context - Initialization context
   */
  protected async onInitialize(context: InitializationContext): Promise<void> {
    this.engine = context.engine ?? null;

    // Load handler-specific configuration
    const markupParser = context.engine?.getManager('MarkupParser') as MarkupParser | undefined;
    if (markupParser) {
      this.config = markupParser.getHandlerConfig('plugin');

      // Override priority if configured
      if (this.config?.priority && this.config.priority !== this.priority) {
        // Note: priority is readonly, this is just for logging purposes
        logger.info(`PluginSyntaxHandler priority configured as ${this.config.priority} (using ${this.priority})`);
      }
    }
  }

  /**
   * Process content by finding and executing all plugin instances
   * Supports both simple [{Plugin}] and body syntax [{Plugin}]content[/{Plugin}]
   * @param content - Content to process
   * @param context - Parse context
   * @returns Content with plugins executed
   */
  async process(content: string, context: ParseContext): Promise<string> {
    if (!content) {
      return content;
    }

    // First pass: Handle body-style plugins [{Plugin}]content[/{Plugin}]
    content = await this.processBodyPlugins(content, context);

    // Second pass: Handle simple plugins [{Plugin params}]
    const matches: PluginMatch[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.pattern.lastIndex = 0;

    while ((match = this.pattern.exec(content)) !== null) {
      matches.push({
        fullMatch: match[0],
        pluginName: match[1] ?? '',
        paramString: match[2] ?? '',
        bodyContent: null, // No body for simple plugins
        index: match.index,
        length: match[0].length
      });
    }

    // Process matches in reverse order to maintain string positions
    let processedContent = content;

    for (let i = matches.length - 1; i >= 0; i--) {
      const matchInfo = matches[i];

      try {
        const replacement = await this.handlePlugin(matchInfo, context);

        // Replace the match with the plugin output
        processedContent =
          processedContent.slice(0, matchInfo.index) +
          replacement +
          processedContent.slice(matchInfo.index + matchInfo.length);

      } catch (error) {
        const err = error as Error;
        logger.error(`Plugin execution error for ${matchInfo.pluginName}: ${err.message}`);
        logger.error(`Stack: ${err.stack}`);

        // Leave original plugin syntax on error for debugging
        const errorPlaceholder = `<!-- Plugin Error: ${matchInfo.pluginName} - ${err.message} -->`;
        processedContent =
          processedContent.slice(0, matchInfo.index) +
          errorPlaceholder +
          processedContent.slice(matchInfo.index + matchInfo.length);
      }
    }

    // Unescape [[{...}] → [{...}] (display literal plugin syntax without executing)
    processedContent = processedContent.replace(/\[\[\{([^}]*)\}\]/g, '[{$1}]');

    return processedContent;
  }

  /**
   * Process body-style plugins: [{Plugin}]content[/{Plugin}]
   * @param content - Content to process
   * @param context - Parse context
   * @returns Content with body plugins processed
   */
  private async processBodyPlugins(content: string, context: PluginParseContext): Promise<string> {
    // Pattern for body plugins: [{PluginName params}]body content[/{PluginName}]
    // [[{ prefix is the escape sequence — not executed
    const bodyPluginRegex = /(?<!\[)\[\{(\w+)\s*([^}]*)\}\](.*?)\[\{\/\1\}\]/gs;

    const bodyMatches: PluginMatch[] = [];
    let match: RegExpExecArray | null;

    while ((match = bodyPluginRegex.exec(content)) !== null) {
      bodyMatches.push({
        fullMatch: match[0],
        pluginName: match[1] ?? '',
        paramString: match[2] ?? '',
        bodyContent: match[3] ?? '',
        index: match.index,
        length: match[0].length
      });
    }

    // Process body matches in reverse order
    let processedContent = content;

    for (let i = bodyMatches.length - 1; i >= 0; i--) {
      const matchInfo = bodyMatches[i];

      try {
        const replacement = await this.handlePlugin(matchInfo, context);

        processedContent =
          processedContent.slice(0, matchInfo.index) +
          replacement +
          processedContent.slice(matchInfo.index + matchInfo.length);

      } catch (error) {
        const err = error as Error;
        logger.error(`Body plugin execution error for ${matchInfo.pluginName}: ${err.message}`);

        const errorPlaceholder = `<!-- Body Plugin Error: ${matchInfo.pluginName} - ${err.message} -->`;
        processedContent =
          processedContent.slice(0, matchInfo.index) +
          errorPlaceholder +
          processedContent.slice(matchInfo.index + matchInfo.length);
      }
    }

    return processedContent;
  }

  /**
   * Handle a specific plugin match with caching support
   * @param matchInfo - Plugin match information
   * @param context - Parse context
   * @returns Plugin output HTML
   */
  private async handlePlugin(matchInfo: PluginMatch, context: PluginParseContext): Promise<string> {
    const { pluginName, paramString } = matchInfo;

    // Parse plugin parameters
    const parameters = this.parsePluginParameters(paramString);

    // Validate parameters
    const validation = this.validatePluginParameters(pluginName, parameters);
    if (!validation.isValid) {
      throw new Error(`Invalid parameters for ${pluginName}: ${validation.errors.join(', ')}`);
    }

    // Check cache for plugin result if caching enabled
    let cachedResult: string | null = null;
    const contentHash = this.generateContentHash(matchInfo.fullMatch);
    const contextHash = this.generateContextHash(context);

    if (this.options.enabled) {
      const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;
      if (markupParser) {
        cachedResult = await markupParser.getCachedHandlerResult(this.handlerId, contentHash, contextHash);
        if (cachedResult) {
          return cachedResult;
        }
      }
    }

    // Get PluginManager
    const pluginManager = context.getManager('PluginManager') as PluginManager | undefined;
    if (!pluginManager) {
      throw new Error('PluginManager not available');
    }

    // Create enhanced plugin execution context
    const pluginContext: Record<string, unknown> = {
      pageName: context.wikiContext?.pageName,
      userName: context.userName,
      userContext: context.wikiContext?.userContext,
      requestInfo: context.requestInfo,
      pageMetadata: context.wikiContext?.pageMetadata,
      query: (context.requestInfo as { query?: Record<string, string> })?.query ?? {},
      engine: context.engine,

      // Enhanced context for JSPWiki compatibility
      wikiContext: context,
      parameters: validation.params,
      bodyContent: matchInfo.bodyContent, // Support for body plugins
      handlerId: this.handlerId,
      markupParser: this.engine?.getManager('MarkupParser'),

      // Link graph for plugins like ReferringPagesPlugin
      linkGraph: this.getLinkGraph(),

      // Additional JSPWiki-compatible context
      hasBody: matchInfo.bodyContent !== null,
      pluginName: pluginName,
      originalMatch: matchInfo.fullMatch
    };

    // Execute plugin with timeout
    const executionPromise = pluginManager.execute(pluginName, context.wikiContext?.pageName ?? 'unknown', validation.params, pluginContext);
    const timeoutPromise = new Promise<string>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Plugin ${pluginName} execution timeout`)), this.options.timeout);
      timer.unref();
    });

    const result = await Promise.race([executionPromise, timeoutPromise]) || '';

    // Cache the result if caching enabled
    if (this.options.enabled && result) {
      const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;
      if (markupParser) {
        await markupParser.cacheHandlerResult(this.handlerId, contentHash, contextHash, result);
      }
    }

    return result;
  }

  /**
   * Generate content hash for caching
   * @param content - Content to hash
   * @returns Content hash
   */
  private generateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Generate context hash for caching
   * @param context - Parse context
   * @returns Context hash
   */
  private generateContextHash(context: PluginParseContext): string {
    const contextData = {
      pageName: context.wikiContext?.pageName,
      userName: context.userName,
      authenticated: context.isAuthenticated?.() ?? false,
      roles: context.getUserRoles?.() ?? [],
      // Round timestamp to 5-minute buckets for cache efficiency
      timeBucket: Math.floor(Date.now() / 300000)
    };

    return crypto.createHash('md5').update(JSON.stringify(contextData)).digest('hex');
  }

  /**
   * Validate plugin parameters
   * @param pluginName - Plugin name
   * @param parameters - Plugin parameters
   * @returns Validation result
   */
  private validatePluginParameters(_pluginName: string, parameters: Record<string, unknown>): PluginValidation {
    // Basic validation - can be extended with plugin-specific schemas
    const errors: string[] = [];
    const validatedParams: Record<string, unknown> = {};

    // Common parameter validation
    for (const [key, value] of Object.entries(parameters)) {
      // Sanitize parameter values for security
      if (typeof value === 'string') {
        // Prevent script injection
        if (value.includes('<script') || value.includes('javascript:')) {
          errors.push(`Parameter ${key} contains potentially unsafe content`);
          continue;
        }
      }

      validatedParams[key] = value;
    }

    return {
      isValid: errors.length === 0,
      errors,
      params: validatedParams
    };
  }

  /**
   * Enhanced parameter parsing with support for complex formats
   * @param paramString - Parameter string to parse
   * @returns Parsed parameters
   */
  private parsePluginParameters(paramString: string): Record<string, unknown> {
    if (!paramString || !paramString.trim()) {
      return {};
    }

    const params: Record<string, unknown> = {};
    // Enhanced regex to handle quoted values with spaces, special characters, and escaped quotes
    // Matches: key='value with \'escaped\' quotes' or key="value" or key=unquoted
    // Note: [\w-]+ allows word characters and dashes (for param names like 'system-category')
    const paramRegex = /([\w-]+)=(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([^\s]+))/g;
    let match: RegExpExecArray | null;

    while ((match = paramRegex.exec(paramString)) !== null) {
      const key = match[1];
      let value = match[2] ?? match[3] ?? match[4] ?? '';

      // Unescape escaped quotes in the value
      if (match[2] || match[3]) {
        value = value.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }

      // Try to parse as JSON for objects/arrays/primitives
      try {
        if (value.startsWith('{') || value.startsWith('[') ||
            value === 'true' || value === 'false' ||
            /^\d+(\.\d+)?$/.test(value)) { // Support decimal numbers
          params[key] = JSON.parse(value);
        } else {
          params[key] = value;
        }
      } catch {
        // If JSON parsing fails, use as string
        params[key] = value;
      }
    }

    return params;
  }

  /**
   * Get supported plugin patterns for this handler
   * @returns Array of supported patterns
   */
  getSupportedPatterns(): string[] {
    return [
      '[{PluginName}]',
      '[{PluginName param=value}]',
      '[{PluginName param1=value1 param2=value2}]',
      "[{PluginName param='quoted value'}]",
      '[{PluginName param="double quoted"}]',
      '[{PluginName}]body content[/{PluginName}]',
      '[{PluginName param=value}]body content with params[/{PluginName}]'
    ];
  }

  /**
   * Get link graph from RenderingManager
   * @returns Link graph object
   */
  private getLinkGraph(): Record<string, unknown> {
    try {
      const renderingManager = this.engine?.getManager('RenderingManager') as RenderingManager | undefined;
      return renderingManager?.getLinkGraph() ?? {};
    } catch (error) {
      const err = error as Error;
      logger.warn(`Failed to get link graph for plugin execution: ${err.message}`);
      return {};
    }
  }

  /**
   * Get handler information for debugging
   * @returns Handler information
   */
  getInfo(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      supportedPatterns: this.getSupportedPatterns(),
      features: [
        'Complex parameter parsing',
        'Quoted value support',
        'JSON parameter parsing',
        'Security validation',
        'Error recovery',
        'Performance tracking',
        'Link graph integration'
      ]
    };
  }
}

export default PluginSyntaxHandler;

