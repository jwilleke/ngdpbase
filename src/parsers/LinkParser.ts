/**
 * LinkParser - Centralized link parsing for ngdpbase
 *
 * Inspired by JSPWiki's link parsing implementation, this class provides
 * a centralized, flexible, and maintainable approach to parsing various
 * types of links in wiki content.
 *
 * Supports the following link formats:
 * - [PageName] - Simple internal wiki links
 * - [DisplayText|Target] - Links with custom display text
 * - [DisplayText|Target|attributes] - Links with custom attributes
 *
 * Features:
 * - Centralized parsing logic to reduce brittle code
 * - Security-focused attribute validation
 * - Support for internal wiki links, external links, and InterWiki links
 * - Extensible architecture for future link types
 * - Comprehensive error handling and validation
 *
 * @class LinkParser
 *
 * @property {LinkParserOptions} options - Parser configuration options
 * @property {Set<string>} pageNames - Cache of available page names
 * @property {PageNameMatcher|null} pageNameMatcher - Page name matching utility
 * @property {Map<string, InterWikiSiteConfig>} interWikiSites - InterWiki site configurations
 * @property {RegExp} linkPattern - Regular expression for link matching
 *
 * @see {@link PageNameMatcher} for fuzzy page matching
 * @see {@link RenderingManager} for usage
 *
 * @example
 * const linkParser = new LinkParser();
 * linkParser.setPageNames(['Main', 'Help', 'About']);
 * const html = linkParser.parseLinks('[Main] and [Help|Documentation]');
 *
 * @author ngdpbase
 * @version 1.0.0
 * @see https://github.com/jwilleke/ngdpbase/issues/75
 */

import PageNameMatcher from '../utils/PageNameMatcher.js';
import logger from '../utils/logger.js';
import { headingSlug } from '../utils/SectionUtils.js';

/**
 * The wiki link syntax, as a source string: `[text]`, `[text|target]` or
 * `[text|target|attributes]`. The trailing `(?!\()` skips `[text](url)` —
 * that is a markdown link, and its bracket text is not a wiki link target.
 *
 * Exported as a source string rather than a RegExp because the compiled form
 * needs the `g` flag, and a shared global RegExp carries `lastIndex` between
 * callers. Use {@link wikiLinkPattern} to get a fresh one.
 *
 * Shared so that anything reasoning about link targets — rendering, the
 * link graph, the rename rewriter (#1094) — agrees with the parser about what
 * a link *is*. A second copy of this pattern is a second answer waiting to
 * drift from this one.
 */
export const WIKI_LINK_PATTERN_SOURCE = '\\[([^|\\]]+)(?:\\|([^|\\]]+))?(?:\\|([^\\]]+))?\\](?!\\()';

/** A fresh global RegExp for the wiki link syntax. Never share one. */
export function wikiLinkPattern(): RegExp {
  return new RegExp(WIKI_LINK_PATTERN_SOURCE, 'g');
}

/**
 * Target shapes that are NOT internal wiki page names. Non-global, so these
 * are stateless and safe to share.
 */
export const LINK_URL_PATTERNS = {
  external: /^https?:\/\//i,
  email: /^mailto:/i,
  anchor: /^#/,
  absolute: /^\//
} as const;

/** `Site:path` — an InterWiki reference, not a local page. */
export const INTERWIKI_PATTERN = /^([A-Za-z0-9]+):(.+)$/;

/**
 * Default CSS classes for different link types
 */
export interface DefaultClasses {
  /** Class for internal wiki links */
  internal: string;
  /** Class for external links */
  external: string;
  /** Class for InterWiki links */
  interwiki: string;
  /** Class for red links (non-existent pages) */
  redlink: string;
}

/**
 * URL pattern definitions for link type detection
 */
export interface UrlPatterns {
  /** Pattern for external HTTP/HTTPS URLs */
  external: RegExp;
  /** Pattern for email links */
  email: RegExp;
  /** Pattern for anchor links */
  anchor: RegExp;
  /** Pattern for absolute paths */
  absolute: RegExp;
}

/**
 * Security configuration options
 */
export interface SecurityOptions {
  /** Validate URLs for safety */
  validateUrls: boolean;
  /** Sanitize HTML attributes */
  sanitizeAttributes: boolean;
  /** Prevent XSS attacks */
  preventXSS: boolean;
}

/**
 * LinkParser configuration options
 */
export interface LinkParserOptions {
  /** Allowed HTML attributes for links */
  allowedAttributes: string[];
  /** Default CSS classes for link types */
  defaultClasses: DefaultClasses;
  /** URL patterns for validation */
  urlPatterns: UrlPatterns;
  /** InterWiki site pattern */
  interWikiPattern: RegExp;
  /** Security settings */
  security: SecurityOptions;
}

/**
 * InterWiki site configuration
 */
export interface InterWikiSiteConfig {
  /** URL template with %s placeholder for page name */
  url: string;
  /** Description of the InterWiki site */
  description?: string;
  /** Whether to open links in new window */
  openInNewWindow?: boolean;
}

/**
 * HTML attributes for links
 */
export interface LinkAttributes {
  [key: string]: string;
}

/**
 * Parsing context for link generation
 */
export interface ParserContext {
  /** Current page name */
  pageName?: string;
  /** Additional context data */
  [key: string]: unknown;
}

/**
 * Parser statistics
 */
export interface ParserStats {
  /** Number of page names in cache */
  pageNamesCount: number;
  /** Number of InterWiki sites configured */
  interWikiSitesCount: number;
  /** Number of allowed attributes */
  allowedAttributes: number;
  /** Whether security features are enabled */
  securityEnabled: boolean;
}

/**
 * Link data structure for Link constructor
 */
export interface LinkData {
  /** Original text from content */
  originalText?: string;
  /** Display text for the link */
  text?: string;
  /** Target page or URL */
  target?: string | null;
  /** Raw attributes string */
  attributesString?: string | null;
  /** Parsed attributes object */
  attributes?: LinkAttributes;
  /** Start index in content */
  startIndex?: number;
  /** End index in content */
  endIndex?: number;
}

/**
 * Link information object returned by toObject()
 */
export interface LinkInfo {
  /** Original text from content */
  originalText: string;
  /** Display text for the link */
  text: string;
  /** Target page or URL */
  target: string | null;
  /** Parsed attributes */
  attributes: LinkAttributes;
  /** Whether this is a simple link */
  isSimple: boolean;
  /** Whether the link has attributes */
  hasAttributes: boolean;
}

/**
 * Link type enumeration
 */
export type LinkType = 'internal' | 'external' | 'interwiki' | 'email' | 'anchor';

/**
 * Main LinkParser class
 */
export class LinkParser {
  /** Parser configuration options */
  public options: LinkParserOptions;

  /** Cache of available page names */
  public pageNames: Set<string>;

  /** Page name matcher for fuzzy matching */
  public pageNameMatcher: PageNameMatcher | null;

  /** InterWiki sites configuration */
  public interWikiSites: Map<string, InterWikiSiteConfig>;

  /** Link pattern regex */
  public linkPattern: RegExp;

  /**
   * Create a new LinkParser instance
   *
   * @constructor
   * @param {Partial<LinkParserOptions>} [options={}] - Configuration options
   */
  constructor(options: Partial<LinkParserOptions> = {}) {
    this.options = {
      // Security: allowed HTML attributes for links
      allowedAttributes: [
        'class', 'id', 'title', 'target', 'rel', 'style',
        'accesskey', 'tabindex', 'hreflang', 'type', 'dir', 'lang'
      ],

      // Default classes for different link types
      defaultClasses: {
        internal: 'wikipage',
        external: 'external-link',
        interwiki: 'interwiki-link',
        redlink: 'redlink'
      },

      // URL patterns for validation
      urlPatterns: { ...LINK_URL_PATTERNS },

      // InterWiki site patterns
      interWikiPattern: INTERWIKI_PATTERN,

      // Enable security features
      security: {
        validateUrls: true,
        sanitizeAttributes: true,
        preventXSS: true
      },

      // Override with user options
      ...options
    };

    // Cache for page names (set externally)
    this.pageNames = new Set<string>();

    // Page name matcher for fuzzy matching (plurals, case)
    this.pageNameMatcher = null;

    // InterWiki sites configuration
    this.interWikiSites = new Map<string, InterWikiSiteConfig>();

    // Link pattern: [text] or [text|target] or [text|target|attributes]
    this.linkPattern = wikiLinkPattern();
  }

  /**
   * Set the list of existing wiki page names for link validation
   * @param {string[]} pageNames - Array of page names
   * @param {boolean} matchEnglishPlurals - Enable plural matching (default: true)
   * @param {boolean} matchCamelCase - Enable CamelCase matching (default: false)
   */
  setPageNames(pageNames: string[], matchEnglishPlurals: boolean = true, matchCamelCase: boolean = false): void {
    this.pageNames = new Set(pageNames || []);
    this.pageNameMatcher = new PageNameMatcher(matchEnglishPlurals, matchCamelCase);
  }

  /**
   * Add a page name to the known pages
   * @param {string} pageName - Page name to add
   */
  addPageName(pageName: string): void {
    if (pageName && typeof pageName === 'string') {
      this.pageNames.add(pageName);
    }
  }

  /**
   * Set InterWiki sites configuration
   * @param {Map<string, InterWikiSiteConfig> | Record<string, InterWikiSiteConfig>} sites - InterWiki sites configuration
   */
  setInterWikiSites(sites: Map<string, InterWikiSiteConfig> | Record<string, InterWikiSiteConfig>): void {
    if (sites instanceof Map) {
      this.interWikiSites = sites;
    } else if (typeof sites === 'object') {
      this.interWikiSites = new Map(Object.entries(sites));
    }
  }

  /**
   * Parse all links in the given content
   * @param {string} content - Content containing wiki links
   * @param {ParserContext} context - Parsing context (pageName, etc.)
   * @returns {string} Content with links converted to HTML
   */
  parseLinks(content: string, context: ParserContext = {}): string {
    if (!content || typeof content !== 'string') {
      return content;
    }

    const links = this.findLinks(content);

    // Process links in reverse order to maintain string positions
    let processedContent = content;

    for (let i = links.length - 1; i >= 0; i--) {
      const linkInfo = links[i];

      try {
        const htmlLink = this.generateLinkHtml(linkInfo, context);

        processedContent =
          processedContent.slice(0, linkInfo.startIndex) +
          htmlLink +
          processedContent.slice(linkInfo.endIndex);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`LinkParser: Error processing link "${linkInfo.originalText}":`, errorMessage);
        // Leave original text on error
      }
    }

    return processedContent;
  }

  /**
   * Find all links in the content
   * @param {string} content - Content to search
   * @returns {Link[]} Array of Link objects
   */
  findLinks(content: string): Link[] {
    const links: Link[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.linkPattern.lastIndex = 0;

    while ((match = this.linkPattern.exec(content)) !== null) {
      const link = new Link({
        originalText: match[0],
        text: match[1]?.trim(),
        target: match[2]?.trim() || null,
        attributesString: match[3]?.trim() || null,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });

      // Parse attributes if provided
      if (link.attributesString) {
        link.attributes = this.parseAttributes(link.attributesString);
      }

      links.push(link);
    }

    return links;
  }

  /**
   * Parse link attributes from attribute string
   * @param {string} attributeString - String containing attributes
   * @returns {LinkAttributes} Parsed attributes object
   */
  parseAttributes(attributeString: string): LinkAttributes {
    const attributes: LinkAttributes = {};

    if (!attributeString) {
      return attributes;
    }

    // Pattern to match name='value' or name="value"
    const attrPattern = /([a-zA-Z][a-zA-Z0-9_-]*)=['"]([^'"]*)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = attrPattern.exec(attributeString)) !== null) {
      const attrName = match[1].toLowerCase();
      const attrValue = match[2];

      // Security: only allow whitelisted attributes
      if (this.options.allowedAttributes.includes(attrName)) {
        // Additional security checks for specific attributes
        if (attrName === 'target') {
          // Only allow safe target values
          if (['_blank', '_self', '_parent', '_top'].includes(attrValue)) {
            attributes[attrName] = attrValue;
          }
        } else if (attrName === 'style') {
          // Basic style validation (could be enhanced)
          if (this.options.security.sanitizeAttributes) {
            attributes[attrName] = this.sanitizeStyleAttribute(attrValue);
          } else {
            attributes[attrName] = attrValue;
          }
        } else {
          // Sanitize the value to prevent XSS
          attributes[attrName] = this.options.security.preventXSS
            ? this.sanitizeAttributeValue(attrValue)
            : attrValue;
        }
      } else {
        logger.warn(`LinkParser: Ignoring disallowed attribute: ${attrName}`);
      }
    }

    return attributes;
  }

  /**
   * Generate HTML for a link
   * @param {Link} link - Link object to process
   * @param {ParserContext} context - Parsing context
   * @returns {string} HTML link
   */
  generateLinkHtml(link: Link, context: ParserContext): string {
    // Determine link type and generate appropriate HTML
    const linkType = this.determineLinkType(link);

    switch (linkType) {
    case 'internal':
      return this.generateInternalLink(link, context);
    case 'external':
      return this.generateExternalLink(link, context);
    case 'interwiki':
      return this.generateInterWikiLink(link, context);
    case 'email':
      return this.generateEmailLink(link, context);
    case 'anchor':
      return this.generateAnchorLink(link, context);
    default:
      return this.generateInternalLink(link, context); // Default to internal
    }
  }

  /**
   * Determine the type of link
   * @param {Link} link - Link object
   * @returns {LinkType} Link type
   */
  determineLinkType(link: Link): LinkType {
    const target = link.target || link.text;

    if (!target) {
      return 'internal';
    }

    // Check for external URLs
    if (this.options.urlPatterns.external.test(target)) {
      return 'external';
    }

    // Check for email links
    if (this.options.urlPatterns.email.test(target)) {
      return 'email';
    }

    // Check for anchor links
    if (this.options.urlPatterns.anchor.test(target)) {
      return 'anchor';
    }

    // Check for absolute paths
    if (this.options.urlPatterns.absolute.test(target)) {
      return 'external';
    }

    // Check for InterWiki links
    if (this.options.interWikiPattern.test(target)) {
      return 'interwiki';
    }

    // Default to internal wiki link
    return 'internal';
  }

  /**
   * Generate HTML for internal wiki links
   * @param {Link} link - Link object
   * @param {ParserContext} _context - Parsing context (unused)
   * @returns {string} HTML link
   */
  generateInternalLink(link: Link, _context: ParserContext): string {
    const rawTarget = link.target || link.text;
    const displayText = link.text;

    // Split off any section fragment: "PageName#slug" or "PageName#section=Heading Name"
    const hashIdx = rawTarget.indexOf('#');
    const pageName = hashIdx === -1 ? rawTarget : rawTarget.slice(0, hashIdx);
    const rawFragment = hashIdx === -1 ? '' : rawTarget.slice(hashIdx + 1);

    // Resolve #section=Heading Name → slug; plain fragment used as-is
    const fragment = rawFragment.startsWith('section=')
      ? headingSlug(rawFragment.slice('section='.length))
      : rawFragment;

    // Try fuzzy matching if PageNameMatcher is available
    let matchedPage: string | null = null;
    if (this.pageNameMatcher) {
      const allPages = Array.from(this.pageNames);
      matchedPage = this.pageNameMatcher.findMatch(pageName, allPages);
    } else {
      // Fallback to exact match
      matchedPage = this.pageNames.has(pageName) ? pageName : null;
    }

    const exists = matchedPage !== null;
    const targetPage = matchedPage || pageName;

    const base = exists
      ? `/view/${encodeURIComponent(targetPage)}`
      : `/edit/${encodeURIComponent(pageName)}`;
    const href = fragment ? `${base}#${fragment}` : base;

    const baseClass = exists
      ? this.options.defaultClasses.internal
      : this.options.defaultClasses.redlink;

    const attributes = this.buildAttributeString(link.attributes, {
      class: baseClass,
      ...(exists ? {} : { style: 'color: red;', title: `Create page: ${pageName}` })
    });

    return `<a href="${href}"${attributes}>${this.escapeHtml(displayText)}</a>`;
  }

  /**
   * Generate HTML for external links
   * @param {Link} link - Link object
   * @param {ParserContext} _context - Parsing context (unused)
   * @returns {string} HTML link
   */
  generateExternalLink(link: Link, _context: ParserContext): string {
    const url = link.target || link.text;
    const displayText = link.text;

    // Validate URL if security is enabled
    if (this.options.security.validateUrls && !this.isUrlSafe(url)) {
      throw new Error(`Unsafe URL: ${url}`);
    }

    const attributes = this.buildAttributeString(link.attributes, {
      class: this.options.defaultClasses.external,
      target: '_blank',
      rel: 'noopener noreferrer'
    });

    return `<a href="${this.escapeHtml(url)}"${attributes}>${this.escapeHtml(displayText)}</a>`;
  }

  /**
   * Generate HTML for InterWiki links
   * @param {Link} link - Link object
   * @param {ParserContext} _context - Parsing context (unused)
   * @returns {string} HTML link
   */
  generateInterWikiLink(link: Link, _context: ParserContext): string {
    const target = link.target || link.text;
    const displayText = link.text;

    const match = target.match(this.options.interWikiPattern);
    if (!match) {
      throw new Error(`Invalid InterWiki format: ${target}`);
    }

    const [, wikiName, pageName] = match;
    const siteConfig = this.interWikiSites.get(wikiName) ||
                       this.interWikiSites.get(wikiName.toLowerCase());

    if (!siteConfig) {
      throw new Error(`Unknown InterWiki site: ${wikiName}`);
    }

    const url = siteConfig.url.replace('%s', encodeURIComponent(pageName));

    const attributes = this.buildAttributeString(link.attributes, {
      class: `${this.options.defaultClasses.interwiki} interwiki-${wikiName.toLowerCase()}`,
      target: siteConfig.openInNewWindow !== false ? '_blank' : undefined,
      rel: siteConfig.openInNewWindow !== false ? 'noopener noreferrer' : undefined,
      title: siteConfig.description ? `${siteConfig.description}: ${displayText}` : undefined
    });

    return `<a href="${this.escapeHtml(url)}"${attributes}>${this.escapeHtml(displayText)}</a>`;
  }

  /**
   * Generate HTML for email links
   * @param {Link} link - Link object
   * @param {ParserContext} _context - Parsing context (unused)
   * @returns {string} HTML link
   */
  generateEmailLink(link: Link, _context: ParserContext): string {
    const email = link.target || link.text;
    const displayText = link.text;

    const attributes = this.buildAttributeString(link.attributes, {
      class: 'email-link'
    });

    return `<a href="${this.escapeHtml(email)}"${attributes}>${this.escapeHtml(displayText)}</a>`;
  }

  /**
   * Generate HTML for anchor links
   * @param {Link} link - Link object
   * @param {ParserContext} _context - Parsing context (unused)
   * @returns {string} HTML link
   */
  generateAnchorLink(link: Link, _context: ParserContext): string {
    const anchor = link.target || link.text;
    const displayText = link.text;

    const attributes = this.buildAttributeString(link.attributes, {
      class: 'anchor-link'
    });

    return `<a href="${this.escapeHtml(anchor)}"${attributes}>${this.escapeHtml(displayText)}</a>`;
  }

  /**
   * Build HTML attribute string
   * @param {LinkAttributes} customAttributes - Custom attributes from link
   * @param {Record<string, string | undefined>} defaultAttributes - Default attributes
   * @returns {string} HTML attribute string
   */
  buildAttributeString(customAttributes: LinkAttributes = {}, defaultAttributes: Record<string, string | undefined> = {}): string {
    const merged = { ...defaultAttributes, ...customAttributes };

    // Filter out undefined values
    const filtered = Object.entries(merged).filter(([, value]) => value !== undefined);

    if (filtered.length === 0) {
      return '';
    }

    const attrString = filtered
      .map(([key, value]) => `${key}="${this.escapeHtml(value as string)}"`)
      .join(' ');

    return ` ${attrString}`;
  }

  /**
   * Validate URL safety
   * @param {string} url - URL to validate
   * @returns {boolean} True if URL is safe
   */
  isUrlSafe(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // Only allow http and https protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Prevent suspicious patterns
      if (urlObj.hostname.includes('..') || urlObj.hostname === 'localhost') {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitize style attribute value
   * @param {string} style - Style value
   * @returns {string} Sanitized style
   */
  sanitizeStyleAttribute(style: string): string {
    // Remove potentially dangerous CSS
    return style
      .replace(/javascript:/gi, '')
      .replace(/expression\s*\(/gi, '')
      .replace(/url\s*\(/gi, '');
  }

  /**
   * Sanitize attribute value to prevent XSS
   * @param {string} value - Attribute value
   * @returns {string} Sanitized value
   */
  sanitizeAttributeValue(value: string): string {
    return value
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '');
  }

  /**
   * Escape HTML characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text: string): string {
    if (typeof text !== 'string') {
      return String(text);
    }

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Get parser statistics
   * @returns {ParserStats} Parser statistics
   */
  getStats(): ParserStats {
    return {
      pageNamesCount: this.pageNames.size,
      interWikiSitesCount: this.interWikiSites.size,
      allowedAttributes: this.options.allowedAttributes.length,
      securityEnabled: this.options.security.validateUrls
    };
  }
}

/**
 * Link class representing a parsed link
 */
export class Link {
  /** Original text from content */
  public originalText: string;

  /** Display text for the link */
  public text: string;

  /** Target page or URL */
  public target: string | null;

  /** Raw attributes string */
  public attributesString: string | null;

  /** Parsed attributes object */
  public attributes: LinkAttributes;

  /** Start index in content */
  public startIndex: number;

  /** End index in content */
  public endIndex: number;

  /**
   * Create a new Link instance
   * @param {LinkData} data - Link data
   */
  constructor(data: LinkData = {}) {
    this.originalText = data.originalText || '';
    this.text = data.text || '';
    this.target = data.target || null;
    this.attributesString = data.attributesString || null;
    this.attributes = data.attributes || {};
    this.startIndex = data.startIndex || 0;
    this.endIndex = data.endIndex || 0;
  }

  /**
   * Check if this is a simple link (no target specified)
   * @returns {boolean} True if simple link
   */
  isSimple(): boolean {
    return !this.target;
  }

  /**
   * Get the effective target (target or text if no target)
   * @returns {string} Effective target
   */
  getEffectiveTarget(): string {
    return this.target || this.text;
  }

  /**
   * Check if link has attributes
   * @returns {boolean} True if has attributes
   */
  hasAttributes(): boolean {
    return Object.keys(this.attributes).length > 0;
  }

  /**
   * Get attribute value by name
   * @param {string} name - Attribute name
   * @returns {string | undefined} Attribute value
   */
  getAttribute(name: string): string | undefined {
    return this.attributes[name.toLowerCase()];
  }

  /**
   * Set attribute value
   * @param {string} name - Attribute name
   * @param {string} value - Attribute value
   */
  setAttribute(name: string, value: string): void {
    if (typeof name === 'string' && value !== undefined) {
      this.attributes[name.toLowerCase()] = value;
    }
  }

  /**
   * Get link information as object
   * @returns {LinkInfo} Link information
   */
  toObject(): LinkInfo {
    return {
      originalText: this.originalText,
      text: this.text,
      target: this.target,
      attributes: { ...this.attributes },
      isSimple: this.isSimple(),
      hasAttributes: this.hasAttributes()
    };
  }
}

export default { LinkParser, Link };

