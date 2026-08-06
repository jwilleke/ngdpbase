 
 
 
/**
 * DOMLinkHandler - DOM-based link processing handler
 *
 * Replaces string-based regex link processing with DOM queries.
 * Processes wiki links by querying WikiDocument for .wiki-link elements
 * and updating them with proper href, classes, and attributes based on link type.
 *
 * Part of Phase 5 of WikiDocument DOM Migration (GitHub Issue #108)
 *
 * Supports:
 * - Internal wiki links: [PageName], [Display|Target]
 * - External links: [Display|http://example.com]
 * - InterWiki links: [Display|Wikipedia:Article]
 * - Email links: [Display|mailto:user@example.com]
 * - Anchor links: [Display|#section]
 * - Links with attributes: [Display|Target|class="custom"]
 *
 * Usage:
 *   In wiki markup: [Display|Target] becomes <a class="wiki-link" data-wiki-link="Target">
 *   This handler processes those elements and sets proper href, class, etc.
 */

import { LinkParser, Link } from '../../LinkParser.js';
import logger from '../../../utils/logger.js';
import PageNameMatcher from '../../../utils/PageNameMatcher.js';
import { headingSlug } from '../../../utils/SectionUtils.js';
import type WikiDocument from '../WikiDocument.js';
import type { LinkedomElement } from '../WikiDocument.js';

/**
 * Link type enumeration
 */
export type LinkType = 'internal' | 'external' | 'interwiki' | 'email' | 'anchor';

/**
 * Link information object
 */
export interface LinkInfo {
  /** Display text for the link */
  text: string;
  /** Link target */
  target: string;
  /** Link attributes */
  attributes: Record<string, string>;
  /** Original wiki syntax */
  originalText: string;
}

/**
 * InterWiki site configuration
 */
export interface InterWikiSite {
  /** URL template with %s placeholder */
  url: string;
  /** Site description */
  description?: string;
  /** Site icon */
  icon?: string;
  /** Whether site is enabled */
  enabled?: boolean;
  /** Whether to open links in new window */
  openInNewWindow?: boolean;
}

/**
 * Page manager interface
 */
interface PageManager {
  /** Get all page names */
  getAllPages(): Promise<string[]>;
  /** Additional manager methods */
  [key: string]: unknown;
}

/**
 * Configuration manager interface
 */
interface ConfigurationManager {
  /** Get configuration property */
  getProperty(key: string, defaultValue?: unknown): unknown;
  /** Additional manager methods */
  [key: string]: unknown;
}

/**
 * WikiEngine interface (minimal)
 */
interface WikiEngine {
  /** Get a manager by name */
  getManager(name: string): unknown;
  /** Additional engine properties */
  [key: string]: unknown;
}

/**
 * Extracted link element from JSPWiki syntax extraction
 */
export interface ExtractedLinkElement {
  /** Element type */
  type: string;
  /** Link target (may include pipe syntax: "Display|Target") */
  target: string;
  /** Unique ID for tracking */
  id: number;
  /** Original syntax */
  syntax?: string;
  /** Original text */
  originalText?: string;
  /** Start index in content */
  startIndex?: number;
  /** End index in content */
  endIndex?: number;
  /** Additional properties */
  [key: string]: unknown;
}

/**
 * Rendering context
 */
export interface RenderContext {
  /** Page name */
  pageName?: string;
  /** Additional context properties */
  [key: string]: unknown;
}

/**
 * Link statistics by type
 */
export interface LinkTypeStats {
  /** Number of internal links */
  internal: number;
  /** Number of external links */
  external: number;
  /** Number of InterWiki links */
  interwiki: number;
  /** Number of email links */
  email: number;
  /** Number of anchor links */
  anchor: number;
  /** Number of error links */
  error: number;
}

/**
 * Link processing statistics
 */
export interface LinkStatistics {
  /** Total number of links */
  totalLinks: number;
  /** Link counts by type */
  linkTypes: LinkTypeStats;
  /** Number of red links (non-existent pages) */
  redLinks: number;
}

/**
 * DOMLinkHandler class
 */
class DOMLinkHandler {
  /** WikiEngine instance */
  private engine: WikiEngine;

  /** LinkParser instance */
  private linkParser: LinkParser | null;

  /** PageManager instance */
  private pageManager: PageManager | null;

  /** Set of available page names */
  private pageNames: Set<string>;

  /** Page name matcher for fuzzy matching */
  private pageNameMatcher: PageNameMatcher | null;

  /**
   * Creates a new DOMLinkHandler
   *
   * @param {WikiEngine} engine - WikiEngine instance
   */
  constructor(engine: WikiEngine) {
    this.engine = engine;
    this.linkParser = null;
    this.pageManager = null;
    this.pageNames = new Set<string>();
    this.pageNameMatcher = null;
  }

  /**
   * Initializes the handler
   */
  async initialize(): Promise<void> {
    // Create LinkParser for link type determination and HTML generation
    this.linkParser = new LinkParser();

    // Get PageManager for page existence checking
    this.pageManager = this.engine.getManager('PageManager') as PageManager | null;

    if (!this.pageManager) {
      logger.warn('⚠️  DOMLinkHandler: PageManager not available - red link detection disabled');
    } else {
      // Load page names for link validation
      await this.loadPageNames();
    }

    // Load InterWiki sites configuration
    this.loadInterWikiConfiguration();

    logger.debug('🔗 DOMLinkHandler initialized');
  }

  /**
   * Load page names from PageManager
   */
  async loadPageNames(): Promise<void> {
    try {
      if (!this.pageManager) {
        return;
      }

      const pageNames = await this.pageManager.getAllPages();
      this.pageNames = new Set(pageNames || []);

      // Get plural matching and CamelCase configuration
      const configManager = this.engine.getManager('ConfigurationManager') as ConfigurationManager | null;
      const matchEnglishPlurals = configManager ?
        configManager.getProperty('ngdpbase.translator-reader.match-english-plurals', true) as boolean :
        true;
      const matchCamelCase = configManager ?
        configManager.getProperty('ngdpbase.translator-reader.camel-case-links', false) as boolean :
        false;

      this.pageNameMatcher = new PageNameMatcher(matchEnglishPlurals, matchCamelCase);
      if (this.linkParser) {
        this.linkParser.setPageNames(pageNames, matchEnglishPlurals, matchCamelCase);
      }

      logger.debug(`📄 DOMLinkHandler loaded ${pageNames.length} page names (plural matching: ${matchEnglishPlurals ? 'enabled' : 'disabled'})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('⚠️  Failed to load page names:', errorMessage);
    }
  }

  /**
   * Load InterWiki site configuration
   */
  loadInterWikiConfiguration(): void {
    try {
      const cfg = this.engine.getManager('ConfigurationManager') as ConfigurationManager | null;
      const globalEnabled = cfg?.getProperty('ngdpbase.interwiki.enabled', true) as boolean;

      if (!globalEnabled) {
        if (this.linkParser) {
          this.linkParser.setInterWikiSites({});
        }
        return;
      }

      // Get sites from configuration
      const sitesFromCfg = cfg?.getProperty('ngdpbase.interwiki.sites', null) as Record<string, InterWikiSite> | null;

      let sites: Record<string, InterWikiSite> | null = null;
      if (sitesFromCfg && typeof sitesFromCfg === 'object') {
        sites = sitesFromCfg;
      } else {
        // Use default sites
        sites = {
          Wikipedia: { url: 'https://en.wikipedia.org/wiki/%s', enabled: true, openInNewWindow: true },
          JSPWiki:   { url: 'https://jspwiki-wiki.apache.org/Wiki.jsp?page=%s', enabled: true, openInNewWindow: true }
        };
      }

      // Filter enabled sites
      const normalized: Record<string, InterWikiSite> = {};
      for (const [name, def] of Object.entries(sites)) {
        if (!def || !def.url) continue;
        const siteEnabled = def.enabled !== false;
        if (!siteEnabled) continue;
        normalized[name] = {
          url: String(def.url),
          description: def.description || '',
          icon: def.icon || '',
          enabled: true,
          openInNewWindow: def.openInNewWindow !== false
        };
      }

      if (this.linkParser) {
        this.linkParser.setInterWikiSites(normalized);
      }
      logger.debug(`🌐 DOMLinkHandler loaded ${Object.keys(normalized).length} InterWiki sites`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('⚠️  Failed to load InterWiki configuration:', errorMessage);
    }
  }

  /**
   * Processes links in a WikiDocument
   *
   * Queries for .wiki-link elements and updates them with proper href and attributes.
   * This is the DOM-based equivalent of LinkParserHandler.process()
   *
   * @param {WikiDocument} wikiDocument - The WikiDocument to process
   * @param {RenderContext} context - Rendering context
   * @returns {Promise<WikiDocument>} Updated WikiDocument
   */
  async processLinks(wikiDocument: WikiDocument, context: RenderContext): Promise<WikiDocument> {
    if (!this.linkParser) {
      logger.warn('⚠️  DOMLinkHandler: Cannot process links without LinkParser');
      return wikiDocument;
    }

    // Query for all link elements
     
    const linkElements = wikiDocument.querySelectorAll('a.wiki-link');

    if (linkElements.length === 0) {
      return wikiDocument;
    }

    logger.debug(`🔍 DOMLinkHandler: Processing ${linkElements.length} links`);

    let processedCount = 0;
    let errorCount = 0;

    // Process each link element - use index-based loop since LinkedomNodeList doesn't support for...of
    for (let i = 0; i < linkElements.length; i++) {
      const linkElement = linkElements[i] as LinkedomElement;
      try {
        // Get link data from element
        const target: string = linkElement.getAttribute('data-wiki-link') || '';
        const displayText: string = linkElement.textContent || target;

        if (!target) {
          logger.warn('⚠️  Link element missing data-wiki-link attribute');
          continue;
        }

        // Create Link object for processing
        const linkInfo: LinkInfo = {
          text: displayText,
          target: target,
          attributes: {},
          originalText: `[${displayText}|${target}]`
        };

        // Create Link object for determineLinkType (requires Link class, not LinkInfo)
        const linkObj = new Link({
          text: displayText,
          target: target,
          originalText: `[${displayText}|${target}]`
        });

        // Determine link type
        const linkType = this.linkParser.determineLinkType(linkObj);

        // Process link based on type
        await this.processLinkByType(linkElement, linkInfo, linkType, context);

        // Apply author attributes from the third link segment
        // ([Text|Target|class='…' …]) AFTER type processing so the custom
        // class extends (not loses) the wiki-link base classes. Parsing and
        // whitelisting delegate to LinkParser.parseAttributes.
        const rawAttrs = linkElement.getAttribute('data-wiki-attrs');
        if (rawAttrs) {
          const parsed = this.linkParser.parseAttributes(rawAttrs);
          for (const [name, value] of Object.entries(parsed)) {
            if (typeof value !== 'string') continue;
            if (name === 'class') {
              linkElement.className = `${linkElement.className} ${value}`.trim();
            } else {
              linkElement.setAttribute(name, value);
            }
          }
          linkElement.removeAttribute('data-wiki-attrs');
        }

        processedCount++;

      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('❌ Error processing link:', errorMessage);

        // Add error class on error
        linkElement.className = linkElement.className + ' wiki-link-error';
      }
    }

    logger.debug(`✅ DOMLinkHandler: Processed ${processedCount} links, ${errorCount} errors`);

    return wikiDocument;
  }

  /**
   * Process a link element based on its type
   *
   * @param linkElement - The link DOM element
   * @param linkInfo - Link information
   * @param linkType - Link type
   * @param context - Rendering context
   */
  async processLinkByType(linkElement: LinkedomElement, linkInfo: LinkInfo, linkType: LinkType, context: RenderContext): Promise<void> {
    switch (linkType) {
    case 'internal':
      this.processInternalLink(linkElement, linkInfo, context);
      break;
    case 'external':
      this.processExternalLink(linkElement, linkInfo, context);
      break;
    case 'interwiki':
      this.processInterWikiLink(linkElement, linkInfo, context);
      break;
    case 'email':
      this.processEmailLink(linkElement, linkInfo, context);
      break;
    case 'anchor':
      this.processAnchorLink(linkElement, linkInfo, context);
      break;
    default:
      this.processInternalLink(linkElement, linkInfo, context);
    }
  }

  /**
   * Process internal wiki link
   *
   * @param linkElement - The link DOM element
   * @param linkInfo - Link information
   * @param _context - Rendering context (unused)
   */
  processInternalLink(linkElement: LinkedomElement, linkInfo: LinkInfo, _context: RenderContext): void {
    const rawTarget = linkInfo.target || linkInfo.text;

    // Split off any section fragment: "PageName#slug" or "PageName#section=Heading Name"
    const hashIdx = rawTarget.indexOf('#');
    const pageName = hashIdx === -1 ? rawTarget : rawTarget.slice(0, hashIdx);
    const rawFragment = hashIdx === -1 ? '' : rawTarget.slice(hashIdx + 1);
    const fragment = rawFragment.startsWith('section=')
      ? headingSlug(rawFragment.slice('section='.length))
      : rawFragment;

    // Try fuzzy matching if PageNameMatcher is available
    let matchedPage: string | null = null;
    if (this.pageNameMatcher && this.pageNames.size > 0) {
      const allPages = Array.from(this.pageNames);
      matchedPage = this.pageNameMatcher.findMatch(pageName, allPages);
    } else {
      // Fallback to exact match
      matchedPage = this.pageNames.has(pageName) ? pageName : null;
    }

    const exists = matchedPage !== null;
    const targetPage = matchedPage || pageName;

    // Set href (append fragment if present)
    const base = exists
      ? `/view/${encodeURIComponent(targetPage)}`
      : `/edit/${encodeURIComponent(pageName)}`;
    const href = fragment ? `${base}#${fragment}` : base;

    linkElement.setAttribute('href', href);

    // Set class
    const baseClass = exists ? 'wikipage' : 'redlink';
     
    linkElement.className = `wiki-link ${baseClass}`;

    // Add red link styling
    if (!exists) {
       
      linkElement.setAttribute('style', 'color: red;');
       
      linkElement.setAttribute('title', `Create page: ${pageName}`);
    }
  }

  /**
   * Process external link
   *
   * @param linkElement - The link DOM element
   * @param linkInfo - Link information
   * @param _context - Rendering context (unused)
   */
  processExternalLink(linkElement: LinkedomElement, linkInfo: LinkInfo, _context: RenderContext): void {
    const url = linkInfo.target || linkInfo.text;

    // Set href
     
    linkElement.setAttribute('href', url);

    // Set class
     
    linkElement.className = 'wiki-link external-link';

    // Set target and rel for security
     
    linkElement.setAttribute('target', '_blank');
     
    linkElement.setAttribute('rel', 'noopener noreferrer');
  }

  /**
   * Process InterWiki link
   *
   * @param linkElement - The link DOM element
   * @param linkInfo - Link information
   * @param _context - Rendering context (unused)
   */
  processInterWikiLink(linkElement: LinkedomElement, linkInfo: LinkInfo, _context: RenderContext): void {
    const target = linkInfo.target || linkInfo.text;

    // Parse InterWiki format: WikiName:PageName
    const match = target.match(/^([A-Za-z0-9]+):(.+)$/);
    if (!match) {
      logger.warn(`⚠️  Invalid InterWiki format: ${target}`);
      return;
    }

    const [, wikiName, pageName] = match;
    if (!this.linkParser) {
      return;
    }
    const interWikiSites = this.linkParser.interWikiSites;
    const siteConfig = interWikiSites.get(wikiName) ||
                       interWikiSites.get(wikiName.toLowerCase());

    if (!siteConfig) {
      logger.warn(`⚠️  Unknown InterWiki site: ${wikiName}`);
      return;
    }

    // Generate URL
    const url = siteConfig.url.replace('%s', encodeURIComponent(pageName));

    // Set href
     
    linkElement.setAttribute('href', url);

    // Set class
     
    linkElement.className = `wiki-link interwiki-link interwiki-${wikiName.toLowerCase()}`;

    // Set target and rel
    if (siteConfig.openInNewWindow !== false) {
       
      linkElement.setAttribute('target', '_blank');
       
      linkElement.setAttribute('rel', 'noopener noreferrer');
    }

    // Set title
    if (siteConfig.description) {
       
      linkElement.setAttribute('title', `${siteConfig.description}: ${linkInfo.text}`);
    }
  }

  /**
   * Process email link
   *
   * @param linkElement - The link DOM element
   * @param linkInfo - Link information
   * @param _context - Rendering context (unused)
   */
  processEmailLink(linkElement: LinkedomElement, linkInfo: LinkInfo, _context: RenderContext): void {
    const email = linkInfo.target || linkInfo.text;

    // Set href
     
    linkElement.setAttribute('href', email);

    // Set class
     
    linkElement.className = 'wiki-link email-link';
  }

  /**
   * Process anchor link
   *
   * @param linkElement - The link DOM element
   * @param linkInfo - Link information
   * @param _context - Rendering context (unused)
   */
  processAnchorLink(linkElement: LinkedomElement, linkInfo: LinkInfo, _context: RenderContext): void {
    const anchor = linkInfo.target || linkInfo.text;

    // Resolve "#section=Heading Name" to a slug (#1024); "#slug" passes through
    const rawAnchor = anchor.startsWith('#') ? anchor.slice(1) : anchor;
    const href = rawAnchor.startsWith('section=')
      ? `#${headingSlug(rawAnchor.slice('section='.length))}`
      : anchor;

    // Set href

    linkElement.setAttribute('href', href);

    // Set class
     
    linkElement.className = 'wiki-link anchor-link';
  }

  /**
   * Creates a DOM node from an extracted link element
   *
   * This method is part of the Phase 2 extraction-based parsing (Issue #114).
   * It creates a link node from a pre-extracted element instead of parsing tokens.
   *
   * @param {ExtractedLinkElement} element - Extracted element from extractJSPWikiSyntax()
   * @param {RenderContext} _context - Rendering context (unused)
   * @param {WikiDocument} wikiDocument - WikiDocument to create node in
   * @returns {Promise<Element>} DOM node for the link
   *
   * @example
   * const element = { type: 'link', target: 'PageName', id: 0, ... };
   * const node = await handler.createNodeFromExtract(element, context, wikiDoc);
   * // Returns: <a class="wiki-link wikipage" href="/view/PageName" data-jspwiki-id="0">PageName</a>
   *
   * @example
   * const element = { type: 'link', target: 'Click Here|PageName', id: 1, ... };
   * const node = await handler.createNodeFromExtract(element, context, wikiDoc);
   * // Returns: <a class="wiki-link wikipage" href="/view/PageName" data-jspwiki-id="1">Click Here</a>
   */
  async createNodeFromExtract(element: ExtractedLinkElement, _context: RenderContext, wikiDocument: WikiDocument): Promise<LinkedomElement> {
    // Get LinkParser dynamically
    if (!this.linkParser) {
      this.linkParser = new LinkParser();
    }

    // Parse display text and target from pipe syntax
    // Format can be:
    // - "PageName" -> display and target are same
    // - "Display|Target" -> custom display text
    // - "Display|Target|attr='value' …" -> author attributes (whitelisted)
    const parts = element.target.split('|').map(s => s.trim());
    const displayText = parts.length > 1 ? parts[0] : parts[0];
    const linkTarget = parts.length > 1 ? parts[1] : parts[0];
    const authorAttrString = parts.length > 2 ? parts.slice(2).join('|') : '';

    // Create Link object for determineLinkType (requires Link class, not LinkInfo)
    const linkObj = new Link({
      text: displayText,
      target: linkTarget,
      originalText: element.syntax || `[${element.target}]`
    });

    // Determine link type (internal, external, interwiki, email, anchor)
    const linkType = this.linkParser.determineLinkType(linkObj);

    // Create anchor element with base attributes
    const node = wikiDocument.createElement('a', {
      'class': 'wiki-link',
      'data-jspwiki-id': element.id.toString()
    });

    node.textContent = displayText;

    // Process based on link type
    switch (linkType) {
    case 'internal': {
      // Internal wiki link - check if page exists.
      // Split off any section fragment first: "PageName#slug" or
      // "PageName#section=Heading Name" (#1024). Without this the fragment is
      // treated as part of the page name and every section link redlinks.
      const hashIdx = linkTarget.indexOf('#');
      const pageName = hashIdx === -1 ? linkTarget : linkTarget.slice(0, hashIdx);
      const rawFragment = hashIdx === -1 ? '' : linkTarget.slice(hashIdx + 1);
      const fragment = rawFragment.startsWith('section=')
        ? headingSlug(rawFragment.slice('section='.length))
        : rawFragment;
      let matchedPage: string | null = null;

      if (this.pageNameMatcher && this.pageNames.size > 0) {
        const allPages = Array.from(this.pageNames);
        matchedPage = this.pageNameMatcher.findMatch(pageName, allPages);
      } else {
        // Fallback to exact match
        matchedPage = this.pageNames.has(pageName) ? pageName : null;
      }

      const exists = matchedPage !== null;
      const targetPage = matchedPage || pageName;

      // Set href (append fragment if present)
      const base = exists
        ? `/view/${encodeURIComponent(targetPage)}`
        : `/edit/${encodeURIComponent(pageName)}`;
      const href = fragment ? `${base}#${fragment}` : base;
      node.setAttribute('href', href);

      // Set class
      const baseClass = exists ? 'wikipage' : 'redlink';
      node.setAttribute('class', `wiki-link ${baseClass}`);

      // Add red link styling
      if (!exists) {
        node.setAttribute('style', 'color: red;');
        node.setAttribute('title', `Create page: ${pageName}`);
      }

      node.setAttribute('data-link-type', 'internal');
      node.setAttribute('data-target', pageName);
      break;
    }

    case 'external': {
      // External link
      node.setAttribute('href', linkTarget);
      node.setAttribute('class', 'wiki-link external-link');
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
      node.setAttribute('data-link-type', 'external');
      node.setAttribute('data-target', linkTarget);
      break;
    }

    case 'interwiki': {
      // InterWiki link format: WikiName:PageName
      const match = linkTarget.match(/^([A-Za-z0-9]+):(.+)$/);
      if (match) {
        const [, wikiName, pageName] = match;
        const interWikiSites = this.linkParser.interWikiSites;
        const siteConfig = interWikiSites.get(wikiName) ||
                             interWikiSites.get(wikiName.toLowerCase());

        if (siteConfig) {
          // Generate URL
          const url = siteConfig.url.replace('%s', encodeURIComponent(pageName));
          node.setAttribute('href', url);
          node.setAttribute('class', `wiki-link interwiki-link interwiki-${wikiName.toLowerCase()}`);

          // Set target and rel
          if (siteConfig.openInNewWindow !== false) {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
          }

          // Set title
          if (siteConfig.description) {
            node.setAttribute('title', `${siteConfig.description}: ${displayText}`);
          }

          node.setAttribute('data-link-type', 'interwiki');
          node.setAttribute('data-target', linkTarget);
        } else {
          // Unknown InterWiki site - treat as internal link
          logger.warn(`⚠️  Unknown InterWiki site: ${wikiName}`);
          node.setAttribute('href', `/view/${encodeURIComponent(linkTarget)}`);
          node.setAttribute('class', 'wiki-link redlink');
          node.setAttribute('style', 'color: red;');
          node.setAttribute('data-link-type', 'internal');
          node.setAttribute('data-target', linkTarget);
        }
      }
      break;
    }

    case 'email': {
      // Email link
      node.setAttribute('href', linkTarget);
      node.setAttribute('class', 'wiki-link email-link');
      node.setAttribute('data-link-type', 'email');
      node.setAttribute('data-target', linkTarget);
      break;
    }

    case 'anchor': {
      // Same-page anchor link. "#section=Heading Name" resolves to a slug the
      // same way the cross-page form does (#1024); a bare "#slug" passes through.
      const rawAnchor = linkTarget.slice(1);
      const href = rawAnchor.startsWith('section=')
        ? `#${headingSlug(rawAnchor.slice('section='.length))}`
        : linkTarget;
      node.setAttribute('href', href);
      node.setAttribute('class', 'wiki-link anchor-link');
      node.setAttribute('data-link-type', 'anchor');
      node.setAttribute('data-target', linkTarget);
      break;
    }

    default: {
      // Fallback to internal link
      node.setAttribute('href', `/view/${encodeURIComponent(linkTarget)}`);
      node.setAttribute('class', 'wiki-link redlink');
      node.setAttribute('style', 'color: red;');
      node.setAttribute('data-link-type', 'internal');
      node.setAttribute('data-target', linkTarget);
    }
    }

    // Apply author attributes from the third pipe segment AFTER the
    // type-specific processing so a custom class EXTENDS the base classes
    // ([Text|Page|class='btn btn-sm'] renders class="wiki-link wikipage btn
    // btn-sm"). Parsing + whitelisting delegate to LinkParser.parseAttributes.
    if (authorAttrString) {
      const parsed = this.linkParser.parseAttributes(authorAttrString);
      for (const [name, value] of Object.entries(parsed)) {
        if (typeof value !== 'string') continue;
        if (name === 'class') {
          const existing = node.getAttribute('class') ?? '';
          node.setAttribute('class', `${existing} ${value}`.trim());
        } else {
          node.setAttribute(name, value);
        }
      }
    }

    return node;
  }

  /**
   * Gets statistics about link processing
   *
   * @param {WikiDocument} wikiDocument - Document to analyze
   * @returns {LinkStatistics} Statistics
   */
  getStatistics(wikiDocument: WikiDocument): LinkStatistics {
     
    const linkElements = wikiDocument.querySelectorAll('a.wiki-link');

    const stats: LinkStatistics = {
      totalLinks: linkElements.length,
      linkTypes: {
        internal: 0,
        external: 0,
        interwiki: 0,
        email: 0,
        anchor: 0,
        error: 0
      },
      redLinks: 0
    };

    // Use index-based loop since LinkedomNodeList doesn't support for...of
    for (let i = 0; i < linkElements.length; i++) {
      const linkElement = linkElements[i] as LinkedomElement;
      const className: string = linkElement.className || '';

      if (className.includes('error')) {
        stats.linkTypes.error++;
      } else if (className.includes('redlink')) {
        stats.linkTypes.internal++;
        stats.redLinks++;
      } else if (className.includes('wikipage')) {
        stats.linkTypes.internal++;
      } else if (className.includes('external-link')) {
        stats.linkTypes.external++;
      } else if (className.includes('interwiki-link')) {
        stats.linkTypes.interwiki++;
      } else if (className.includes('email-link')) {
        stats.linkTypes.email++;
      } else if (className.includes('anchor-link')) {
        stats.linkTypes.anchor++;
      }
    }

    return stats;
  }

  /**
   * Refresh page names cache (called when pages are added/removed)
   */
  async refreshPageNames(): Promise<void> {
    if (this.pageManager) {
      await this.loadPageNames();
    }
  }

  /**
   * Add a single page name to the known pages set (incremental update on page create/rename).
   * Avoids the full getAllPages() reload cost of refreshPageNames().
   * @param {string} pageName - Page name to add
   */
  addPageName(pageName: string): void {
    this.pageNames.add(pageName);
    if (this.linkParser) {
      this.linkParser.addPageName(pageName);
    }
  }

  /**
   * Remove a single page name from the known pages set (incremental update on page delete/rename).
   * @param {string} pageName - Page name to remove
   */
  removePageName(pageName: string): void {
    this.pageNames.delete(pageName);
    // LinkParser has no targeted remove; stale entry is harmless until next refreshPageNames()
  }
}

export default DOMLinkHandler;

