import BaseSyntaxHandler, { InitializationContext, ParseContext } from './BaseSyntaxHandler.js';
import { LinkParser, type InterWikiSiteConfig, type ParserStats } from '../LinkParser.js';
import fs from 'fs-extra';
import path from 'path';
import logger from '../../utils/logger.js';

/**
 * Wiki engine interface
 */
interface WikiEngine {
  getManager(name: string): unknown;
}

/**
 * Page manager interface
 */
interface PageManager {
  getAllPages(): Promise<string[]>;
}

/**
 * Configuration manager interface
 */
interface ConfigManager {
  getProperty<T>(key: string, defaultValue?: T): T;
}

/**
 * InterWiki site definition from config
 */
interface InterWikiSiteDef {
  url: string;
  description?: string;
  icon?: string;
  enabled?: boolean;
  openInNewWindow?: boolean;
}

/**
 * Local handler statistics (separate from base class stats)
 */
interface LocalStats {
  processCount: number;
  totalProcessingTime: number;
  errorCount: number;
}

/**
 * LinkParserHandler - Unified link processing handler using LinkParser
 *
 * This handler integrates the comprehensive LinkParser into the MarkupParser
 * handler architecture, providing centralized processing for all link types:
 * - Internal wiki links: [PageName], [Display|Target]
 * - External links: [Display|http://example.com]
 * - InterWiki links: [Display|Wikipedia:Article]
 * - Email links: [Display|mailto:user@example.com]
 * - Anchor links: [Display|#section]
 * - Links with attributes: [Display|Target|class="custom" target="_blank"]
 *
 * Replaces the fragmented WikiLinkHandler and InterWikiLinkHandler approach
 * with a unified, security-focused, and comprehensive solution.
 *
 * Related Issue: #75 - Create LinkParser.js for centralized link parsing
 * Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support
 */
class LinkParserHandler extends BaseSyntaxHandler {
  declare handlerId: string;
  private engine: WikiEngine | null;
  private linkParser: LinkParser;
  declare initialized: boolean;
  private localStats: LocalStats;
  private matchEnglishPlurals: boolean = true;
  private matchCamelCase: boolean = false;

  constructor(engine: WikiEngine | null = null) {
    super(
      // Use LinkParser's regex pattern - matches all supported link types
      // Excludes markdown footnote syntax [^id] by using negative lookahead (?!\^)
      /\[(?!\^)([^|\]]+)(?:\|([^|\]]+))?(?:\|([^\]]+))?\](?!\()/g,
      60, // Medium-high priority - process links after most syntax but before markdown
      {
        description: 'Unified link processor using centralized LinkParser for all link types',
        version: '1.0.0',
        dependencies: ['PageManager'],
        timeout: 5000
      }
    );

    this.handlerId = 'LinkParserHandler';
    this.engine = engine;
    this.linkParser = new LinkParser();
    this.initialized = false;
    this.localStats = {
      processCount: 0,
      totalProcessingTime: 0,
      errorCount: 0
    };
  }

  /**
   * Initialize handler with LinkParser configuration
   * @param context - Initialization context
   */
  protected async onInitialize(context: InitializationContext): Promise<void> {
    try {
      this.engine = context.engine ?? null;

      // Initialize LinkParser with page names from PageManager
      await this.initializeLinkParser();

      this.initialized = true;
      logger.info('LinkParserHandler initialized successfully with centralized link processing');

    } catch (error) {
      const err = error as Error;
      logger.error(`Failed to initialize LinkParserHandler: ${err.message}`);
      throw error;
    }
  }

  /**
   * Initialize LinkParser with current page names and configuration
   */
  private async initializeLinkParser(): Promise<void> {
    try {
      // Load page names for link validation
      const pageManager = this.engine?.getManager('PageManager') as PageManager | undefined;
      if (pageManager) {
        const pageNames = await pageManager.getAllPages(); // Returns array of strings

        // Get plural matching and CamelCase configuration
        const configManager = this.engine?.getManager('ConfigurationManager') as ConfigManager | undefined;
        const matchEnglishPlurals = configManager ?
          configManager.getProperty('ngdpbase.translator-reader.match-english-plurals', true) as boolean :
          true;
        const matchCamelCase = configManager ?
          configManager.getProperty('ngdpbase.translator-reader.camel-case-links', false) as boolean :
          false;

        // Store config for use in refreshPageNames()
        this.matchEnglishPlurals = matchEnglishPlurals;
        this.matchCamelCase = matchCamelCase;

        this.linkParser.setPageNames(pageNames, matchEnglishPlurals, matchCamelCase);
        logger.info(`LinkParserHandler loaded ${pageNames.length} page names for link validation (plural matching: ${matchEnglishPlurals ? 'enabled' : 'disabled'}, CamelCase: ${matchCamelCase ? 'enabled' : 'disabled'})`);

        // If no pages were loaded during initialization, schedule a retry
        if (pageNames.length === 0) {
          logger.info('No pages loaded during LinkParserHandler initialization, scheduling retry...');
          setTimeout(() => void this.refreshPageNames(), 1000).unref();
        }
      }

      // Load InterWiki sites configuration
      await this.loadInterWikiConfiguration();

      // Log LinkParser statistics
      const stats = this.linkParser.getStats();
      logger.info(`LinkParser stats: ${stats.pageNamesCount} pages, ${stats.interWikiSitesCount} InterWiki sites, ${stats.allowedAttributes} allowed attributes`);

    } catch (error) {
      const err = error as Error;
      logger.warn(`LinkParser initialization had issues: ${err.message}`);
      // Continue with default configuration
    }
  }

  /**
   * Load InterWiki site configuration for LinkParser
   */
  private async loadInterWikiConfiguration(): Promise<void> {
    try {
      const cfg = this.engine?.getManager?.('ConfigurationManager') as ConfigManager | undefined;
      const globalEnabled = cfg?.getProperty?.('ngdpbase.interwiki.enabled', true);
      if (!globalEnabled) return;

      // Prefer ConfigurationManager (object of siteName -> siteObject)
      const sitesFromCfg = cfg?.getProperty<Record<string, InterWikiSiteDef> | null>('ngdpbase.interwiki.sites', null);

      let sites: Record<string, InterWikiSiteDef> | null = null;
      if (sitesFromCfg && typeof sitesFromCfg === 'object') {
        sites = sitesFromCfg;
      } else {
        // Fallback to config/interwiki.json if present
        const filePath = path.resolve(process.cwd(), 'config', 'interwiki.json');
        if (await fs.pathExists(filePath)) {
          try {
            const json = await fs.readJson(filePath) as { interwiki?: Record<string, InterWikiSiteDef> };
            if (json?.interwiki && typeof json.interwiki === 'object') {
              sites = json.interwiki;
            }
          } catch {
            // ignore
          }
        }
      }

      // Built-in defaults as last resort
      if (!sites) {
        sites = {
          Wikipedia: { url: 'https://en.wikipedia.org/wiki/%s', enabled: true, openInNewWindow: true },
          JSPWiki: { url: 'https://jspwiki.apache.org/Wiki.jsp?page=%s', enabled: true, openInNewWindow: true }
        };
      }

      // Normalize and filter by per-site enabled flag (default: true)
      const normalized: Record<string, InterWikiSiteConfig> = {};
      for (const [name, def] of Object.entries(sites)) {
        if (!def) continue;
        const obj = typeof def === 'string' ? { url: def } : def;
        if (!obj.url) continue;
        const siteEnabled = obj.enabled !== false; // enabled unless explicitly false
        if (!siteEnabled) continue;
        normalized[name] = {
          url: String(obj.url),
          description: obj.description || '',
          openInNewWindow: obj.openInNewWindow !== false
        };
      }

      this.linkParser.setInterWikiSites(normalized);
      logger.info(`LinkParserHandler loaded ${Object.keys(normalized).length} InterWiki sites from configuration`);

    } catch (error) {
      const err = error as Error;
      logger.warn(`Failed to load InterWiki configuration: ${err.message}`);
      this.loadDefaultInterWikiSites();
    }
  }

  /**
   * Load default InterWiki sites
   */
  private loadDefaultInterWikiSites(): void {
    const defaultSites: Record<string, InterWikiSiteConfig> = {
      'Wikipedia': {
        url: 'https://en.wikipedia.org/wiki/%s',
        description: 'Wikipedia English',
        openInNewWindow: true
      },
      'JSPWiki': {
        url: 'https://jspwiki-wiki.apache.org/Wiki.jsp?page=%s',
        description: 'JSPWiki Documentation',
        openInNewWindow: true
      }
    };

    this.linkParser.setInterWikiSites(defaultSites);
    logger.info(`LinkParserHandler loaded ${Object.keys(defaultSites).length} default InterWiki sites`);
  }

  /**
   * Process content using LinkParser
   * @param content - Content to process
   * @param context - Parse context
   * @returns Content with links processed
   */
  async process(content: string, context: ParseContext): Promise<string> {
    if (!content) {
      return content;
    }

    if (!this.initialized) {
      logger.warn('LinkParserHandler not initialized, skipping link processing');
      return content;
    }

    try {
      const startTime = Date.now();

      // Use LinkParser for comprehensive link processing
      const processedContent = this.linkParser.parseLinks(content, {
        pageName: context.wikiContext?.pageName || 'unknown',
        engine: this.engine
      });

      // Update statistics
      this.localStats.processCount++;
      this.localStats.totalProcessingTime += Date.now() - startTime;

      return processedContent;

    } catch (error) {
      const err = error as Error;
      logger.error(`LinkParserHandler processing error: ${err.message}`);

      // Update error statistics
      this.localStats.errorCount++;

      // Return original content on error (fail-safe behavior)
      return content;
    }
  }

  /**
   * Handle method - not used since we override process() entirely
   * @param _match - Match information
   * @param _context - Parse context
   * @returns Processed match
   */
  async handle(_match: RegExpMatchArray, _context: ParseContext): Promise<string> {
    // This method is not used since LinkParser handles all matches in process()
    // But we need to implement it to satisfy the BaseSyntaxHandler interface
    throw new Error('LinkParserHandler uses process() method directly, handle() should not be called');
  }

  /**
   * Refresh page names cache (called when pages are added/removed)
   */
  async refreshPageNames(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      const pageManager = this.engine?.getManager('PageManager') as PageManager | undefined;
      if (pageManager) {
        const pageNames = await pageManager.getAllPages(); // Returns array of strings
        this.linkParser.setPageNames(pageNames, this.matchEnglishPlurals, this.matchCamelCase);
        logger.info(`LinkParserHandler refreshed ${pageNames.length} page names`);

        // Debug: log some page names to see what we actually have
        const testPages = ['PageIndex', 'SystemInfo', 'Everything We Know About You', 'User Documentation'];
        logger.debug('Debug - checking for specific pages:');
        testPages.forEach(testPage => {
          const exists = pageNames.includes(testPage);
          logger.debug(`   ${testPage}: ${exists ? 'found' : 'not found'}`);
        });

        // Show first few page names for debugging
        logger.debug(`First 10 page names: ${pageNames.slice(0, 10).join(', ')}`);
      }
    } catch (error) {
      const err = error as Error;
      logger.warn(`Failed to refresh page names: ${err.message}`);
    }
  }

  /**
   * Get handler information including LinkParser statistics
   * @returns Handler information
   */
  getInfo(): Record<string, unknown> {
    const baseInfo = super.getMetadata();
    const linkParserStats: ParserStats | Record<string, never> = this.linkParser ? this.linkParser.getStats() : {};

    return {
      ...baseInfo,
      features: [
        'Unified link processing for all link types',
        'Internal wiki links with red link support',
        'External link processing with security features',
        'InterWiki link support with configurable sites',
        'Email and anchor link processing',
        'Link attribute parsing and validation',
        'XSS prevention and security filtering',
        'Centralized and maintainable architecture'
      ],
      supportedPatterns: [
        '[PageName]',
        '[Display Text|TargetPage]',
        '[Display Text|http://example.com]',
        '[Display Text|Wikipedia:Article]',
        '[Display Text|mailto:user@example.com]',
        '[Display Text|#section]',
        '[Display Text|Target|class="custom" target="_blank"]'
      ],
      linkParserStats: linkParserStats,
      initialized: this.initialized
    };
  }

  /**
   * Handler-specific shutdown cleanup
   */
  protected async onShutdown(): Promise<void> {
    this.initialized = false;
    logger.info('LinkParserHandler shutdown complete');
  }
}

export default LinkParserHandler;

