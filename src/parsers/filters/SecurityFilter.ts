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
  severity: string;
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
  logSecurityEvent: (violation: SecurityViolation) => void;
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
      logSecurityViolations: true
    };

    // Load from app-default-config.json and allow app-custom-config.json overrides
    if (configManager) {
      try {
        // Security feature configuration (modular)
        this.securityConfig.preventXSS = configManager.getProperty('ngdpbase.markup.filters.security.prevent-xss', this.securityConfig.preventXSS) as boolean;
        this.securityConfig.preventCSRF = configManager.getProperty('ngdpbase.markup.filters.security.prevent-csrf', this.securityConfig.preventCSRF) as boolean;
        this.securityConfig.sanitizeHTML = configManager.getProperty('ngdpbase.markup.filters.security.sanitize-html', this.securityConfig.sanitizeHTML) as boolean;
        this.securityConfig.stripDangerousContent = configManager.getProperty('ngdpbase.markup.filters.security.strip-dangerous-content', this.securityConfig.stripDangerousContent) as boolean;

        // Load allowed HTML tags (modular security policy)
        const allowedTagsString = configManager.getProperty('ngdpbase.markup.filters.security.allowed-tags', '') as string;
        if (allowedTagsString) {
          allowedTagsString.split(',').forEach(tag => {
            const cleanTag = tag.trim().toLowerCase();
            if (cleanTag) this.allowedTags.add(cleanTag);
          });
        }

        // Load allowed HTML attributes (modular security policy)
        const allowedAttrsString = configManager.getProperty('ngdpbase.markup.filters.security.allowed-attributes', '') as string;
        if (allowedAttrsString) {
          allowedAttrsString.split(',').forEach(attr => {
            const cleanAttr = attr.trim().toLowerCase();
            if (cleanAttr) this.allowedAttributes.add(cleanAttr);
          });
        }

        // Advanced security settings (configurable)
        this.securityConfig.allowJavaScript = configManager.getProperty('ngdpbase.markup.filters.security.allow-javascript', this.securityConfig.allowJavaScript) as boolean;
        this.securityConfig.allowDataURIs = configManager.getProperty('ngdpbase.markup.filters.security.allow-data-uris', this.securityConfig.allowDataURIs) as boolean;
        this.securityConfig.maxContentLength = configManager.getProperty('ngdpbase.markup.filters.security.max-content-length', this.securityConfig.maxContentLength) as number;

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

    if (this.securityConfig?.preventXSS) {
      this.dangerousPatterns.push(
        /<script[\s\S]*?<\/script>/gi,                    // Script tags
        /javascript:/gi,                                   // JavaScript URLs
        /on\w+\s*=/gi,                                    // Event handlers
        /expression\s*\(/gi,                              // CSS expressions
        /<iframe[\s\S]*?<\/iframe>/gi,                    // Iframe tags
        /<object[\s\S]*?<\/object>/gi,                    // Object tags
        /<embed[\s\S]*?>/gi                               // Embed tags
      );
    }

    if (!this.securityConfig?.allowDataURIs) {
      this.dangerousPatterns.push(/data:/gi);             // Data URIs
    }

    if (this.securityConfig?.stripDangerousContent) {
      this.dangerousPatterns.push(
        /<meta[\s\S]*?>/gi,                               // Meta tags
        /<link[\s\S]*?>/gi,                               // Link tags
        /<style[\s\S]*?<\/style>/gi,                      // Style tags
        /<form[\s\S]*?<\/form>/gi                         // Form tags (if not using WikiForms)
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
      }
    ];

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
    const lines = content.split('\n');

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
    let cleanedContent = content;

    for (const pattern of this.dangerousPatterns) {
      cleanedContent = cleanedContent.replace(pattern, '<!-- Dangerous content removed by SecurityFilter -->');
    }

    return cleanedContent;
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
    const attrRegex = /(\w+)=["']([^"']*)["']/g;
    let match: RegExpExecArray | null;

    while ((match = attrRegex.exec(attributeString)) !== null) {
      const attrName = (match[1] ?? '').toLowerCase();
      const attrValue = match[2] ?? '';

      if (this.allowedAttributes.has(attrName)) {
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
      const safeProtocols = ['http:', 'https:', 'mailto:'];
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
      auditManager.logSecurityEvent(violation);
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

