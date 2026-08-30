import BaseFilter from './BaseFilter.js';
import logger from '../../utils/logger.js';
import type { FilterValidationError } from './FilterChain.js';

/**
 * Security configuration interface
 */
interface SecurityConfig {
  preventXSS: boolean;
  preventCSRF: boolean;
  sanitizeHTML: boolean;
  stripDangerousContent: boolean;
  allowJavaScript: boolean;
  allowInlineEvents: boolean;
  allowExternalLinks: boolean;
  allowDataURIs: boolean;
  maxContentLength: number;
  logSecurityViolations: boolean;
  /** Filter RENDERED output. Separate from save-time blocking (#1037). */
  renderFiltering: boolean;
}

/**
 * Security violation log entry
 */
interface SecurityViolation {
  type: string;
  pageName: string;
  userName: string;
  originalLength: number;
  filteredLength: number;
  timestamp: string;
  /** #1115: was `string`, so a severity the audit layer rejects compiled fine. */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Parse context interface
 */
interface ParseContext {
  pageName?: string;
  userName?: string;
  engine?: {
    getManager: (name: string) => unknown;
  };
}

/**
 * Initialization context interface
 */
interface InitContext {
  engine?: {
    getManager: (name: string) => unknown;
  };
}

/**
 * Configuration manager interface
 */
interface ConfigManager {
  getProperty: (key: string, defaultValue: unknown) => unknown;
}

/**
 * Audit manager interface
 */
interface AuditManager {
  /**
   * #1115: this used to be declared `(violation) => void`, a shape
   * AuditManager has never had. The call compiled and passed `undefined` for
   * eventType, severity and description on every security violation.
   */
  logSecurityEvent: (
    context: Record<string, unknown>,
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    description: string
  ) => void;
}

/**
 * SecurityFilter - Comprehensive security validation with modular configuration
 *
 * Provides XSS prevention, CSRF protection, HTML sanitization, and dangerous content
 * detection with complete configurability through app-default-config.json and
 * app-custom-config.json override system.
 *
 * Design Principles:
 * - Security-by-default with configurable relaxation
 * - Complete modularity through JSON configuration
 * - Zero hardcoded security rules - everything configurable
 * - Deployment-specific security levels
 *
 * Related Issue: Phase 4 - Security Filter Suite
 * Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support
 */
class SecurityFilter extends BaseFilter {
  declare filterId: string;
  securityConfig: SecurityConfig | null;
  allowedTags: Set<string>;
  allowedAttributes: Set<string>;
  dangerousPatterns: RegExp[];

  constructor() {
    super(
      110, // Very high priority - execute before most other filters
      {
        description: 'Comprehensive security filter with XSS, CSRF, and HTML sanitization',
        version: '1.0.0',
        category: 'security',
        cacheResults: true,
        cacheTTL: 300, // Security results cache shorter
        // Operates on rendered HTML, not on raw markdown — XSS / dangerous-tag
        // stripping needs the actual HTML constructs to exist (#614).
        phase: 'html'
      }
    );
    this.filterId = 'SecurityFilter';
    this.securityConfig = null;
    this.allowedTags = new Set();
    this.allowedAttributes = new Set();
    this.dangerousPatterns = [];
  }

  /**
   * Initialize filter with modular security configuration
   * @param context - Initialization context
   */
  async onInitialize(context: InitContext): Promise<void> {
    // Load modular security configuration from app-default/custom-config.json
    this.loadModularSecurityConfiguration(context);

    logger.debug('🔒 SecurityFilter initialized with modular configuration:');
    logger.debug(`   🛡️  XSS Prevention: ${this.securityConfig?.preventXSS ? 'enabled' : 'disabled'}`);
    logger.debug(`   🔐 CSRF Protection: ${this.securityConfig?.preventCSRF ? 'enabled' : 'disabled'}`);
    logger.debug(`   🧹 HTML Sanitization: ${this.securityConfig?.sanitizeHTML ? 'enabled' : 'disabled'}`);
    logger.debug(`   🏷️  Allowed tags: ${this.allowedTags.size} configured`);
    logger.debug(`   📝 Allowed attributes: ${this.allowedAttributes.size} configured`);
  }

  /**
   * Load modular security configuration from configuration hierarchy
   * @param context - Initialization context
   */
  loadModularSecurityConfiguration(context: InitContext): void {
    const configManager = context.engine?.getManager('ConfigurationManager') as ConfigManager | undefined;

    // Always establish the allow-list baseline; configuration ADDS to it.
    // These used to load only when there was no ConfigurationManager or when
    // reading configuration threw — i.e. on the failure paths only. On the
    // normal path the allow-list came solely from `allowed-tags`, so an
    // instance that never set that key ran with an EMPTY list, and
    // sanitizeHTML's empty-list branch strips every tag in the document.
    // "Secure defaults" that apply only when something has already gone wrong
    // are not defaults. #1032.
    this.loadSecureDefaults();

    // Default security configuration (secure by default)
    this.securityConfig = {
      preventXSS: true,
      preventCSRF: true,
      sanitizeHTML: true,
      stripDangerousContent: true,
      allowJavaScript: false,
      allowInlineEvents: false,
      allowExternalLinks: true,
      allowDataURIs: false,
      maxContentLength: 1048576, // 1MB default
      logSecurityViolations: true,
      renderFiltering: false
    };

    // Load from app-default-config.json and allow app-custom-config.json overrides
    if (configManager) {
      try {
        // Security feature configuration (modular)
        this.securityConfig.renderFiltering = configManager.getProperty('ngdpbase.filters.security.enabled', false) as boolean;
        this.securityConfig.preventXSS = configManager.getProperty('ngdpbase.filters.security.prevent-xss', this.securityConfig.preventXSS) as boolean;
        this.securityConfig.preventCSRF = configManager.getProperty('ngdpbase.filters.security.prevent-csrf', this.securityConfig.preventCSRF) as boolean;
        this.securityConfig.sanitizeHTML = configManager.getProperty('ngdpbase.filters.security.sanitize-html', this.securityConfig.sanitizeHTML) as boolean;
        this.securityConfig.stripDangerousContent = configManager.getProperty('ngdpbase.filters.security.strip-dangerous-content', this.securityConfig.stripDangerousContent) as boolean;

        // Load allowed HTML tags (modular security policy)
        const allowedTagsString = configManager.getProperty('ngdpbase.filters.security.allowed-tags', '') as string;
        if (allowedTagsString) {
          allowedTagsString.split(',').forEach(tag => {
            const cleanTag = tag.trim().toLowerCase();
            if (cleanTag) this.allowedTags.add(cleanTag);
          });
        }

        // Load allowed HTML attributes (modular security policy)
        const allowedAttrsString = configManager.getProperty('ngdpbase.filters.security.allowed-attributes', '') as string;
        if (allowedAttrsString) {
          allowedAttrsString.split(',').forEach(attr => {
            const cleanAttr = attr.trim().toLowerCase();
            if (cleanAttr) this.allowedAttributes.add(cleanAttr);
          });
        }

        // Advanced security settings (configurable)
        this.securityConfig.allowJavaScript = configManager.getProperty('ngdpbase.filters.security.allow-javascript', this.securityConfig.allowJavaScript) as boolean;
        this.securityConfig.allowDataURIs = configManager.getProperty('ngdpbase.filters.security.allow-data-uris', this.securityConfig.allowDataURIs) as boolean;
        this.securityConfig.maxContentLength = configManager.getProperty('ngdpbase.filters.security.max-content-length', this.securityConfig.maxContentLength) as number;

      } catch (error) {
        const err = error as Error;
        logger.warn('⚠️  Failed to load SecurityFilter configuration, using secure defaults:', err.message);
      }
    }

    // Initialize dangerous patterns based on configuration
    this.initializeDangerousPatterns();
  }

  /**
   * Load secure default configuration when configuration files unavailable
   */
  loadSecureDefaults(): void {
    // Everything ngdpbase's own markup renders. The previous list omitted
    // tables, code blocks, blockquotes and horizontal rules, so enabling this
    // filter silently deleted them from every page — a quieter version of the
    // same "turning it on breaks the site" problem as the encoding bug (#1032).
    //
    // Safety here comes from the list being closed, not short: `script`,
    // `iframe`, `object`, `embed`, `form`, `svg` and friends are absent, and
    // the attribute allow-list below excludes every `on*` handler.
    const defaultTags = [
      'p', 'div', 'span', 'br', 'hr',
      'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'img', 'figure', 'figcaption',
      // Plugin output only in practice: an author-written <iframe> is refused
      // at save (collectErrors), so the ones reaching render come from our own
      // plugins — LocationPlugin's embedded maps. See the note in
      // initializeDangerousPatterns (#1037).
      'iframe',
      'blockquote', 'q', 'cite',
      'code', 'pre', 'kbd', 'samp', 'var',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
      'abbr', 'time', 'details', 'summary'
    ];
    defaultTags.forEach(tag => this.allowedTags.add(tag));

    // No `on*` handlers, no `style` (CSS is an injection surface of its own).
    // `colspan`/`rowspan` and `datetime` are needed by the tags above.
    const defaultAttrs = [
      'class', 'id', 'href', 'src', 'alt', 'title',
      'colspan', 'rowspan', 'scope', 'datetime', 'cite', 'lang', 'dir',
      'width', 'height', 'loading', 'open'
    ];
    defaultAttrs.forEach(attr => this.allowedAttributes.add(attr));
  }

  /**
   * Initialize dangerous patterns based on configuration (modular security patterns)
   */
  initializeDangerousPatterns(): void {
    this.dangerousPatterns = [];

    // Every pattern here is anchored to a TAG, and stripDangerousContent only
    // ever applies them inside `<...>` (#1037).
    //
    // They used to be bare substring patterns run over the whole document, and
    // every one of them fired on ordinary prose:
    //
    //   /on\w+\s*=/       matched `validati·onManager =`   — 23 hits on one page
    //   /data:/           matched `meta·data:`             — 10 hits on one page
    //   /expression\s*\(/ matched "gene expression ("      — 5 pages
    //   /javascript:/     matched prose discussing the URL scheme
    //
    // Those were three separate symptoms of one mistake: scanning text for
    // things that can only mean something inside a tag. You cannot write HTML
    // without angle brackets, so scoping to tags removes the entire class
    // rather than patching each instance — including the ones not yet hit.
    //
    // It also makes fenced code safe for free: by this phase Showdown has
    // escaped text `<` to `&lt;`, so anything still bracketed IS a tag.

    if (this.securityConfig?.preventXSS) {
      this.dangerousPatterns.push(
        /^<\s*script\b/i,                               // <script>
        // NOT framing tags. Enforced at SAVE instead (see collectErrors), for
        // a reason specific to where each check sits in the pipeline:
        //
        // Save-time sees what the AUTHOR wrote, and refuses a raw <iframe>
        // outright. Render-time sees plugin output as well — LocationPlugin
        // emits an <iframe> for embedded maps — and cannot tell the two apart,
        // because by then both are just tags. Blocking here removed every
        // embedded map on the wiki; the e2e suite caught it (#1037).
        //
        // So the guarantee is "an author cannot introduce a frame", enforced
        // where that distinction still exists. Content predating the save rule
        // is the residual gap — one page at the time of writing. A src
        // host allow-list would close it and let authors embed maps
        // deliberately; not built, and it needs a config key.
        // NOT an event-handler pattern. sanitizeHTML's attribute allow-list
        // already drops `onclick` while KEEPING the tag and its href — a
        // strictly better outcome than deleting the whole element, which is
        // what a pattern here would do. Two mechanisms for one job is how
        // preventXSS and sanitizeHTML ended up fighting (#1032).
        /(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i,
        /style\s*=\s*["'][^"']*expression\s*\(/i       // legacy IE CSS
      );
    }

    if (!this.securityConfig?.allowDataURIs) {
      this.dangerousPatterns.push(/(?:href|src|action)\s*=\s*["']?\s*data:/i);
    }

    if (this.securityConfig?.stripDangerousContent) {
      this.dangerousPatterns.push(
        /^<\s*(?:meta|link|style|form)\b/i               // not allow-listed anyway
      );
    }
  }

  /**
   * Process content through security filters with modular validation
   * @param content - Content to filter
   * @param context - Parse context
   * @returns Securely filtered content
   */

  /**
   * Constructs that must never reach a stored page (#1037).
   *
   * Scanned against the page SOURCE at save time, which is a different input
   * from what `process()` sees. `process()` is `phase: 'html'` and operates on
   * Showdown's rendered output; this runs before any rendering, on exactly the
   * markdown the author typed. Reusing the render-time logic here is the
   * mistake that made `preventXSS()` entity-encode whole documents.
   *
   * Scanning source is also what makes line numbers meaningful — the author
   * can be pointed at the line they need to change.
   *
   * Deliberately narrow. Everything here executes script or frames third-party
   * content; none of it has a legitimate use in a wiki page, so a false
   * positive is unlikely and the message can be specific. Ordinary raw HTML —
   * `<div>`, `<span>`, tables — is untouched: on a trusted-author wiki that is
   * a feature, and the render-time allow-list is where that judgement belongs.
   */
  private static readonly BLOCKED_PATTERNS: Array<{
    rule: string;
    pattern: RegExp;
    message: string;
  }> = [
      {
        rule: 'no-script-tag',
        pattern: /<script\b/i,
        message: 'A <script> tag is not allowed in page content'
      },
      {
        rule: 'no-event-handler',
        pattern: /<[^>]*\son[a-z]+\s*=/i,
        message: 'Inline event handlers (onclick, onload, onerror, …) are not allowed'
      },
      {
        rule: 'no-javascript-url',
        pattern: /(?:href|src|action)\s*=\s*["']?\s*javascript:/i,
        message: 'javascript: URLs are not allowed'
      },
      {
        rule: 'no-embedded-frame',
        pattern: /<(?:iframe|object|embed|applet)\b/i,
        message: 'Embedding external content (<iframe>, <object>, <embed>) is not allowed'
      },
      {
        rule: 'no-inline-svg',
        pattern: /<svg\b/i,
        message: 'Inline <svg> is not allowed — it can carry scripted content'
      },
      {
        // Not a security rule — a markup one. <br> is embedded HTML and NCM
        // has its own line break, so this keeps page source in one language.
        //
        // Enforced ONLY at save. It cannot be done at render: `\\` is turned
        // into a <br> during the markup phase (MarkupParser), so by the time
        // the html-phase allow-list runs an author's <br> and one NCM
        // generated are byte-identical. Dropping `br` from the allow-list
        // would therefore break `\\`, `\\\` and table-cell breaks too.
        rule: 'no-raw-br',
        pattern: /<br\s*\/?>/i,
        message: 'Use \\\\ for a line break instead of <br> — see the Markdown Cheat Sheet'
      }
    ];


  /**
   * Replace code spans and fenced blocks with blank lines of the same count,
   * so scanning sees no code but reported line numbers still match the source.
   */
  private static blankOutCode(content: string): string {
    return content
      // Fenced blocks: keep one newline per line consumed.
      .replace(/^```[\s\S]*?^```/gm, (block) => '\n'.repeat(block.split('\n').length - 1))
      // Indented code blocks (four spaces or a tab).
      .replace(/^(?: {4}|\t).*$/gm, '')
      // Inline code spans.
      .replace(/`[^`\n]*`/g, '');
  }

  /**
   * Blocking violations for the save path. See BaseFilter.collectErrors.
   *
   * Reports every offending line rather than stopping at the first, so an
   * author fixing a page is not sent round the loop once per problem.
   */
  async collectErrors(
    content: string,
    _context: ParseContext = {}
  ): Promise<FilterValidationError[]> {
    if (!content) return [];

    const errors: FilterValidationError[] = [];
    // Blank out code, keeping line numbering intact, so a page that DOCUMENTS
    // HTML is not refused (#1037). Content in a fence or in backticks renders
    // as escaped text and cannot execute — that is precisely the convention
    // "HTML in docs belongs in backticks" already relies on.
    //
    // Without this, editing WikiFormsPlugin or any page explaining <script>
    // fails to save, which on a wiki that documents HTML is not an edge case.
    const lines = SecurityFilter.blankOutCode(content).split('\n');

    for (const { rule, pattern, message } of SecurityFilter.BLOCKED_PATTERNS) {
      lines.forEach((text, index) => {
        if (pattern.test(text)) {
          errors.push({
            filterId: this.filterId,
            rule,
            severity: 'error',
            message,
            line: index + 1
          });
        }
      });
    }

    return Promise.resolve(errors);
  }

  async process(content: string, context: ParseContext): Promise<string> {
    if (!content) {
      return content;
    }

    // Save-time blocking and render filtering are separate switches (#1037).
    // When only the former is on, this filter is registered purely so
    // FilterChain.collectErrors() can reach it — it must not touch rendered
    // output, which is largely our own HTML: plugins emit inline onclick,
    // style, and an <iframe> for embedded maps, none of which can be told
    // apart from author content once rendered.
    if (this.securityConfig && !this.securityConfig.renderFiltering) {
      return content;
    }

    // Check content length limit (configurable)
    if (this.securityConfig && content.length > this.securityConfig.maxContentLength) {
      throw new Error(`Content exceeds maximum length limit: ${this.securityConfig.maxContentLength} characters`);
    }

    // Preserve HTMLTOKEN placeholders from HTML protection system
    const htmlTokens: string[] = [];
    let secureContent = content.replace(/HTMLTOKEN\d+HTMLTOKEN/g, (match) => {
      const placeholder = `SECURITYPROTECTED${htmlTokens.length}SECURITYPROTECTED`;
      htmlTokens.push(match);
      return placeholder;
    });

    // Apply security filters based on configuration
    if (this.securityConfig?.stripDangerousContent) {
      secureContent = this.stripDangerousContent(secureContent);
    }

    // NOT preventXSS() here. This filter declares `phase: 'html'`, so `content`
    // is Showdown's rendered output — real markup, not untrusted text. Blanket
    // entity-encoding every < > " ' turned the whole page into visible HTML
    // source (`&lt;p&gt;Some &lt;strong&gt;bold&lt;/strong&gt;`), which is why
    // enabling this filter broke rendering outright and why it has shipped
    // disabled since #596. It also ran BEFORE sanitizeHTML, leaving no tags for
    // the allow-list to match — so the actual sanitiser was dead code.
    //
    // At this stage Showdown has already entity-encoded `<` appearing in text,
    // so anything still shaped like a tag IS a tag. The allow-list is therefore
    // the right tool, and `prevent-xss` is honoured through it: enabling that
    // option activates the dangerous-pattern set (see initializeDangerousPatterns)
    // which stripDangerousContent applies above. #1032.
    if (this.securityConfig?.sanitizeHTML || this.securityConfig?.preventXSS) {
      secureContent = this.sanitizeHTML(secureContent);
    }

    // Log security violations if configured
    if (this.securityConfig?.logSecurityViolations && secureContent !== content) {
      this.logSecurityViolation(content, secureContent, context);
    }

    // Restore HTMLTOKEN placeholders after security filtering
    secureContent = secureContent.replace(/SECURITYPROTECTED(\d+)SECURITYPROTECTED/g, (_match, index) => {
      return htmlTokens[parseInt(index as string)] || _match;
    });

    return secureContent;
  }

  /**
   * Strip dangerous content based on configured patterns (modular security)
   * @param content - Content to clean
   * @returns Cleaned content
   */
  stripDangerousContent(content: string): string {
    // Inspect TAGS ONLY. Text is never examined, because text cannot execute:
    // script needs a tag, and everything else needs an attribute inside one.
    //
    // Applying these patterns to the whole document is what mangled ordinary
    // prose and code samples — `metadata:`, `validationManager =`, "gene
    // expression (" — replacing fragments of words mid-sentence with an HTML
    // comment. Scoping to `<...>` makes that impossible by construction rather
    // than by anchoring each pattern and hoping the next one is careful.
    //
    // A tag is dropped whole when it matches, and its inner text is left
    // behind: `<iframe>caption</iframe>` loses the framing but keeps the words.
    // Removing the run between open and close tags would delete legitimate
    // content along with the wrapper.
    return content.replace(/<[^>]*>/g, (tag) => {
      for (const pattern of this.dangerousPatterns) {
        // Patterns are single-match (no /g), so lastIndex cannot carry between
        // tags — a stateful regex here would skip every other match.
        if (pattern.test(tag)) {
          return '<!-- Dangerous content removed by SecurityFilter -->';
        }
      }
      return tag;
    });
  }

  /**
   * Prevent XSS attacks (modular XSS prevention)
   * @param content - Content to protect
   * @returns XSS-safe content
   */
  /**
   * Entity-encode every `<` `>` `"` `'`.
   *
   * NOT used by `process()`, and must not be: this filter runs at the `html`
   * phase, where the input is rendered markup and encoding it wholesale turns
   * the page into visible source (#1032). Retained for callers that genuinely
   * hold untrusted *text* and want it inert.
   */
  preventXSS(content: string): string {
    // Encode potentially dangerous characters
    return content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/&(?!(?:amp|lt|gt|quot|#39);)/g, '&amp;');
  }

  /**
   * Sanitize HTML based on allowed tags and attributes (modular HTML sanitization)
   * @param content - Content to sanitize
   * @returns Sanitized content
   */
  sanitizeHTML(content: string): string {
    if (this.allowedTags.size === 0) {
      // If no tags allowed, strip all HTML
      return content.replace(/<[^>]*>/g, '');
    }

    // Simple HTML sanitization (in production, would use a library like DOMPurify)
    let sanitized = content;

    // Remove disallowed tags
    const tagRegex = /<(\/?)([\w-]+)([^>]*)>/g;
    sanitized = sanitized.replace(tagRegex, (match: string, closing: string, tagName: string, attributes: string) => {
      const tag = tagName.toLowerCase();

      if (!this.allowedTags.has(tag)) {
        return ''; // Remove disallowed tag
      }

      // Sanitize attributes if tag is allowed
      if (attributes && !closing) {
        const sanitizedAttrs = this.sanitizeAttributes(attributes);
        return `<${tag}${sanitizedAttrs}>`;
      }

      return match; // Keep allowed tag as-is
    });

    return sanitized;
  }

  /**
   * Sanitize HTML attributes based on allowed attributes (modular attribute sanitization)
   * @param attributeString - Attributes to sanitize
   * @returns Sanitized attributes
   */
  sanitizeAttributes(attributeString: string): string {
    if (this.allowedAttributes.size === 0) {
      return ''; // No attributes allowed
    }

    const sanitizedAttrs: string[] = [];
    // `[\w-]`, not `\w`: hyphens are legal in attribute names and our own
    // output is full of them — 71 distinct data-* attributes, Bootstrap's
    // data-bs-* among them. With `\w+` the regex matched the fragment after
    // the hyphen (`lat="…"` out of `data-lat="…"`), so the attribute was
    // neither recognised nor preserved.
    const attrRegex = /([\w-]+)=["']([^"']*)["']/g;
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(attributeString)) !== null) {
      const attrName = (match[1] ?? '').toLowerCase();
      const attrValue = match[2] ?? '';

      // data-* is inert: it carries values for scripts to read but cannot
      // execute anything itself, and enumerating 71 of them (plus whatever a
      // plugin adds next) would be a permanent maintenance tax.
      const isDataAttribute = attrName.startsWith('data-');

      if (isDataAttribute || this.allowedAttributes.has(attrName)) {
        // Additional validation for specific attributes
        if (attrName === 'href' && !this.isValidURL(attrValue)) {
          continue; // Skip invalid URLs
        }
        if (attrName === 'src' && !this.isValidURL(attrValue)) {
          continue; // Skip invalid image sources
        }

        sanitizedAttrs.push(`${attrName}="${this.escapeAttributeValue(attrValue)}"`);
      }
    }

    return sanitizedAttrs.length > 0 ? ' ' + sanitizedAttrs.join(' ') : '';
  }

  /**
   * Validate URL for href and src attributes (modular URL validation)
   * @param url - URL to validate
   * @returns True if valid and safe
   */
  isValidURL(url: string): boolean {
    try {
      // Allow relative URLs
      if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
        return true;
      }

      // Validate absolute URLs
      const urlObj = new URL(url);

      // Allow only safe protocols
      // geo:/tel:/sms: hand off to a device app and cannot execute script.
      // LocationPlugin emits geo: URIs, and stripping them silently removed
      // every map link on the page — caught by the e2e suite when this filter
      // was first enabled by default (#1037).
      const safeProtocols = ['http:', 'https:', 'mailto:', 'geo:', 'tel:', 'sms:'];
      if (!safeProtocols.includes(urlObj.protocol)) {
        return false;
      }

      // Prevent data URIs if configured
      if (!this.securityConfig?.allowDataURIs && urlObj.protocol === 'data:') {
        return false;
      }

      return true;

    } catch {
      return false; // Invalid URL format
    }
  }

  /**
   * Escape attribute values to prevent injection (modular escaping)
   * @param value - Attribute value to escape
   * @returns Escaped value
   */
  escapeAttributeValue(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Log security violation for monitoring (modular logging)
   * @param originalContent - Original content
   * @param filteredContent - Filtered content
   * @param context - Parse context
   */
  logSecurityViolation(originalContent: string, filteredContent: string, context: ParseContext): void {
    const violation: SecurityViolation = {
      type: 'SECURITY_FILTER_VIOLATION',
      pageName: context.pageName || '',
      userName: context.userName || '',
      originalLength: originalContent.length,
      filteredLength: filteredContent.length,
      timestamp: new Date().toISOString(),
      severity: 'medium'
    };

    logger.warn('🔒 Security violation detected and filtered:', violation);

    // Send to audit system if available
    const auditManager = context.engine?.getManager('AuditManager') as AuditManager | null;
    if (auditManager) {
      auditManager.logSecurityEvent(
        {
          user: { username: violation.userName },
          resource: violation.pageName,
          resourceType: 'page',
          violation
        },
        violation.type,
        violation.severity,
        `Security filter removed ${violation.originalLength - violation.filteredLength} characters from ${violation.pageName || 'a page'}`
      );
    }
  }

  /**
   * Get security configuration summary (modular introspection)
   * @returns Security configuration summary
   */
  getSecurityConfiguration(): Record<string, unknown> {
    return {
      features: {
        preventXSS: this.securityConfig?.preventXSS || false,
        preventCSRF: this.securityConfig?.preventCSRF || false,
        sanitizeHTML: this.securityConfig?.sanitizeHTML || false,
        stripDangerousContent: this.securityConfig?.stripDangerousContent || false
      },
      limits: {
        maxContentLength: this.securityConfig?.maxContentLength || 0,
        allowedTagCount: this.allowedTags.size,
        allowedAttributeCount: this.allowedAttributes.size,
        dangerousPatternCount: this.dangerousPatterns.length
      },
      policy: {
        allowJavaScript: this.securityConfig?.allowJavaScript || false,
        allowInlineEvents: this.securityConfig?.allowInlineEvents || false,
        allowExternalLinks: this.securityConfig?.allowExternalLinks || true,
        allowDataURIs: this.securityConfig?.allowDataURIs || false
      },
      allowedTags: Array.from(this.allowedTags),
      allowedAttributes: Array.from(this.allowedAttributes)
    };
  }

  /**
   * Get filter information for debugging and documentation
   * @returns Filter information
   */
  getInfo(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      securityConfiguration: this.getSecurityConfiguration(),
      features: [
        'XSS prevention with configurable detection patterns',
        'CSRF protection validation',
        'HTML sanitization with allowed tag/attribute lists',
        'Dangerous content stripping',
        'URL validation for href and src attributes',
        'Configurable security levels',
        'Security violation logging',
        'Modular configuration system',
        'Deployment-specific security policies'
      ],
      configurationSources: [
        'app-default-config.json (base security policy)',
        'app-custom-config.json (environment-specific overrides)',
        'Runtime security level adjustments',
        'Secure defaults for missing configuration'
      ]
    };
  }
}

export default SecurityFilter;

