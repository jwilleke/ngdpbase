import BaseSyntaxHandler, { InitializationContext, ParseContext } from './BaseSyntaxHandler.js';
import logger from '../../utils/logger.js';

/**
 * Wiki link match information
 */
interface WikiLinkMatch {
  fullMatch: string;
  displayText: string;
  target: string | null;
  parameters: string | null;
  index: number;
  length: number;
}

/**
 * Page object from PageManager
 */
interface PageInfo {
  name: string;
}

/**
 * Page manager interface
 */
interface PageManager {
  getAllPages(): Promise<PageInfo[]>;
}

/**
 * Wiki engine interface
 */
interface WikiEngine {
  getManager(name: string): unknown;
}

/**
 * WikiLinkHandler - Internal wiki link processing (CRITICAL for basic functionality)
 *
 * Supports JSPWiki/ngdpbase link syntax:
 * - [PageName] - Simple internal links
 * - [DisplayText|TargetPage] - Links with custom display text
 * - [DisplayText|TargetPage|target=_blank] - Links with parameters
 *
 * This handler is ESSENTIAL for basic wiki functionality and was missing from our MarkupParser,
 * causing link processing failures on page load.
 */
class WikiLinkHandler extends BaseSyntaxHandler {
  declare handlerId: string;
  private engine: WikiEngine | null;
  private cachedPageNames: string[];

  constructor(engine: WikiEngine | null = null) {
    super(
      /\[([a-zA-Z0-9_\- ]+)(?:\|([a-zA-Z0-9_\-/ .:?=&]+))?(?:\|([^|\]]+))?\]/g, // Wiki link pattern
      50, // Lower priority - process after other handlers but before markdown
      {
        description: 'Internal wiki link processor (essential for basic wiki functionality)',
        version: '1.0.0',
        dependencies: ['PageManager'],
        timeout: 3000
      }
    );
    this.handlerId = 'WikiLinkHandler';
    this.engine = engine;
    this.cachedPageNames = [];
  }

  /**
   * Initialize handler
   * @param context - Initialization context
   */
  protected async onInitialize(context: InitializationContext): Promise<void> {
    this.engine = context.engine ?? null;

    // Load page names for link validation
    await this.loadPageNames();

    logger.debug(`WikiLinkHandler initialized with ${this.cachedPageNames.length} known pages`);
  }

  /**
   * Load page names for link processing
   */
  private async loadPageNames(): Promise<void> {
    try {
      const pageManager = this.engine?.getManager('PageManager') as PageManager | undefined;
      if (pageManager) {
        const pages = await pageManager.getAllPages();
        this.cachedPageNames = pages.map(page => page.name);
      }
    } catch (error) {
      const err = error as Error;
      logger.warn('Could not load page names for WikiLinkHandler:', err.message);
    }
  }

  /**
   * Process content by converting wiki links to HTML
   * @param content - Content to process
   * @param context - Parse context
   * @returns Content with wiki links converted
   */
  async process(content: string, context: ParseContext): Promise<string> {
    if (!content) {
      return content;
    }

    const matches: WikiLinkMatch[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.pattern.lastIndex = 0;

    while ((match = this.pattern.exec(content)) !== null) {
      matches.push({
        fullMatch: match[0],
        displayText: match[1] ?? '',
        target: match[2] ?? null,
        parameters: match[3] ?? null,
        index: match.index,
        length: match[0].length
      });
    }

    // Process matches in reverse order to maintain string positions
    let processedContent = content;

    for (let i = matches.length - 1; i >= 0; i--) {
      const matchInfo = matches[i];

      try {
        const replacement = await this.handleMatch(matchInfo, context);

        processedContent =
          processedContent.slice(0, matchInfo.index) +
          replacement +
          processedContent.slice(matchInfo.index + matchInfo.length);

      } catch (error) {
        const err = error as Error;
        logger.error('Wiki link processing error:', err.message);
        // Leave original link on error
      }
    }

    return processedContent;
  }

  /**
   * Handle a specific wiki link match
   * @param matchInfo - Wiki link match information
   * @param _context - Parse context
   * @returns HTML link
   */
  private async handleMatch(matchInfo: WikiLinkMatch, _context: ParseContext): Promise<string> {
    const { displayText, target, parameters } = matchInfo;

    // Determine target page (use target if provided, otherwise displayText)
    const targetPage = target || displayText;
    const linkText = displayText;

    // Parse parameters if provided
    let linkAttributes = '';
    if (parameters) {
      linkAttributes = this.parseLinkParameters(parameters);
    }

    // Check if target page exists (default to normal links if page list unavailable)
    const pageExists = this.cachedPageNames.length > 0 ? this.cachedPageNames.includes(targetPage) : true;

    if (pageExists || this.cachedPageNames.length === 0) {
      // Create link to existing page (or assume exists if page list unavailable)
      const encodedTarget = encodeURIComponent(targetPage);
      return `<a href="/view/${encodedTarget}"${linkAttributes}>${this.escapeHtml(linkText)}</a>`;
    } else {
      // Create red link for non-existent page
      const encodedTarget = encodeURIComponent(targetPage);
      return `<a href="/edit/${encodedTarget}" class="red-link" title="Create page: ${this.escapeHtml(targetPage)}"${linkAttributes}>${this.escapeHtml(linkText)}</a>`;
    }
  }

  /**
   * Parse link parameters
   * @param paramString - Parameter string
   * @returns HTML attributes
   */
  private parseLinkParameters(paramString: string): string {
    let attributes = '';

    // Parse target attribute
    const targetMatch = paramString.match(/target=['"]([^'"]+)['"]/);
    if (targetMatch) {
      attributes += ` target="${targetMatch[1]}"`;
      if (targetMatch[1] === '_blank') {
        attributes += ' rel="noopener noreferrer"';
      }
    }

    // Parse class attribute
    const classMatch = paramString.match(/class=['"]([^'"]+)['"]/);
    if (classMatch) {
      attributes += ` class="${classMatch[1]}"`;
    }

    // Parse title attribute
    const titleMatch = paramString.match(/title=['"]([^'"]+)['"]/);
    if (titleMatch) {
      attributes += ` title="${titleMatch[1]}"`;
    }

    return attributes;
  }

  /**
   * Escape HTML to prevent XSS
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
   * Get handler information
   * @returns Handler information
   */
  getInfo(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      features: [
        'Internal wiki link processing',
        'Red link creation for non-existent pages',
        'Link parameter parsing',
        'Page existence validation',
        'XSS prevention',
        'Essential for basic wiki functionality'
      ],
      supportedPatterns: [
        '[PageName]',
        '[Display Text|TargetPage]',
        '[Display Text|TargetPage|target=_blank]',
        '[Display Text|TargetPage|class=special]'
      ]
    };
  }
}

export default WikiLinkHandler;

