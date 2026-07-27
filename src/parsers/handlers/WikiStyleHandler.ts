import BaseSyntaxHandler, { InitializationContext, ParseContext } from './BaseSyntaxHandler.js';
import * as crypto from 'crypto';
import logger from '../../utils/logger.js';

/**
 * Style match information
 */
interface StyleMatch {
  fullMatch: string;
  styleInfo: string;
  textContent: string;
  index: number;
  length: number;
}

/**
 * Style configuration
 */
interface StyleConfig {
  customClasses: boolean;
  bootstrap: boolean;
  allowInlineCSS: boolean;
  securityValidation: boolean;
  cacheStyles: boolean;
}

/**
 * Handler configuration
 */
interface HandlerConfig {
  enabled?: boolean;
  priority?: number;
}

/**
 * Wiki engine interface
 */
interface WikiEngine {
  getManager(name: string): unknown;
}

/**
 * Configuration manager interface
 */
interface ConfigManager {
  getProperty<T>(key: string, defaultValue: T): T;
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
 * WikiStyleHandler - CSS class assignment and inline styling for wiki content
 *
 * Supports JSPWiki WikiStyle syntax:
 * - %%class-name text content /% - CSS class assignment
 * - %%class1 class2 text content /% - Multiple CSS classes
 * - %%(color:red) inline styled text/% - Inline CSS (configurable security)
 * - %%text-center centered content /% - Bootstrap integration
 *
 * Related Issue: WikiStyle Handler (Phase 3)
 * Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support
 */
class WikiStyleHandler extends BaseSyntaxHandler {
  declare handlerId: string;
  private engine: WikiEngine | null;
  private config: HandlerConfig | null;
  private styleConfig: StyleConfig;
  private predefinedClasses: Set<string>;
  private allowedCSSProperties: Set<string>;

  constructor(engine: WikiEngine | null = null) {
    super(
      /%%([^%]+?)\s+([\s\S]*?)\s*\/%/g, // Pattern: %%style-info content /% - [\s\S]*? matches across newlines
      70, // Medium priority - process after most content handlers
      {
        description: 'JSPWiki-style CSS class and inline styling handler with security validation',
        version: '1.0.0',
        dependencies: ['ConfigurationManager'],
        timeout: 3000,
        cacheEnabled: true
      }
    );
    this.handlerId = 'WikiStyleHandler';
    this.engine = engine;
    this.config = null;
    this.styleConfig = {
      customClasses: true,
      bootstrap: true,
      allowInlineCSS: false,
      securityValidation: true,
      cacheStyles: true
    };
    this.predefinedClasses = new Set();
    this.allowedCSSProperties = new Set();
  }

  /**
   * Initialize handler with modular configuration system
   * @param context - Initialization context
   */
  protected async onInitialize(context: InitializationContext): Promise<void> {
    this.engine = context.engine ?? null;

    // Load modular configuration from multiple sources
    this.loadModularStyleConfiguration();

    logger.debug('WikiStyleHandler initialized with modular configuration:');
    logger.debug(`   Custom classes: ${this.styleConfig.customClasses ? 'enabled' : 'disabled'}`);
    logger.debug(`   Bootstrap: ${this.styleConfig.bootstrap ? 'enabled' : 'disabled'}`);
    logger.debug(`   Inline CSS: ${this.styleConfig.allowInlineCSS ? 'enabled' : 'disabled'}`);
    logger.debug(`   Predefined classes: ${this.predefinedClasses.size} loaded`);
  }

  /**
   * Load modular style configuration from app-default-config.json and app-custom-config.json
   * Demonstrates complete configuration modularity and reusability
   */
  private loadModularStyleConfiguration(): void {
    const configManager = this.engine?.getManager('ConfigurationManager') as ConfigManager | undefined;
    const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;

    // Get base handler configuration
    if (markupParser) {
      this.config = markupParser.getHandlerConfig('style');

      if (this.config?.priority && this.config.priority !== this.priority) {
        logger.debug(`WikiStyleHandler priority configured as ${this.config.priority} (using ${this.priority})`);
      }
    }

    // Load from app-default-config.json and allow app-custom-config.json overrides
    if (configManager) {
      try {
        // Main style configuration (modular)
        this.styleConfig.customClasses = configManager.getProperty('ngdpbase.style.custom-classes.enabled', this.styleConfig.customClasses);
        this.styleConfig.bootstrap = configManager.getProperty('ngdpbase.style.bootstrap.integration', this.styleConfig.bootstrap);
        this.styleConfig.allowInlineCSS = configManager.getProperty('ngdpbase.style.security.allow-inline-css', this.styleConfig.allowInlineCSS);

        // Load predefined class sets (modular class definitions)
        this.loadPredefinedClasses(configManager);

        // Load allowed CSS properties for security (modular security configuration)
        this.loadAllowedCSSProperties(configManager);

      } catch (error) {
        const err = error as Error;
        logger.warn('Failed to load WikiStyleHandler configuration, using defaults:', err.message);
        this.loadDefaultConfiguration();
      }
    } else {
      this.loadDefaultConfiguration();
    }
  }

  /**
   * Load predefined CSS classes from configuration (modular class system)
   * @param configManager - Configuration manager
   */
  private loadPredefinedClasses(configManager: ConfigManager): void {
    // Load text styling classes
    const textClasses = configManager.getProperty('ngdpbase.style.predefined.text', '').split(',');
    textClasses.forEach((cls: string) => cls.trim() && this.predefinedClasses.add(cls.trim()));

    // Load background classes
    const backgroundClasses = configManager.getProperty('ngdpbase.style.predefined.background', '').split(',');
    backgroundClasses.forEach((cls: string) => cls.trim() && this.predefinedClasses.add(cls.trim()));

    // Load layout classes
    const layoutClasses = configManager.getProperty('ngdpbase.style.predefined.layout', '').split(',');
    layoutClasses.forEach((cls: string) => cls.trim() && this.predefinedClasses.add(cls.trim()));

    // Load any custom predefined classes
    const customClasses = configManager.getProperty('ngdpbase.style.predefined.custom', '').split(',');
    customClasses.forEach((cls: string) => cls.trim() && this.predefinedClasses.add(cls.trim()));
  }

  /**
   * Load allowed CSS properties for security (modular security configuration)
   * @param configManager - Configuration manager
   */
  private loadAllowedCSSProperties(configManager: ConfigManager): void {
    const allowedProps = configManager.getProperty('ngdpbase.style.security.allowed-properties', '').split(',');
    allowedProps.forEach((prop: string) => prop.trim() && this.allowedCSSProperties.add(prop.trim()));

    // Add default safe properties if none configured
    if (this.allowedCSSProperties.size === 0) {
      ['color', 'background-color', 'font-weight', 'font-style', 'text-align'].forEach(prop => {
        this.allowedCSSProperties.add(prop);
      });
    }
  }

  /**
   * Load default configuration when ConfigurationManager unavailable (modular fallback)
   */
  private loadDefaultConfiguration(): void {
    // Default predefined classes (Bootstrap-compatible + JSPWiki table styles)
    const defaultClasses = [
      // Text styling
      'text-primary', 'text-secondary', 'text-success', 'text-danger', 'text-warning', 'text-info',
      'text-muted', 'text-white', 'text-dark',

      // Background styling
      'bg-primary', 'bg-secondary', 'bg-success', 'bg-danger', 'bg-warning', 'bg-info',
      'bg-light', 'bg-dark', 'bg-white',

      // Layout and alignment
      'text-center', 'text-left', 'text-right', 'text-justify',
      'float-left', 'float-right', 'clearfix',

      // Typography
      'fw-bold', 'fw-normal', 'fw-light', 'fst-italic', 'fst-normal',
      'text-decoration-underline', 'text-decoration-line-through',

      // JSPWiki table classes
      'sortable', 'table-filter', 'zebra-table', 'table-striped', 'table-hover',
      'table-fit', 'table-bordered', 'table-sm', 'table-responsive',

      // JSPWiki block classes
      'collapse', 'collapsebox', 'columns', 'quote', 'information', 'warning', 'error',
      'commentbox', 'ltr', 'rtl', 'small', 'sub', 'sup', 'strike', 'center'
    ];

    defaultClasses.forEach(cls => this.predefinedClasses.add(cls));

    // Default allowed CSS properties
    ['color', 'background-color', 'font-weight', 'font-style', 'text-align', 'text-decoration'].forEach(prop => {
      this.allowedCSSProperties.add(prop);
    });
  }

  /**
   * Process content by finding and applying WikiStyle syntax
   * Handles nested blocks by processing them recursively from innermost to outermost
   * @param content - Content to process
   * @param context - Parse context
   * @returns Content with styles applied
   */
  async process(content: string, context: ParseContext): Promise<string> {
    if (!content) {
      return content;
    }

    // Process nested blocks recursively by finding innermost blocks first
    let processedContent = content;
    let hasChanges = true;
    let iterations = 0;
    const maxIterations = 20; // Prevent infinite loops

    while (hasChanges && iterations < maxIterations) {
      hasChanges = false;
      iterations++;

      const matches: StyleMatch[] = [];
      let match: RegExpExecArray | null;

      // Reset regex state
      this.pattern.lastIndex = 0;

      while ((match = this.pattern.exec(processedContent)) !== null) {
        logger.debug(`WikiStyleHandler REGEX MATCH:
          Full match: "${match[0].substring(0, 100)}..."
          Group 1 (styleInfo): "${match[1]}"
          Group 2 (content): "${(match[2] ?? '').substring(0, 100)}..."`);

        matches.push({
          fullMatch: match[0],
          styleInfo: (match[1] ?? '').trim(), // CSS classes or inline styles
          textContent: (match[2] ?? '').trim(), // Content to style
          index: match.index,
          length: match[0].length
        });
      }

      if (matches.length === 0) {
        break;
      }

      // Process matches in reverse order to maintain string positions
      for (let i = matches.length - 1; i >= 0; i--) {
        const matchInfo = matches[i];
        logger.debug(`WikiStyleHandler: Processing match ${i}: styleInfo="${matchInfo.styleInfo}", content preview="${matchInfo.textContent.substring(0, 50)}..."`);

        try {
          const replacement = await this.handleStyle(matchInfo, context);
          logger.debug(`WikiStyleHandler: Replacement preview: "${replacement.substring(0, 100)}..."`);


          // Only replace if the content changed
          if (replacement !== matchInfo.fullMatch) {
            processedContent =
              processedContent.slice(0, matchInfo.index) +
              replacement +
              processedContent.slice(matchInfo.index + matchInfo.length);
            hasChanges = true;
          }

        } catch (error) {
          const err = error as Error;
          logger.error('WikiStyle processing error:', err.message);

          // Leave original content on error for debugging
          const errorPlaceholder = `<!-- WikiStyle Error: ${err.message} -->`;
          processedContent =
            processedContent.slice(0, matchInfo.index) +
            errorPlaceholder + matchInfo.textContent +
            processedContent.slice(matchInfo.index + matchInfo.length);
          hasChanges = true;
        }
      }
    }

    if (iterations >= maxIterations) {
      logger.warn('WikiStyleHandler: Max iterations reached, possible infinite loop');
    }

    return processedContent;
  }

  /**
   * Handle a specific WikiStyle match with modular processing
   * @param matchInfo - Style match information
   * @param context - Parse context
   * @returns Styled content HTML
   */
  private async handleStyle(matchInfo: StyleMatch, context: ParseContext): Promise<string> {
    const { styleInfo, textContent } = matchInfo;

    // Check cache for style result if caching enabled
    if (this.options.cacheEnabled) {
      const cachedResult = await this.getCachedStyleResult(matchInfo, context);
      if (cachedResult) {
        return cachedResult;
      }
    }

    let styledHtml: string;

    // Determine if styleInfo contains CSS classes or inline styles
    if (styleInfo.includes(':')) {
      // Inline CSS style: %%(color:red; font-weight:bold) content /%
      styledHtml = this.processInlineStyle(styleInfo, textContent);
    } else {
      // CSS class assignment: %%class1 class2 content /%
      styledHtml = this.processCSSClasses(styleInfo, textContent);
    }

    // Cache the result if caching enabled
    if (this.options.cacheEnabled && styledHtml) {
      await this.cacheStyleResult(matchInfo, context, styledHtml);
    }

    return styledHtml;
  }

  /**
   * Process CSS class assignment (modular class handling)
   * @param classInfo - CSS class information
   * @param content - Content to style
   * @returns Styled HTML
   */
  private processCSSClasses(classInfo: string, content: string): string {
    logger.debug(`processCSSClasses: classInfo="${classInfo}", content preview="${content.substring(0, 50)}"`);

    const classNames = classInfo.split(/\s+/).filter(cls => cls.trim());
    const validClasses: string[] = [];

    // Validate each class (modular security)
    for (const className of classNames) {
      if (this.isValidCSSClass(className)) {
        validClasses.push(className);
      } else {
        logger.warn(`Invalid or unsafe CSS class rejected: ${className}`);
      }
    }

    if (validClasses.length === 0) {
      // No valid classes, return content without styling
      logger.debug('processCSSClasses: No valid classes, returning content as-is');
      return content;
    }

    const classAttribute = validClasses.join(' ');
    logger.debug(`processCSSClasses: classAttribute="${classAttribute}"`);


    // Table-specific classes that need to be applied to <table> elements
    const tableClasses = ['sortable', 'table-filter', 'zebra-table', 'table-striped',
      'table-hover', 'table-fit', 'table-bordered', 'table-sm',
      'table-responsive'];

    const hasTableClass = validClasses.some(cls => tableClasses.includes(cls));

    // Check if content contains JSPWiki table syntax or HTML table
    const hasTableSyntax = /(\|\||<table)/i.test(content);

    if (hasTableClass && hasTableSyntax) {
      // For table content, inject marker RIGHT BEFORE the table syntax
      // This ensures each %%table-style ... /% block only affects ITS table

      // Find the first table row and inject marker before it
      const tableRowMatch = content.match(/^\s*\|\|/m);
      if (tableRowMatch && tableRowMatch.index !== undefined) {
        const tableStartIndex = tableRowMatch.index;
        const before = content.substring(0, tableStartIndex);
        const tableAndAfter = content.substring(tableStartIndex);
        return `${before}%%TABLE_CLASSES{${this.escapeHtml(classAttribute)}}%%${tableAndAfter}`;
      }

      // Fallback: no table found, return content as-is
      return content;
    }

    // Check if content already has HTML tags (is already processed)
    if (/<[a-z][\s\S]*>/i.test(content)) {
      // Try to apply class to existing HTML element
      const existingTable = content.match(/<table([^>]*)>/i);
      if (existingTable && hasTableClass) {
        // Add classes to existing table tag
        const existingClasses = existingTable[1]?.match(/class=["']([^"']*)["']/);
        if (existingClasses) {
          const mergedClasses = `${existingClasses[1]} ${classAttribute}`;
          return content.replace(/<table([^>]*)>/i,
            `<table${(existingTable[1] ?? '').replace(/class=["'][^"']*["']/, `class="${this.escapeHtml(mergedClasses)}"`)}>`);
        } else {
          return content.replace(/<table([^>]*)>/i,
            `<table${existingTable[1] ?? ''} class="${this.escapeHtml(classAttribute)}">`);
        }
      }
      // Wrap other HTML content in div
      return `<div class="${this.escapeHtml(classAttribute)}">${content}</div>`;
    }

    // For non-table content or inline content without HTML, use div for block classes
    const blockClasses = ['information', 'warning', 'error', 'quote', 'commentbox',
      'center', 'columns', 'collapse', 'collapsebox'];
    const hasBlockClass = validClasses.some(cls => blockClasses.includes(cls));

    if (hasBlockClass || content.includes('\n')) {
      return `<div class="${this.escapeHtml(classAttribute)}">${content}</div>`;
    }

    // Default: use span for inline content
    return `<span class="${this.escapeHtml(classAttribute)}">${content}</span>`;
  }

  /**
   * Process inline CSS styles (modular security validation)
   * @param styleInfo - Inline style information
   * @param content - Content to style
   * @returns Styled HTML
   */
  private processInlineStyle(styleInfo: string, content: string): string {
    if (!this.styleConfig.allowInlineCSS) {
      logger.warn('Inline CSS disabled by security configuration');
      return content; // Return unstyled content
    }

    // Parse CSS properties from parentheses: (color:red; font-weight:bold)
    const cssMatch = styleInfo.match(/^\((.+)\)$/);
    if (!cssMatch) {
      throw new Error('Invalid inline style format, expected: (property:value)');
    }

    const cssDeclarations = cssMatch[1] ?? '';
    const validStyles = this.validateInlineCSS(cssDeclarations);

    if (validStyles.length === 0) {
      logger.warn('No valid CSS properties found in inline style');
      return content;
    }

    const styleAttribute = validStyles.join('; ');
    return `<span style="${this.escapeHtml(styleAttribute)}">${content}</span>`;
  }

  /**
   * Validate CSS class name (modular validation system)
   * @param className - CSS class name to validate
   * @returns True if valid and safe
   */
  private isValidCSSClass(className: string): boolean {
    // Security validation - prevent dangerous class names
    if (this.containsDangerousContent(className)) {
      return false;
    }

    // Check against predefined classes (most secure)
    if (this.predefinedClasses.has(className)) {
      return true;
    }

    // Allow custom classes if enabled and they follow naming conventions
    if (this.styleConfig.customClasses) {
      // Valid CSS class name pattern
      const validClassPattern = /^[a-zA-Z][\w-]*$/;
      return validClassPattern.test(className);
    }

    return false;
  }

  /**
   * Validate inline CSS declarations (modular security system)
   * @param cssDeclarations - CSS declarations string
   * @returns Array of valid CSS declarations
   */
  private validateInlineCSS(cssDeclarations: string): string[] {
    const validDeclarations: string[] = [];
    const declarations = cssDeclarations.split(';').map(decl => decl.trim()).filter(decl => decl);

    for (const declaration of declarations) {
      const parts = declaration.split(':').map(part => part.trim());
      const property = parts[0];
      const value = parts[1];

      if (!property || !value) {
        continue;
      }

      // Validate CSS property (modular security)
      if (!this.isAllowedCSSProperty(property)) {
        logger.warn(`CSS property '${property}' not allowed by security configuration`);
        continue;
      }

      // Validate CSS value (modular security)
      if (!this.isValidCSSValue(value)) {
        logger.warn(`CSS value '${value}' contains potentially unsafe content`);
        continue;
      }

      validDeclarations.push(`${property}: ${value}`);
    }

    return validDeclarations;
  }

  /**
   * Check if CSS property is allowed (modular security configuration)
   * @param property - CSS property name
   * @returns True if allowed
   */
  private isAllowedCSSProperty(property: string): boolean {
    return this.allowedCSSProperties.has(property.toLowerCase());
  }

  /**
   * Validate CSS value for security (modular security validation)
   * @param value - CSS value to validate
   * @returns True if safe
   */
  private isValidCSSValue(value: string): boolean {
    // Prevent dangerous CSS values
    const dangerousPatterns = [
      /javascript:/i,
      /expression\s*\(/i,
      /url\s*\(/i,
      /@import/i,
      /behavior\s*:/i,
      /-moz-binding/i
    ];

    return !dangerousPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Check for dangerous content in class names (modular security)
   * @param content - Content to check
   * @returns True if dangerous content found
   */
  private containsDangerousContent(content: string): boolean {
    const dangerousPatterns = [
      /[<>]/,           // HTML tags
      /javascript:/i,   // JavaScript URLs
      /on\w+=/i,        // Event handlers
      /style\s*=/i,     // Inline style attributes
      /expression/i     // CSS expressions
    ];

    return dangerousPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Get cached style result
   * @param matchInfo - Style match information
   * @param context - Parse context
   * @returns Cached result or null
   */
  private async getCachedStyleResult(matchInfo: StyleMatch, context: ParseContext): Promise<string | null> {
    const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;
    if (!markupParser) {
      return null;
    }

    const contentHash = this.generateContentHash(matchInfo.fullMatch);
    const contextHash = this.generateContextHash(context);

    return await markupParser.getCachedHandlerResult(this.handlerId, contentHash, contextHash);
  }

  /**
   * Cache style result
   * @param matchInfo - Style match information
   * @param context - Parse context
   * @param result - HTML result to cache
   */
  private async cacheStyleResult(matchInfo: StyleMatch, context: ParseContext, result: string): Promise<void> {
    const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;
    if (!markupParser) {
      return;
    }

    const contentHash = this.generateContentHash(matchInfo.fullMatch);
    const contextHash = this.generateContextHash(context);

    await markupParser.cacheHandlerResult(this.handlerId, contentHash, contextHash, result);
  }

  /**
   * Generate content hash for caching (modular caching)
   * @param content - Content to hash
   * @returns Content hash
   */
  private generateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Generate context hash for caching (modular caching)
   * @param _context - Parse context
   * @returns Context hash
   */
  private generateContextHash(_context: ParseContext): string {
    const contextData = {
      // Style processing is generally context-independent
      // But include basic context for cache variation
      timeBucket: Math.floor(Date.now() / 3600000) // 1-hour buckets
    };

    return crypto.createHash('md5').update(JSON.stringify(contextData)).digest('hex');
  }

  /**
   * Escape HTML to prevent XSS (modular security)
   * @param text - Text to escape
   * @returns Escaped text
   */
  private escapeHtml(text: string): string {
    if (typeof text !== 'string') {
      return text;
    }

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Get configuration summary for debugging (modular introspection)
   * @returns Configuration summary
   */
  getConfigurationSummary(): Record<string, unknown> {
    return {
      handler: {
        enabled: this.config?.enabled || false,
        priority: this.priority,
        cacheEnabled: Boolean(this.options.cacheEnabled)
      },
      features: {
        customClasses: this.styleConfig?.customClasses || false,
        bootstrap: this.styleConfig?.bootstrap || false,
        allowInlineCSS: this.styleConfig?.allowInlineCSS || false,
        securityValidation: this.styleConfig?.securityValidation || true
      },
      security: {
        predefinedClassCount: this.predefinedClasses.size,
        allowedCSSPropertyCount: this.allowedCSSProperties.size,
        inlineCSSAllowed: this.styleConfig?.allowInlineCSS || false
      },
      classes: {
        predefined: Array.from(this.predefinedClasses).slice(0, 10), // Show first 10
        total: this.predefinedClasses.size
      }
    };
  }

  /**
   * Get supported style patterns (modular documentation)
   * @returns Array of supported patterns
   */
  getSupportedPatterns(): string[] {
    return [
      '%%text-primary Important text /%',
      '%%bg-warning text-center Warning message /%',
      '%%fw-bold Custom bold text /%',
      '%%(color:red) Red text /% (if inline CSS enabled)',
      '%%(color:blue; font-weight:bold) Blue bold text /% (if inline CSS enabled)'
    ];
  }

  /**
   * Get predefined CSS classes organized by category (modular organization)
   * @returns Categorized predefined classes
   */
  getPredefinedClassesByCategory(): Record<string, string[]> {
    const categories: Record<string, string[]> = {
      text: [],
      background: [],
      layout: [],
      typography: [],
      other: []
    };

    for (const className of this.predefinedClasses) {
      if (className.startsWith('text-')) {
        categories.text.push(className);
      } else if (className.startsWith('bg-')) {
        categories.background.push(className);
      } else if (className.includes('center') || className.includes('left') || className.includes('right') || className.includes('float')) {
        categories.layout.push(className);
      } else if (className.includes('fw-') || className.includes('fst-') || className.includes('decoration')) {
        categories.typography.push(className);
      } else {
        categories.other.push(className);
      }
    }

    return categories;
  }

  /**
   * Add custom CSS class (modular extensibility)
   * @param className - Class name to add
   * @returns True if added successfully
   */
  addCustomClass(className: string): boolean {
    if (this.isValidCSSClass(className) && !this.predefinedClasses.has(className)) {
      this.predefinedClasses.add(className);
      logger.debug(`Added custom CSS class: ${className}`);
      return true;
    }
    return false;
  }

  /**
   * Remove custom CSS class (modular management)
   * @param className - Class name to remove
   * @returns True if removed successfully
   */
  removeCustomClass(className: string): boolean {
    if (this.predefinedClasses.has(className)) {
      this.predefinedClasses.delete(className);
      logger.debug(`Removed custom CSS class: ${className}`);
      return true;
    }
    return false;
  }

  /**
   * Get handler information for debugging and documentation (modular introspection)
   * @returns Handler information
   */
  getInfo(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      supportedPatterns: this.getSupportedPatterns(),
      configuration: this.getConfigurationSummary(),
      predefinedClasses: this.getPredefinedClassesByCategory(),
      features: [
        'CSS class assignment',
        'Bootstrap integration',
        'Inline CSS support (security-controlled)',
        'Predefined class library',
        'Custom class support',
        'Security validation',
        'XSS prevention',
        'Modular configuration system',
        'Hot-reload configuration',
        'Performance caching'
      ],
      security: [
        'CSS injection prevention',
        'Property whitelist validation',
        'Class name validation',
        'Dangerous content filtering',
        'Configurable security levels'
      ],
      configurationSources: [
        'app-default-config.json (base configuration)',
        'app-custom-config.json (user overrides)',
        'MarkupParser handler configuration',
        'Runtime class additions'
      ]
    };
  }
}

export default WikiStyleHandler;

