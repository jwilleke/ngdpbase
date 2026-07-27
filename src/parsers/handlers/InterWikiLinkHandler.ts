import BaseSyntaxHandler, { InitializationContext, ParseContext } from './BaseSyntaxHandler.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import logger from '../../utils/logger.js';

/**
 * InterWiki link match information
 */
interface InterWikiMatch {
  fullMatch: string;
  wikiName: string;
  pageName: string;
  displayText: string | null;
  index: number;
  length: number;
}

/**
 * InterWiki site configuration
 */
interface InterWikiSiteConfig {
  url: string;
  description?: string;
  enabled?: boolean;
  openInNewWindow?: boolean;
  icon?: string | null;
}

/**
 * InterWiki configuration file format
 */
interface InterWikiConfigFile {
  interwiki?: Record<string, InterWikiSiteConfig>;
  options?: {
    addIconIndicator?: boolean;
  };
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
 * Configuration manager interface
 */
interface ConfigManager {
  getProperty<T>(key: string, defaultValue?: T): T;
}

/**
 * Available site information
 */
interface AvailableSite {
  name: string;
  url: string;
  description?: string;
  enabled: boolean;
}

/**
 * InterWikiLinkHandler - External wiki linking support
 *
 * Supports JSPWiki InterWiki syntax:
 * - [Wikipedia:Article] - Simple InterWiki link
 * - [Wikipedia:Article|Custom Display Text] - InterWiki with custom text
 * - [MeatBall:WikiWikiWeb] - Multiple InterWiki sites
 *
 * Related Issue: #61 - InterWiki Link Handler
 * Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support
 */
class InterWikiLinkHandler extends BaseSyntaxHandler {
  declare handlerId: string;
  private engine: WikiEngine | null;
  private config: HandlerConfig | null;
  private interWikiSites: Map<string, InterWikiSiteConfig>;
  private interWikiConfig: InterWikiConfigFile | null;

  constructor(engine: WikiEngine | null = null) {
    super(
      /\[([A-Za-z0-9]+):([^|\]]+)(?:\|([^\]]+))?\]/g, // Pattern: [WikiName:PageName|DisplayText]
      80, // Medium priority - process after most syntax handlers
      {
        description: 'JSPWiki-style InterWiki link handler for external wiki linking',
        version: '1.0.0',
        dependencies: ['ConfigurationManager'],
        timeout: 3000
      }
    );
    this.handlerId = 'InterWikiLinkHandler';
    this.engine = engine;
    this.config = null;
    this.interWikiSites = new Map();
    this.interWikiConfig = null;
  }

  /**
   * Initialize handler with configuration and InterWiki sites
   * @param context - Initialization context
   */
  protected async onInitialize(context: InitializationContext): Promise<void> {
    this.engine = context.engine ?? null;

    // Load handler-specific configuration
    const markupParser = context.engine?.getManager('MarkupParser') as MarkupParser | undefined;
    if (markupParser) {
      this.config = markupParser.getHandlerConfig('interwiki');

      if (this.config?.priority && this.config.priority !== this.priority) {
        logger.info(`InterWikiLinkHandler priority configured as ${this.config.priority} (using ${this.priority})`);
      }
    }

    // Load InterWiki site definitions
    await this.loadInterWikiSites();
  }

  /**
   * Load InterWiki site definitions from configuration
   */
  private async loadInterWikiSites(): Promise<void> {
    try {
      // Try to load from config/interwiki.json first
      const interWikiPath = path.join(process.cwd(), 'config', 'interwiki.json');

      try {
        const configContent = await fs.readFile(interWikiPath, 'utf8');
        this.interWikiConfig = JSON.parse(configContent) as InterWikiConfigFile;

        // Load sites from dedicated config file
        if (this.interWikiConfig.interwiki) {
          for (const [siteName, siteConfig] of Object.entries(this.interWikiConfig.interwiki)) {
            if (siteConfig.enabled !== false) {
              this.interWikiSites.set(siteName, siteConfig);
            }
          }
        }

        logger.info(`Loaded ${this.interWikiSites.size} InterWiki sites from config/interwiki.json`);

      } catch {
        // Fall back to loading from main configuration
        await this.loadFromMainConfiguration();
      }

    } catch (error) {
      const err = error as Error;
      logger.warn(`Failed to load InterWiki configuration: ${err.message}`);
      // Load default sites
      this.loadDefaultSites();
    }
  }

  /**
   * Load InterWiki sites from main configuration
   */
  private async loadFromMainConfiguration(): Promise<void> {
    const configManager = this.engine?.getManager('ConfigurationManager') as ConfigManager | undefined;
    if (!configManager) {
      this.loadDefaultSites();
      return;
    }

    // Load from app-default-config.json format
    const sites: Record<string, string | undefined> = {
      'Wikipedia': configManager.getProperty('ngdpbase.interwiki.sites.Wikipedia'),
      'JSPWiki': configManager.getProperty('ngdpbase.interwiki.sites.JSPWiki'),
      'MeatBall': configManager.getProperty('ngdpbase.interwiki.sites.MeatBall'),
      'C2': configManager.getProperty('ngdpbase.interwiki.sites.C2')
    };

    for (const [siteName, url] of Object.entries(sites)) {
      if (url) {
        this.interWikiSites.set(siteName, {
          url: url,
          description: `${siteName} Wiki`,
          enabled: true,
          openInNewWindow: configManager.getProperty('ngdpbase.interwiki.open-in-new-window', true)
        });
      }
    }

    logger.info(`Loaded ${this.interWikiSites.size} InterWiki sites from main configuration`);
  }

  /**
   * Load default InterWiki sites
   */
  private loadDefaultSites(): void {
    const defaultSites: Record<string, InterWikiSiteConfig> = {
      'Wikipedia': {
        url: 'https://en.wikipedia.org/wiki/%s',
        description: 'Wikipedia, the free encyclopedia',
        enabled: true,
        openInNewWindow: true
      },
      'JSPWiki': {
        url: 'https://jspwiki-wiki.apache.org/Wiki.jsp?page=%s',
        description: 'Apache JSPWiki Documentation',
        enabled: true,
        openInNewWindow: true
      },
      'MeatBall': {
        url: 'http://www.usemod.com/cgi-bin/mb.pl?%s',
        description: 'MeatBall Wiki',
        enabled: true,
        openInNewWindow: true
      }
    };

    for (const [siteName, siteConfig] of Object.entries(defaultSites)) {
      this.interWikiSites.set(siteName, siteConfig);
    }

    logger.info(`Loaded ${this.interWikiSites.size} default InterWiki sites`);
  }

  /**
   * Process content by finding and converting InterWiki links
   * @param content - Content to process
   * @param context - Parse context
   * @returns Content with InterWiki links processed
   */
  async process(content: string, context: ParseContext): Promise<string> {
    if (!content) {
      return content;
    }

    const matches: InterWikiMatch[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.pattern.lastIndex = 0;

    while ((match = this.pattern.exec(content)) !== null) {
      matches.push({
        fullMatch: match[0],
        wikiName: match[1] ?? '',
        pageName: match[2] ?? '',
        displayText: match[3] ?? null, // Custom display text
        index: match.index,
        length: match[0].length
      });
    }

    // Process matches in reverse order to maintain string positions
    let processedContent = content;

    for (let i = matches.length - 1; i >= 0; i--) {
      const matchInfo = matches[i];

      try {
        const replacement = await this.handleInterWikiLink(matchInfo, context);

        processedContent =
          processedContent.slice(0, matchInfo.index) +
          replacement +
          processedContent.slice(matchInfo.index + matchInfo.length);

      } catch (error) {
        const err = error as Error;
        logger.error(`InterWiki link error for ${matchInfo.wikiName}:${matchInfo.pageName}: ${err.message}`);

        // Leave original link on error
        const errorPlaceholder = `<!-- InterWiki Error: ${matchInfo.wikiName} - ${err.message} -->`;
        processedContent =
          processedContent.slice(0, matchInfo.index) +
          errorPlaceholder +
          processedContent.slice(matchInfo.index + matchInfo.length);
      }
    }

    return processedContent;
  }

  /**
   * Handle a specific InterWiki link match
   * @param matchInfo - InterWiki link match information
   * @param context - Parse context
   * @returns InterWiki link HTML
   */
  private async handleInterWikiLink(matchInfo: InterWikiMatch, context: ParseContext): Promise<string> {
    const { wikiName, pageName, displayText } = matchInfo;

    // Check cache for link result if caching enabled
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

    // Find the InterWiki site configuration
    const siteConfig = this.findInterWikiSite(wikiName);
    if (!siteConfig) {
      throw new Error(`Unknown InterWiki site: ${wikiName}`);
    }

    // Generate the external URL
    const externalUrl = this.generateInterWikiUrl(siteConfig.url, pageName);

    // Validate URL security
    if (!this.isUrlSafe(externalUrl)) {
      throw new Error(`Unsafe InterWiki URL generated: ${externalUrl}`);
    }

    // Strip legacy JSPWiki target= attribute syntax misused as display text.
    // Interwiki links are always external; target="_blank" is applied automatically.
    const effectiveDisplay = (displayText && /^target=/i.test(displayText.trim())) ? null : displayText;

    // Generate link HTML
    const linkHtml = this.generateLinkHtml(externalUrl, effectiveDisplay || `${wikiName}:${pageName}`, siteConfig, wikiName);

    // Cache the result if caching enabled
    if (this.options.enabled && linkHtml) {
      const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;
      if (markupParser) {
        await markupParser.cacheHandlerResult(this.handlerId, contentHash, contextHash, linkHtml);
      }
    }

    return linkHtml;
  }

  /**
   * Find InterWiki site configuration (case-insensitive)
   * @param wikiName - Wiki site name
   * @returns Site configuration or null
   */
  private findInterWikiSite(wikiName: string): InterWikiSiteConfig | undefined {
    // Try exact match first
    if (this.interWikiSites.has(wikiName)) {
      return this.interWikiSites.get(wikiName);
    }

    // Try case-insensitive match
    const lowerWikiName = wikiName.toLowerCase();
    for (const [siteName, siteConfig] of this.interWikiSites) {
      if (siteName.toLowerCase() === lowerWikiName) {
        return siteConfig;
      }
    }

    return undefined;
  }

  /**
   * Generate InterWiki URL from template
   * @param urlTemplate - URL template with %s placeholder
   * @param pageName - Page name to substitute
   * @returns Generated URL
   */
  private generateInterWikiUrl(urlTemplate: string, pageName: string): string {
    // URL encode the page name
    const encodedPageName = encodeURIComponent(pageName);

    // Replace %s placeholder with encoded page name
    return urlTemplate.replace(/%s/g, encodedPageName);
  }

  /**
   * Validate URL safety to prevent injection attacks
   * @param url - URL to validate
   * @returns True if URL is safe
   */
  private isUrlSafe(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // Allow only http and https protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Basic domain validation (prevent suspicious patterns)
      if (urlObj.hostname.includes('..') || urlObj.hostname.includes('localhost')) {
        return false;
      }

      return true;

    } catch {
      return false; // Invalid URL format
    }
  }

  /**
   * Generate link HTML with appropriate attributes
   * @param url - External URL
   * @param displayText - Link display text
   * @param siteConfig - Site configuration
   * @param wikiName - Wiki site name
   * @returns Link HTML
   */
  private generateLinkHtml(url: string, displayText: string, siteConfig: InterWikiSiteConfig, wikiName: string): string {
    const openInNewWindow = siteConfig.openInNewWindow !== false;
    const showIcon = this.interWikiConfig?.options?.addIconIndicator !== false;

    let linkHtml = `<a href="${this.escapeHtml(url)}" class="interwiki-link interwiki-${wikiName.toLowerCase()}"`;

    // Add target and rel attributes for external links
    if (openInNewWindow) {
      linkHtml += ' target="_blank" rel="noopener noreferrer"';
    }

    // Add title attribute
    if (siteConfig.description) {
      linkHtml += ` title="${this.escapeHtml(siteConfig.description)}: ${this.escapeHtml(displayText)}"`;
    }

    linkHtml += '>';

    // Add icon if configured
    if (showIcon && siteConfig.icon) {
      linkHtml += `<img src="/icons/${siteConfig.icon}" alt="${this.escapeHtml(wikiName)}" class="interwiki-icon"> `;
    }

    linkHtml += this.escapeHtml(displayText);
    linkHtml += '</a>';

    return linkHtml;
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
  private generateContextHash(context: ParseContext): string {
    const contextData = {
      pageName: context.wikiContext?.pageName,
      userName: context.userName,
      // InterWiki links are generally context-independent, so minimal hash
      timeBucket: Math.floor(Date.now() / 3600000) // 1-hour buckets
    };

    return crypto.createHash('md5').update(JSON.stringify(contextData)).digest('hex');
  }

  /**
   * Escape HTML characters to prevent XSS
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
   * Get available InterWiki sites
   * @returns Array of available sites
   */
  getAvailableSites(): AvailableSite[] {
    return Array.from(this.interWikiSites.entries()).map(([name, config]) => ({
      name,
      url: config.url,
      description: config.description,
      enabled: config.enabled !== false
    }));
  }

  /**
   * Add new InterWiki site (for dynamic configuration)
   * @param name - Site name
   * @param config - Site configuration
   * @returns True if added successfully
   */
  addInterWikiSite(name: string, config: InterWikiSiteConfig): boolean {
    if (!name || !config.url) {
      return false;
    }

    // Validate URL template
    if (!config.url.includes('%s')) {
      logger.warn(`InterWiki site ${name} URL should contain %s placeholder`);
    }

    // Validate URL safety
    const testUrl = this.generateInterWikiUrl(config.url, 'Test');
    if (!this.isUrlSafe(testUrl)) {
      logger.warn(`InterWiki site ${name} generates unsafe URLs`);
      return false;
    }

    this.interWikiSites.set(name, {
      url: config.url,
      description: config.description || `${name} Wiki`,
      enabled: config.enabled !== false,
      openInNewWindow: config.openInNewWindow !== false,
      icon: config.icon || null
    });

    logger.info(`Added InterWiki site: ${name}`);
    return true;
  }

  /**
   * Remove InterWiki site
   * @param name - Site name to remove
   * @returns True if removed successfully
   */
  removeInterWikiSite(name: string): boolean {
    if (this.interWikiSites.has(name)) {
      this.interWikiSites.delete(name);
      logger.info(`Removed InterWiki site: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * Reload InterWiki configuration (hot reload support)
   */
  async reloadConfiguration(): Promise<void> {
    this.interWikiSites.clear();
    await this.loadInterWikiSites();
  }

  /**
   * Get supported InterWiki patterns
   * @returns Array of supported patterns
   */
  getSupportedPatterns(): string[] {
    return [
      '[Wikipedia:Article]',
      '[Wikipedia:Article|Custom Display Text]',
      '[JSPWiki:PluginDevelopment]',
      '[MeatBall:WikiWikiWeb]',
      '[C2:ExtremeProgramming|XP on C2]'
    ];
  }

  /**
   * Get handler information for debugging and documentation
   * @returns Handler information
   */
  getInfo(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      supportedPatterns: this.getSupportedPatterns(),
      availableSites: this.getAvailableSites(),
      features: [
        'External wiki linking',
        'Case-insensitive wiki names',
        'Custom display text support',
        'URL encoding and validation',
        'Security protection (protocol validation)',
        'Configurable site definitions',
        'Icon support for visual indicators',
        'New window/tab control',
        'Hot-reload configuration',
        'Performance caching'
      ],
      configuration: {
        sitesLoaded: this.interWikiSites.size,
        configSource: this.interWikiConfig ? 'config/interwiki.json' : 'main configuration',
        cacheEnabled: this.options.enabled
      }
    };
  }
}

export default InterWikiLinkHandler;

