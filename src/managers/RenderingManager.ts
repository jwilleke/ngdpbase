/**
 * RenderingManager - Handles markdown rendering and macro expansion
 */

import BaseManager from './BaseManager.js';
import { guardShowdownInput } from '../utils/showdownGuard.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type PageManager from './PageManager.js';
import type PluginManager from './PluginManager.js';
import type NotificationManager from './NotificationManager.js';
import type MarkupParser from '../parsers/MarkupParser.js';
import type WikiContext from '../context/WikiContext.js';

/** Extract error message from unknown error type */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
import logger from '../utils/logger.js';
import showdown from 'showdown';
// Footnotes are now handled in the WikiDocument DOM pipeline (MarkupParser Steps 3.5/3.6/4)
import showdownSubSuperscript from '../extensions/showdown-sub-superscript.js';
import showdownHeadingIds from '../extensions/showdown-heading-ids.js';
import { LinkParser } from '../parsers/LinkParser.js';
import PageNameMatcher from '../utils/PageNameMatcher.js';
import { RenameMap } from '../utils/renameMap.js';
import { WikiEngine } from '../types/WikiEngine.js';
import fs from 'fs';
import path from 'path';

/**
 * Rendering configuration
 */
interface RenderingConfig {
  useAdvancedParser: boolean;
  fallbackToLegacy: boolean;
  integration: boolean;
  performanceComparison: boolean;
  logParsingMethod: boolean;
}

/**
 * Table parameters
 */
interface TableParams {
  rowNumber: number;
  style: string;
  dataStyle: string;
  headerStyle: string;
  evenRowStyle: string;
  oddRowStyle: string;
  id?: string;
  isStriped?: boolean;
}

/**
 * User context
 */
interface UserContext {
  username?: string;
  userName?: string;
  displayName?: string;
  [key: string]: unknown;
}

/**
 * Request information
 */
interface RequestInfo {
  [key: string]: unknown;
}

/**
 * Link graph structure
 */
interface LinkGraph {
  [pageName: string]: string[];
}

/**
 * RenderingManager - Handles markdown rendering and macro expansion
 *
 * Similar to JSPWiki's RenderingManager, this manager orchestrates the conversion
 * of markdown/wiki markup to HTML. It supports both legacy Showdown-based rendering
 * and the advanced MarkupParser with multi-phase processing.
 *
 * Key features:
 * - Pluggable parser system (Showdown vs MarkupParser)
 * - Wiki link parsing and resolution
 * - Link graph building for backlinks/orphaned pages
 * - Plugin and variable expansion integration
 * - Page name matching with plural support
 *
 * @class RenderingManager
 * @extends BaseManager
 *
 * @property {showdown.Converter|null} converter - Showdown markdown converter (legacy)
 * @property {Object} linkGraph - Graph of page links for backlink analysis
 * @property {LinkParser} linkParser - Parser for wiki-style links
 * @property {PageNameMatcher|null} pageNameMatcher - Matcher for page name resolution
 * @property {Object} renderingConfig - Rendering configuration (parser selection, fallback, etc.)
 *
 * @see {@link BaseManager} for base functionality
 * @see {@link MarkupParser} for advanced parsing
 *
 * @example
 * const renderingManager = engine.getManager('RenderingManager');
 * const html = await renderingManager.renderPage('# Hello World', { pageName: 'Main' });
 */
class RenderingManager extends BaseManager {
  private converter: showdown.Converter | null;
  private linkGraph: LinkGraph;
  private linkParser: LinkParser;
  private pageNameMatcher: PageNameMatcher | null;
  private renderingConfig!: RenderingConfig;
  private cachedPageNames: string[] = [];

  /**
   * Former-title → current-title map for renamed pages (#1082).
   *
   * Derived state, held next to the link graph and rebuildable from the
   * `page.rename` audit events added in #1080. Consulted only after live
   * resolution fails, so it can never override a real page.
   */
  private renameMap: RenameMap = new RenameMap();

  /**
   * Creates a new RenderingManager instance
   *
   * @constructor
   * @param {WikiEngine} engine - The wiki engine instance
   */
  constructor(engine: WikiEngine) {
    super(engine);
    this.converter = null;
    this.linkGraph = {};
    this.linkParser = new LinkParser();
    this.pageNameMatcher = null; // Will be initialized with config
  }

  /**
   * Initialize the RenderingManager
   *
   * Sets up the markdown converter, link parser, and rendering configuration.
   * Determines whether to use the advanced MarkupParser or legacy Showdown converter.
   *
   * @async
   * @param {Object} [config={}] - Configuration object (unused, reads from ConfigurationManager)
   * @returns {Promise<void>}
   *
   * @example
   * await renderingManager.initialize();
   * console.log('RenderingManager ready');
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    // Load modular rendering configuration
    this.loadRenderingConfiguration();

    // Initialize PageNameMatcher with plural matching config

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (configManager) {
      const matchEnglishPlurals = configManager.getProperty('ngdpbase.translator-reader.match-english-plurals', true) as boolean;
      const matchCamelCase = configManager.getProperty('ngdpbase.translator-reader.camel-case-links', false) as boolean;
      this.pageNameMatcher = new PageNameMatcher(matchEnglishPlurals, matchCamelCase);
    }

    // Initialize Showdown converter with table support and proper list handling

    this.converter = new showdown.Converter({
      tables: true,
      strikethrough: true,
      tasklists: true,
      simpleLineBreaks: true,
      openLinksInNewWindow: false,
      backslashEscapesHTMLTags: true,
      disableForced4SpacesIndentedSublists: true, // Allow 2-space indented sublists
      literalMidWordUnderscores: true, // Better underscore handling
      ghCodeBlocks: true, // GitHub-style code blocks
      ghHeaderIds: true, // Generate id attributes on headings for section linking (#500)
      extensions: [showdownSubSuperscript, showdownHeadingIds] // footnotes handled by MarkupParser DOM pipeline
    });

    // Build initial link graph
    await this.buildLinkGraph();

    // Initialize LinkParser with page names
    this.initializeLinkParser();

    logger.info('RenderingManager initialized');

    logger.info(`Advanced parser: ${this.renderingConfig.useAdvancedParser ? 'enabled' : 'disabled'}`);

    logger.info(`Legacy fallback: ${this.renderingConfig.fallbackToLegacy ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get the MarkupParser instance (for WikiContext integration)
   *
   * Returns the advanced MarkupParser if enabled and initialized, or null
   * if using legacy Showdown rendering.
   *
   * @returns {MarkupParser|null} MarkupParser instance if available and enabled
   *
   * @example
   * const parser = renderingManager.getParser();
   * if (parser) {
   *   const html = await parser.parse(content, options);
   * }
   */

  getParser(): MarkupParser | null {
    if (!this.renderingConfig.useAdvancedParser) {
      return null;
    }

    const markupParser = this.engine.getManager<MarkupParser>('MarkupParser');

    if (markupParser && typeof markupParser.isInitialized === 'function' && markupParser.isInitialized()) {
      return markupParser;
    }

    return null;
  }

  /**
   * Load modular rendering configuration from app-default/custom-config.json
   *
   * Reads configuration to determine which parser to use and whether to
   * enable fallback, performance comparison, and debug logging.
   *
   * @private
   * @returns {void}
   */
  loadRenderingConfiguration(): void {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');

    // Default configuration
    this.renderingConfig = {
      useAdvancedParser: true,
      fallbackToLegacy: true,
      integration: true,
      performanceComparison: false,
      logParsingMethod: true // Enable debug logging to see which parser is used
    };

    // Load from configuration if available
    if (configManager) {
      try {
        this.renderingConfig.useAdvancedParser = configManager.getProperty('ngdpbase.markup.use-advanced-parser', this.renderingConfig.useAdvancedParser) as boolean;

        this.renderingConfig.fallbackToLegacy = configManager.getProperty('ngdpbase.markup.fallback-to-legacy', this.renderingConfig.fallbackToLegacy) as boolean;

        this.renderingConfig.integration = configManager.getProperty('ngdpbase.markup.integration.rendering-manager', this.renderingConfig.integration) as boolean;

        this.renderingConfig.performanceComparison = configManager.getProperty('ngdpbase.markup.performance-comparison', this.renderingConfig.performanceComparison) as boolean;

        this.renderingConfig.logParsingMethod = configManager.getProperty('ngdpbase.markup.log-parsing-method', this.renderingConfig.logParsingMethod) as boolean;
      } catch (error) {
        logger.warn('Failed to load RenderingManager configuration, using defaults:', getErrorMessage(error));
      }
    }
  }

  /**
   * Render markdown content to HTML with MarkupParser integration
   * @param {string} content - Markdown content
   * @param {string} pageName - Current page name
   * @param {object} userContext - User context for authentication variables
   * @param {object} requestInfo - Request information
   * @returns {Promise<string>} Rendered HTML
   */
  async renderMarkdown(content: string, pageName: string, userContext: UserContext | null = null, requestInfo: RequestInfo | null = null): Promise<string> {
    if (!content) return '';

    // Check if MarkupParser integration is enabled and MarkupParser is available

    const markupParser = this.engine.getManager<MarkupParser>('MarkupParser');

    const markupParserAvailable = markupParser && typeof markupParser.isInitialized === 'function' && markupParser.isInitialized();
    const useAdvancedParser = this.renderingConfig.useAdvancedParser && markupParserAvailable;

    // Debug logging to identify the issue
    if (this.renderingConfig.logParsingMethod) {
      logger.debug(`RenderingManager.renderMarkdown debug for ${pageName}:`);

      logger.debug(`   useAdvancedParser config: ${this.renderingConfig.useAdvancedParser}`);

      logger.debug(`   MarkupParser available: ${!!markupParser}`);

      logger.debug(`   MarkupParser initialized: ${markupParserAvailable}`);

      logger.debug(`   Final decision: ${useAdvancedParser ? 'AdvancedParser' : 'LegacyParser'}`);
    }

    if (useAdvancedParser) {
      return await this.renderWithAdvancedParser(content, pageName, userContext, requestInfo);
    } else {
      return await this.renderWithLegacyParser(content, pageName, userContext, requestInfo);
    }
  }

  /**
   * Render content using the advanced MarkupParser system
   * @param {string} content - Content to render
   * @param {string} pageName - Page name
   * @param {object} userContext - User context
   * @param {object} requestInfo - Request information
   * @returns {Promise<string>} Rendered HTML
   */
  async renderWithAdvancedParser(content: string, pageName: string, userContext: UserContext | null, requestInfo: RequestInfo | null): Promise<string> {
    if (this.renderingConfig.logParsingMethod) {
      logger.debug(`Rendering ${pageName} with AdvancedParser (MarkupParser)`);
    }

    const startTime = Date.now();

    try {
      const markupParser = this.engine.getManager<MarkupParser>('MarkupParser');
      if (!markupParser) {
        throw new Error('MarkupParser not available');
      }

      // Create comprehensive context for MarkupParser
      const parseContext = {
        pageName: pageName,
        userName: userContext?.username || userContext?.userName || 'anonymous',
        userContext: userContext,
        requestInfo: requestInfo,
        renderingManager: this // Provide access to legacy methods if needed
      };

      // Use MarkupParser for complete processing
      const result = await markupParser.parse(content, parseContext);

      // Performance comparison if enabled
      if (this.renderingConfig.performanceComparison) {
        await this.performPerformanceComparison(content, pageName, userContext, requestInfo, Date.now() - startTime);
      }

      return result;
    } catch (error) {
      logger.error('AdvancedParser rendering failed:', getErrorMessage(error));

      // Fallback to legacy parser if configured
      if (this.renderingConfig.fallbackToLegacy) {
        logger.info('Falling back to legacy rendering for', pageName);
        return await this.renderWithLegacyParser(content, pageName, userContext, requestInfo);
      }

      throw error;
    }
  }

  /**
   * Render content using the legacy rendering system (backward compatibility)
   * @param {string} content - Content to render
   * @param {string} pageName - Page name
   * @param {object} userContext - User context
   * @param {object} requestInfo - Request information
   * @returns {Promise<string>} Rendered HTML
   */
  async renderWithLegacyParser(content: string, pageName: string, userContext: UserContext | null, requestInfo: RequestInfo | null): Promise<string> {
    if (this.renderingConfig.logParsingMethod) {
      logger.debug(`Rendering ${pageName} with LegacyParser (Original RenderingManager)`);
    }

    // Original rendering pipeline (preserved for backward compatibility)

    // Step 1: Expand macros
    let expandedContent = await this.expandMacros(content, pageName, userContext, requestInfo);

    // Step 2: Process JSPWiki-style tables
    expandedContent = this.processJSPWikiTables(expandedContent);

    // Step 3: Process wiki-style links
    expandedContent = await this.processWikiLinks(expandedContent);

    // Step 4: Convert to HTML
    if (!this.converter) {
      throw new Error('Markdown converter not initialized');
    }
    // #599: same ReDoS guard as the MarkupParser path — this legacy route
    // reaches the identical unpatched showdown converter.
    const html = this.converter.makeHtml(guardShowdownInput(expandedContent));

    // Step 5: Post-process tables with styling
    const finalHtml = this.postProcessTables(html);

    return finalHtml;
  }

  /**
   * Perform performance comparison between advanced and legacy parsers (modular benchmarking)
   * @param {string} content - Content that was parsed
   * @param {string} pageName - Page name
   * @param {object} userContext - User context
   * @param {object} requestInfo - Request information
   * @param {number} advancedTime - Time taken by advanced parser
   */
  async performPerformanceComparison(content: string, pageName: string, userContext: UserContext | null, requestInfo: RequestInfo | null, advancedTime: number): Promise<void> {
    try {
      const legacyStartTime = Date.now();
      await this.renderWithLegacyParser(content, pageName, userContext, requestInfo);
      const legacyTime = Date.now() - legacyStartTime;

      const comparison = {
        pageName,
        contentLength: content.length,
        advancedTime,
        legacyTime,
        improvement: legacyTime - advancedTime,
        percentImprovement: legacyTime > 0 ? (((legacyTime - advancedTime) / legacyTime) * 100).toFixed(1) : 0,
        timestamp: new Date().toISOString()
      };

      logger.info(`Performance comparison for ${pageName}:`, comparison);

      // Send to performance monitoring if available
      const notificationManager = this.engine.getManager<NotificationManager>('NotificationManager');
      if (notificationManager && Math.abs(comparison.improvement) > 50) {
        // Significant difference - log performance info
        logger.info(`Performance alert for ${pageName}: ${comparison.improvement}ms difference (${comparison.percentImprovement}% improvement)`);
      }
    } catch (error) {
      logger.warn('Performance comparison failed:', getErrorMessage(error));
    }
  }

  /**
   * Process JSPWiki-style table syntax with styling parameters
   * @param {string} content - Content with JSPWiki table syntax
   * @returns {string} Content with processed tables
   */
  processJSPWikiTables(content: string): string {
    // First, process %%table-striped syntax
    content = this.processTableStripedSyntax(content);

    // Then process [{Table}] plugin syntax
    const tablePluginRegex = /\[\{Table\s+([^}]+)\}\]\s*\n((?:(?:\|\|?[^|\n]*)+\|?\s*\n?)+)/gi;

    return content.replace(tablePluginRegex, (_match: string, params: string, tableContent: string) => {
      // Parse parameters
      const tableParams = this.parseTableParameters(params);

      // Generate unique ID for this table
      const tableId = `table_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      // Add table metadata as HTML comment for post-processing
      const tableMetadata = `<!-- TABLE_METADATA:${JSON.stringify({ ...tableParams, id: tableId })} -->`;

      // Convert JSPWiki table syntax to markdown
      const markdownTable = this.convertJSPWikiTableToMarkdown(tableContent, tableParams);

      return tableMetadata + '\n' + markdownTable;
    });
  }

  /**
   * Process %%table-striped syntax for theme-based alternating rows
   * @param {string} content - Content with %%table-striped syntax
   * @returns {string} Content with processed tables
   */
  processTableStripedSyntax(content: string): string {
    // Match %%table-striped ... /% syntax
    const stripedTableRegex = /%%table-striped\s*\n((?:(?:\|\|?[^|\n]*)+\|?\s*\n?)+)\s*\/%/gi;

    return content.replace(stripedTableRegex, (_match: string, tableContent: string) => {
      // Generate unique ID for this table
      const tableId = `table_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      // Create parameters for striped table
      const tableParams = {
        id: tableId,
        style: '',
        dataStyle: '',
        headerStyle: '',
        evenRowStyle: 'background-color: var(--bs-table-striped-bg, rgba(0,0,0,.05));',
        oddRowStyle: '',
        rowNumber: 0,
        isStriped: true
      };

      // Add table metadata as HTML comment for post-processing
      const tableMetadata = `<!-- TABLE_METADATA:${JSON.stringify(tableParams)} -->`;

      // Convert to markdown table
      const markdownTable = this.convertJSPWikiTableToMarkdown(tableContent, tableParams);

      return tableMetadata + '\n' + markdownTable;
    });
  }

  /**
   * Parse table parameters from JSPWiki Table plugin syntax
   * @param {string} paramString - Parameter string
   * @returns {Object} Parsed parameters
   */
  parseTableParameters(paramString: string): TableParams {
    const params: TableParams = {
      rowNumber: 0,
      style: '',
      dataStyle: '',
      headerStyle: '',
      evenRowStyle: '',
      oddRowStyle: ''
    };

    // Parse param:value pairs
    const paramRegex = /(\w+)\s*:\s*['"](.*?)['"]|(\w+)\s*:\s*([^,\s]+)/g;
    let match;

    while ((match = paramRegex.exec(paramString)) !== null) {
      const key = match[1] || match[3];
      const value = match[2] || match[4];

      if (key && Object.prototype.hasOwnProperty.call(params, key)) {
        (params as unknown as Record<string, unknown>)[key] = value;
      }
    }

    return params;
  }

  /**
   * Convert JSPWiki table syntax to markdown table syntax
   * @param {string} tableContent - JSPWiki table content
   * @param {Object} params - Table parameters
   * @returns {string} Markdown table
   */
  convertJSPWikiTableToMarkdown(tableContent: string, params: TableParams): string {
    const lines = tableContent.trim().split('\n');
    const markdownLines = [];
    let currentRowNumber = parseInt(String(params.rowNumber), 10) || 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Convert JSPWiki table row to markdown
      let markdownLine = trimmedLine;

      // Handle row numbering syntax |# -> convert to current row number
      if (markdownLine.includes('|#')) {
        // For data rows, increment and use the row number
        if (!trimmedLine.startsWith('||')) {
          currentRowNumber++;
          markdownLine = markdownLine.replace(/\|#/g, `|${currentRowNumber}`);
        } else {
          // For header rows, replace with "Nr" or similar
          markdownLine = markdownLine.replace(/\|\|#/g, '||Nr');
        }
      }

      // Handle double pipes (headers) - convert to single pipes for markdown
      if (trimmedLine.startsWith('||')) {
        markdownLine = markdownLine.replace(/\|\|/g, '|');
        // Ensure proper markdown header format
        if (!markdownLine.endsWith('|')) {
          markdownLine += '|';
        }
        markdownLines.push(markdownLine);

        // Add markdown table separator after header
        const headerCount = (markdownLine.match(/\|/g) || []).length - 1;
        const separator = '|' + '---|'.repeat(headerCount);
        markdownLines.push(separator);
      } else if (trimmedLine.startsWith('|')) {
        // Regular data row
        if (!markdownLine.endsWith('|')) {
          markdownLine += '|';
        }
        markdownLines.push(markdownLine);
      }
    }

    return markdownLines.join('\n');
  }

  /**
   * Post-process rendered HTML tables to apply JSPWiki styling
   * @param {string} html - Rendered HTML
   * @returns {string} HTML with styled tables
   */
  postProcessTables(html: string): string {
    // Find table metadata comments and apply styling
    const metadataRegex = /<!--\s*TABLE_METADATA:(.*?)\s*-->\s*<table>/g;

    return html.replace(metadataRegex, (_match: string, metadataJson: string) => {
      try {
        const metadata = JSON.parse(metadataJson) as TableParams & { id: string; isStriped?: boolean };
        return this.generateStyledTable(metadata);
      } catch (e) {
        logger.error('Error parsing table metadata:', e);
        return '<table>';
      }
    });
  }

  /**
   * Generate styled table HTML with CSS
   * @param {Object} metadata - Table styling metadata
   * @returns {string} Styled table opening tag with CSS
   */
  generateStyledTable(metadata: TableParams & { id: string; isStriped?: boolean }): string {
    const { id, style, dataStyle, headerStyle, evenRowStyle, oddRowStyle, rowNumber: _rowNumber, isStriped } = metadata;

    let css = '';
    const tableStyle = style || '';
    let tableClasses = 'table';

    // Add Bootstrap striped class if this is a striped table
    if (isStriped) {
      tableClasses += ' table-striped';
    }

    // Generate CSS for the table
    if (dataStyle || headerStyle || evenRowStyle || oddRowStyle) {
      css += '<style>';

      if (headerStyle) {
        css += `#${id} th { ${headerStyle} }`;
      }

      if (dataStyle) {
        css += `#${id} td { ${dataStyle} }`;
      }

      if (evenRowStyle) {
        // For striped tables, we need to target the right rows
        // Bootstrap striped tables style odd rows (1st, 3rd, 5th...)
        if (isStriped) {
          css += `#${id} tbody tr:nth-child(odd) { ${evenRowStyle} }`;
        } else {
          css += `#${id} tr:nth-child(even) { ${evenRowStyle} }`;
        }
      }

      if (oddRowStyle) {
        if (isStriped) {
          css += `#${id} tbody tr:nth-child(even) { ${oddRowStyle} }`;
        } else {
          css += `#${id} tr:nth-child(odd) { ${oddRowStyle} }`;
        }
      }

      css += '</style>';
    }

    return `${css}<table id="${id}" class="${tableClasses}"${tableStyle ? ` style="${tableStyle}"` : ''}>`;
  }

  /**
   * Expand macros in content
   * @param {string} content - Content with macros
   * @param {string} pageName - Current page name
   * @param {object} userContext - User context for authentication variables
   * @returns {string} Content with expanded macros
   */
  async expandMacros(content: string, pageName: string, userContext: UserContext | null = null, requestInfo: RequestInfo | null = null): Promise<string> {
    logger.debug('expandMacros called with content:', content, 'pageName:', pageName);
    let expandedContent = content;

    // Step 1: Protect code blocks and escaped syntax
    const protectedAreas: Record<string, string> = {};
    let protectionIndex = 0;

    // Protect code blocks (```code```)
    expandedContent = expandedContent.replace(/```[\s\S]*?```/g, (match) => {
      const placeholder = `PROTECTED${protectionIndex++}PROTECTED`;
      protectedAreas[placeholder] = match;
      return placeholder;
    });

    // Protect JSPWiki-style code blocks (''')
    expandedContent = expandedContent.replace(/'''[\s\S]*?'''/g, (match) => {
      const placeholder = `PROTECTED${protectionIndex++}PROTECTED`;
      // Convert JSPWiki style to markdown style for proper rendering
      const codeContent = match.replace(/^'''\s*\n?/, '```\n').replace(/\n?\s*'''$/, '\n```');
      protectedAreas[placeholder] = codeContent;
      return placeholder;
    });

    // Protect inline code (`code`)
    expandedContent = expandedContent.replace(/`[^`]*`/g, (match) => {
      const placeholder = `PROTECTED${protectionIndex++}PROTECTED`;
      protectedAreas[placeholder] = match;
      return placeholder;
    });

    // Protect escaped plugins/variables ([[{...}])
    expandedContent = expandedContent.replace(/\[\[\{([^}]+)\}\]/g, (_match, innerContent) => {
      const placeholder = `PROTECTED${protectionIndex++}PROTECTED`;
      protectedAreas[placeholder] = `[{${innerContent}}]`; // Remove one set of brackets
      return placeholder;
    });

    // Step 2: Expand JSPWiki-style plugins and system variables using PluginManager
    const pluginManager = this.engine.getManager<PluginManager>('PluginManager');
    if (pluginManager) {
      // Handle system variables (${variable}) and plugins ({PluginName params})
      const macroRegex = /\[\{([^}]+)\}\]/g;
      const matches = [];
      let match;

      // Collect all matches first
      while ((match = macroRegex.exec(expandedContent)) !== null) {
        matches.push({
          fullMatch: match[0],
          content: match[1],
          index: match.index
        });
      }

      // Process matches in reverse order to maintain string positions
      for (let i = matches.length - 1; i >= 0; i--) {
        const matchInfo = matches[i];
        try {
          logger.debug('RenderingManager found macro:', matchInfo.fullMatch, 'content:', matchInfo.content);

          let replacement;
          // Check if it's a system variable (starts with $)
          if (matchInfo.content.startsWith('$')) {
            logger.debug('RenderingManager detected system variable, calling expandSystemVariable with pageName:', pageName);
            replacement = this.expandSystemVariable(matchInfo.content, pageName, userContext);
          } else {
            // Parse plugin call: PluginName param1=value1 param2=value2
            const parts = matchInfo.content.trim().split(/\s+/);
            const pluginName = parts[0];
            const params: Record<string, string> = {};

            // Parse parameters - improved to handle quoted values and spaced syntax
            for (let j = 1; j < parts.length; j++) {
              const param = parts[j];

              // Handle case where key and value are separate, like "align = 'left'"
              if (!param.includes('=') && j + 1 < parts.length && parts[j + 1].startsWith('=')) {
                const key = param;
                let value = parts[j + 1].substring(1); // Remove the =
                j++; // Skip the =value part

                // Handle quoted values
                if ((value.startsWith("'") && !value.endsWith("'")) || (value.startsWith('"') && !value.endsWith('"'))) {
                  const quoteChar = value.charAt(0);
                  while (j + 1 < parts.length && !value.endsWith(quoteChar)) {
                    j++;
                    value += ' ' + parts[j];
                  }
                  if (value.startsWith(quoteChar) && value.endsWith(quoteChar)) {
                    value = value.slice(1, -1);
                  }
                } else if (value.startsWith("'") && value.endsWith("'")) {
                  value = value.slice(1, -1);
                } else if (value.startsWith('"') && value.endsWith('"')) {
                  value = value.slice(1, -1);
                }

                params[key] = value;
              } else if (param.includes('=')) {
                // Handle normal key=value syntax
                const equalIndex = param.indexOf('=');
                const key = param.substring(0, equalIndex);
                let value = param.substring(equalIndex + 1);

                // Handle quoted values that might span multiple parts
                if ((value.startsWith("'") && !value.endsWith("'")) || (value.startsWith('"') && !value.endsWith('"'))) {
                  const quoteChar = value.charAt(0);
                  while (j + 1 < parts.length && !value.endsWith(quoteChar)) {
                    j++;
                    value += ' ' + parts[j];
                  }
                  if (value.startsWith(quoteChar) && value.endsWith(quoteChar)) {
                    value = value.slice(1, -1);
                  }
                } else if (value.startsWith("'") && value.endsWith("'")) {
                  value = value.slice(1, -1);
                } else if (value.startsWith('"') && value.endsWith('"')) {
                  value = value.slice(1, -1);
                }

                params[key] = value;
              }
            }

            // Execute plugin
            replacement = await pluginManager.execute(pluginName, pageName, params, {
              linkGraph: this.linkGraph,
              engine: this.engine,
              pageName: pageName,
              query: requestInfo?.query ?? {}
            });
          }

          // Replace the match in the content
          expandedContent = expandedContent.substring(0, matchInfo.index) + replacement + expandedContent.substring(matchInfo.index + matchInfo.fullMatch.length);
        } catch (err) {
          logger.error(`Macro expansion failed for ${matchInfo.content}:`, err);
          const errorReplacement = `[Error: ${matchInfo.content}]`;
          expandedContent = expandedContent.substring(0, matchInfo.index) + errorReplacement + expandedContent.substring(matchInfo.index + matchInfo.fullMatch.length);
        }
      }
    } else {
      // Fallback: just handle variables directly with unified system
      expandedContent = this.expandSystemVariables(expandedContent);
    }

    // Step 3: Restore protected areas
    for (const [placeholder, originalContent] of Object.entries(protectedAreas)) {
      expandedContent = expandedContent.replace(placeholder, originalContent);
    }

    return expandedContent;
  }

  /**
   * Expand a single JSPWiki-style system variable
   * @param {string} variable - The variable name (including $)
   * @param {string} pageName - Current page name
   * @param {object} userContext - User context for authentication variables
   * @returns {string} Expanded value
   */
  expandSystemVariable(variable: string, pageName: string, userContext: UserContext | null = null): string {
    try {
      switch (variable) {
      case '$pagename':
        return pageName;
      case '$totalpages':
        return this.getTotalPagesCount().toString();
      case '$uptime':
        return this.formatUptime(this.getUptime());
      case '$applicationname':
        return 'ngdpbase';
      case '$version':
        return this.getApplicationVersion();
      case '$baseurl':
        return this.getBaseUrl();
      case '$timestamp':
        return new Date().toISOString();
      case '$date':
        return new Date().toLocaleDateString();
      case '$time':
        return new Date().toLocaleTimeString();
      case '$year':
        return new Date().getFullYear().toString();
      case '$username':
        return this.getUserName(userContext);
      case '$loginstatus':
        return this.getLoginStatus(userContext);
      default:
        logger.warn(`Unknown system variable: ${variable}`);
        return `[{${variable}}]`; // Return unchanged if unknown
      }
    } catch (err) {
      logger.error(`Error expanding system variable ${variable}:`, err);
      return `[Error: ${variable}]`;
    }
  }

  /**
   * Get total pages count
   * Uses the provider's page cache for an accurate count.
   * After installation, only counts pages from the main pages directory.
   * @returns {number} Number of pages
   */
  getTotalPagesCount(): number {
    // Use cached page names if available (populated by buildLinkGraph)
    if (this.cachedPageNames && this.cachedPageNames.length > 0) {
      return this.cachedPageNames.length;
    }
    return 0;
  }

  /**
   * Get server uptime in seconds
   * @returns {number} Uptime in seconds
   */
  getUptime(): number {
    const startTime = this.engine.startTime || Date.now();
    return Math.floor((Date.now() - startTime) / 1000);
  }

  /**
   * Get application version from package.json
   * @returns {string} Application version
   */
  getApplicationVersion(): string {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: string };

        return packageJson.version || '1.0.0';
      }

      return '1.0.0';
    } catch (err) {
      logger.warn('Could not read version from package.json:', err);
      return '1.0.0';
    }
  }

  /**
   * Expand JSPWiki-style system variables (legacy method for compatibility)
   * @param {string} content - Content with system variables
   * @returns {string} Content with expanded system variables
   */
  expandSystemVariables(content: string): string {
    try {
      const pageManager = this.engine.getManager<PageManager>('PageManager');

      // Get system information
      const startTime = this.engine.startTime || Date.now();
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      const uptimeFormatted = this.formatUptime(uptime);

      // Get total pages count
      let totalPages = 0;
      if (pageManager) {
        try {
          const pages = pageManager.getAllPages ? pageManager.getAllPages() : [];
          totalPages = Array.isArray(pages) ? pages.length : 0;
        } catch (err) {
          logger.warn('Could not get total pages count:', err);
        }
      }

      // Replace system variables
      let expandedContent = content;
      expandedContent = expandedContent.replace(/\[\{\$totalpages\}\]/g, totalPages.toString());
      expandedContent = expandedContent.replace(/\[\{\$uptime\}\]/g, uptimeFormatted);
      expandedContent = expandedContent.replace(/\[\{\$applicationname\}\]/g, 'ngdpbase');
      expandedContent = expandedContent.replace(/\[\{\$baseurl\}\]/g, this.getBaseUrl());
      expandedContent = expandedContent.replace(/\[\{\$timestamp\}\]/g, new Date().toISOString());
      expandedContent = expandedContent.replace(/\[\{\$date\}\]/g, new Date().toLocaleDateString());
      expandedContent = expandedContent.replace(/\[\{\$time\}\]/g, new Date().toLocaleTimeString());

      // Sessions plugin (simplified)
      expandedContent = expandedContent.replace(/\[\{SessionsPlugin\}\]/g, '1');

      return expandedContent;
    } catch (err) {
      logger.error('System variable expansion failed:', err);
      return content;
    }
  }

  /**
   * Format uptime in human-readable format
   * @param {number} seconds - Uptime in seconds
   * @returns {string} Formatted uptime
   */
  formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Get the base URL for the application
   * @returns {string} Base URL
   */
  getBaseUrl(): string {
    // Use configured baseURL from ConfigurationManager

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');

    return configManager ? configManager.getBaseURL() : 'http://localhost:3000';
  }

  /**
   * Process wiki-style links [PageName]
   * @param {string} content - Content with wiki links
   * @returns {Promise<string>} Content with processed links
   */
  async processWikiLinks(content: string): Promise<string> {
    try {
      const pageManager = this.engine.getManager<PageManager>('PageManager');
      if (!pageManager) {
        return content;
      }

      // Get all existing page names (use cached if available, otherwise get fresh)
      let pageNames = this.cachedPageNames || [];

      // If no cached page names, try to get them fresh
      if (pageNames.length === 0 && pageManager) {
        try {
          const pages = await pageManager.getAllPages();
          // getAllPages returns string[] of page names
          pageNames = pages;
          this.cachedPageNames = pageNames; // Update cache
        } catch (err) {
          logger.warn('Could not get page names for link processing:', err);
          pageNames = [];
        }
      }

      // Process wiki links with extended pipe syntax [DisplayText|Target|Parameters] and simple links [PageName]
      // Use negative lookahead to avoid matching markdown links [text](url)
      return content.replace(/\[([a-zA-Z0-9_\- ]+)(?:\|([a-zA-Z0-9_\- .:?=&]+))?(?:\|([^|\]]+))?\](?!\()/g, (_match: string, displayText: string, target: string | undefined, params: string | undefined) => {
        // Parse parameters if provided
        let linkAttributes = '';
        if (params) {
          // Parse target='_blank' and other attributes
          const targetMatch = params.match(/target=['"]([^'"]+)['"]/);
          if (targetMatch) {
            linkAttributes += ` target="${targetMatch[1]}"`;
            // Add rel="noopener noreferrer" for security when opening in new tab
            if (targetMatch[1] === '_blank') {
              linkAttributes += ' rel="noopener noreferrer"';
            }
          }

          // Parse other potential attributes (class, title, etc.)
          const classMatch = params.match(/class=['"]([^'"]+)['"]/);
          if (classMatch) {
            linkAttributes += ` class="${classMatch[1]}"`;
          }

          const titleMatch = params.match(/title=['"]([^'"]+)['"]/);
          if (titleMatch) {
            linkAttributes += ` title="${titleMatch[1]}"`;
          }
        }

        // If no target specified, it's a simple wiki link
        if (!target) {
          const pageName = displayText;
          // Try fuzzy matching with plurals if enabled
          const matchedPage = this.pageNameMatcher ? this.pageNameMatcher.findMatch(pageName, pageNames) : pageNames.includes(pageName) ? pageName : null;

          if (matchedPage) {
            return `<a href="/view/${encodeURIComponent(matchedPage)}" class="wikipage"${linkAttributes}>${pageName}</a>`;
          }
          // Red link for non-existent pages
          return `<a href="/edit/${encodeURIComponent(pageName)}" style="color: red;" class="redlink"${linkAttributes}>${pageName}</a>`;
        }

        // Handle pipe syntax [DisplayText|Target|Parameters]
        // Check if target is a URL (contains :// or starts with /)
        if (target.includes('://') || target.startsWith('/')) {
          // External URL or absolute path
          const baseClass = linkAttributes.includes('class=') ? '' : ' class="external-link"';
          return `<a href="${target}"${baseClass}${linkAttributes}>${displayText}</a>`;
        } else if (target.toLowerCase() === 'search') {
          // Special case for Search functionality
          return `<a href="/search" class="nav-link"${linkAttributes}>${displayText}</a>`;
        } else {
          // Wiki page target
          // Try fuzzy matching with plurals if enabled
          const matchedPage = this.pageNameMatcher ? this.pageNameMatcher.findMatch(target, pageNames) : pageNames.includes(target) ? target : null;

          if (matchedPage) {
            return `<a href="/view/${encodeURIComponent(matchedPage)}" class="wikipage"${linkAttributes}>${displayText}</a>`;
          }
          // Red link for non-existent page target
          return `<a href="/edit/${encodeURIComponent(target)}" style="color: red;" class="redlink"${linkAttributes}>${displayText}</a>`;
        }
      });
    } catch (err) {
      logger.error('Wiki link processing failed:', err);
      return content;
    }
  }

  /**
   * Build link graph for referring pages
   */
  async buildLinkGraph(): Promise<void> {
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    if (!pageManager) {
      logger.warn('PageManager not available for link graph building');
      return;
    }

    try {
      const pageNames = await pageManager.getAllPages(); // Returns array of strings
      const newLinkGraph: Record<string, string[]> = {};

      // Cache page names for wiki link processing
      this.cachedPageNames = pageNames;

      // Build PageNameMatcher index for O(1) lookups instead of O(n) per link
      if (this.pageNameMatcher) {
        this.pageNameMatcher.buildIndex(pageNames);
      }

      // Load all page content in parallel for better performance
      const pageDataArray = await Promise.all(
        pageNames.map(async (pageName) => {
          const pageData = await pageManager.getPage(pageName);
          return { pageName, pageData };
        })
      );

      // Process link graph synchronously after all content is loaded
      for (const { pageName, pageData } of pageDataArray) {
        if (!pageData) {
          continue; // Skip if page can't be loaded
        }
        const content = pageData.content || '';

        if (!newLinkGraph[pageName]) {
          newLinkGraph[pageName] = [];
        }

        // Find markdown links
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(content)) !== null) {
          const linkedPage = match[2];
          // Skip external URLs and absolute paths — only internal wiki page links matter
          if (!linkedPage || linkedPage.includes('://') || linkedPage.startsWith('/')) continue;
          if (!newLinkGraph[linkedPage]) {
            newLinkGraph[linkedPage] = [];
          }
          if (!newLinkGraph[linkedPage].includes(pageName)) {
            newLinkGraph[linkedPage].push(pageName);
          }
        }

        // Find wiki-style links including extended pipe syntax
        // Include parentheses () in character class for page names like "Shang Dynasty (1600 BCE-1046 BCE)"
        // Negative lookahead (?!\() skips [text](url) markdown links — their bracket text is not a wiki link
        const simpleLinkRegex = /\[([a-zA-Z0-9\s_.()-]+)(?:\|([a-zA-Z0-9\s_().  :?=&-]+))?(?:\|([^|\]]+))?\](?!\()/g;
        while ((match = simpleLinkRegex.exec(content)) !== null) {
          // For pipe syntax [DisplayText|Target|Parameters], use the target; otherwise use the display text
          let linkedPage = match[2] || match[1];

          // Only add to link graph if it's a wiki page (not external URLs or special pages)
          // Skip blank/whitespace targets — e.g. task-list checkboxes [ ] match the wiki-link regex
          if (linkedPage.trim() !== '' && !linkedPage.includes('://') && !linkedPage.startsWith('/') && linkedPage.toLowerCase() !== 'search') {
            // Use pageNameMatcher to resolve plurals/variants to actual page names
            // This ensures [Plugins] links to "Plugin" page and appears in its referring pages
            if (this.pageNameMatcher) {
              const matchedPage = this.pageNameMatcher.findMatch(linkedPage, pageNames);
              if (matchedPage) {
                linkedPage = matchedPage;
              }
            }

            if (!newLinkGraph[linkedPage]) {
              newLinkGraph[linkedPage] = [];
            }
            if (!newLinkGraph[linkedPage].includes(pageName)) {
              newLinkGraph[linkedPage].push(pageName);
            }
          }
        }
      }

      this.linkGraph = newLinkGraph;
      logger.info(`Link graph built with ${Object.keys(this.linkGraph).length} entries`);

      // Notify LinkParserHandler to refresh its page names if it exists
      const markupParser = this.engine.getManager<MarkupParser>('MarkupParser');
      if (markupParser && markupParser.getHandler) {
        const linkParserHandler = markupParser.getHandler('LinkParserHandler') as { refreshPageNames?: () => Promise<void> } | null;
        if (linkParserHandler && linkParserHandler.refreshPageNames) {
          await linkParserHandler.refreshPageNames();
          logger.debug('Notified LinkParserHandler to refresh page names');
        }
      }

      // Notify DOMLinkHandler to refresh its page names if it exists
      if (markupParser && markupParser.domLinkHandler) {
        if (markupParser.domLinkHandler.refreshPageNames) {
          await markupParser.domLinkHandler.refreshPageNames();
          logger.debug('Notified DOMLinkHandler to refresh page names');
        }
      }
    } catch (err) {
      logger.error('Failed to build link graph:', err);
    }
  }

  /**
   * Initialize LinkParser with page names and configuration
   */
  initializeLinkParser(): void {
    try {
      // Set page names for link validation (existing pages)
      if (this.cachedPageNames && Array.isArray(this.cachedPageNames)) {
        this.linkParser.setPageNames(this.cachedPageNames);
      }

      // TODO: Add InterWiki sites configuration from config
      // For now, add some common InterWiki sites
      const interWikiSites = {
        Wikipedia: {
          url: 'https://en.wikipedia.org/wiki/%s',
          description: 'Wikipedia English',
          openInNewWindow: true
        },
        JSPWiki: {
          url: 'https://jspwiki-wiki.apache.org/Wiki.jsp?page=%s',
          description: 'JSPWiki Documentation',
          openInNewWindow: true
        }
      };
      this.linkParser.setInterWikiSites(interWikiSites);

      logger.info(`LinkParser initialized with ${this.cachedPageNames ? this.cachedPageNames.length : 0} pages and ${Object.keys(interWikiSites).length} InterWiki sites`);
    } catch (error) {
      logger.error('Failed to initialize LinkParser:', error);
    }
  }

  /**
   * Get link graph
   * @returns {Object} Link graph object
   */
  getLinkGraph(): LinkGraph {
    return this.linkGraph;
  }

  /**
   * Rebuild link graph (called after page changes)
   */
  async rebuildLinkGraph(): Promise<void> {
    await this.buildLinkGraph();
    this.initializeLinkParser();
  }

  /**
   * Update link graph for a single page (incremental update)
   * Much faster than rebuildLinkGraph() for single page saves
   *
   * @param {string} pageName - Name of the page that was modified
   * @param {string} content - New content of the page
   */
  updatePageInLinkGraph(pageName: string, content: string): void {
    // Remove this page from all existing referring pages lists
    for (const targetPage of Object.keys(this.linkGraph)) {
      const referrers = this.linkGraph[targetPage];
      const index = referrers.indexOf(pageName);
      if (index !== -1) {
        referrers.splice(index, 1);
      }
    }

    // Ensure the page has an entry in the graph
    if (!this.linkGraph[pageName]) {
      this.linkGraph[pageName] = [];
    }

    // Re-add links from the updated content
    const pageNames = this.cachedPageNames || [];

    // Find markdown links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const linkedPage = match[2];
      // Skip external URLs and absolute paths — only internal wiki page links matter
      if (!linkedPage || linkedPage.includes('://') || linkedPage.startsWith('/')) continue;
      if (!this.linkGraph[linkedPage]) {
        this.linkGraph[linkedPage] = [];
      }
      if (!this.linkGraph[linkedPage].includes(pageName)) {
        this.linkGraph[linkedPage].push(pageName);
      }
    }

    // Find wiki-style links
    // Negative lookahead (?!\() skips [text](url) markdown links — their bracket text is not a wiki link
    const simpleLinkRegex = /\[([a-zA-Z0-9\s_.()-]+)(?:\|([a-zA-Z0-9\s_().:?=&-]+))?(?:\|([^|\]]+))?\](?!\()/g;
    while ((match = simpleLinkRegex.exec(content)) !== null) {
      let linkedPage = match[2] || match[1];

      // Skip blank/whitespace targets — e.g. task-list checkboxes [ ] match the wiki-link regex
      if (linkedPage.trim() !== '' && !linkedPage.includes('://') && !linkedPage.startsWith('/') && linkedPage.toLowerCase() !== 'search') {
        // Resolve plurals/variants
        if (this.pageNameMatcher && pageNames.length > 0) {
          const matchedPage = this.pageNameMatcher.findMatch(linkedPage, pageNames);
          if (matchedPage) {
            linkedPage = matchedPage;
          }
        }

        if (!this.linkGraph[linkedPage]) {
          this.linkGraph[linkedPage] = [];
        }
        if (!this.linkGraph[linkedPage].includes(pageName)) {
          this.linkGraph[linkedPage].push(pageName);
        }
      }
    }

    logger.debug(`[RenderingManager] Updated link graph for page: ${pageName}`);
  }

  /**
   * Add a page name to the cached list (for new pages)
   * @param {string} pageName - Name of the new page
   */
  addPageToCache(pageName: string): void {
    if (!this.cachedPageNames) {
      this.cachedPageNames = [];
    }
    if (!this.cachedPageNames.includes(pageName)) {
      this.cachedPageNames.push(pageName);
    }
    // Keep DOMLinkHandler in sync so RED-LINKs resolve immediately on next render
    const markupParser = this.engine.getManager<MarkupParser>('MarkupParser');
    if (markupParser?.domLinkHandler) {
      markupParser.domLinkHandler.addPageName(pageName);
    }
    // Flush handler-results cache so cached RED-LINK resolutions for this page
    // are discarded — otherwise the 5-minute context-hash bucket keeps serving
    // stale results until it rotates (issue #291)
    if (markupParser) {
      markupParser.invalidateHandlerCache().catch(() => { /* non-fatal */ });
    }
  }

  /**
   * Remove a page from the link graph and cached names (for deleted pages)
   * @param {string} pageName - Name of the deleted page
   */
  /**
   * Record that a page changed title, so links to the old one keep resolving (#1082).
   *
   * Called from both rename paths — the form save and `apiRenamePage` — right
   * where the link graph is already being reconciled, since that is the moment
   * both titles are known.
   */
  recordPageRename(fromPageName: string, toPageName: string): void {
    this.renameMap.record(fromPageName, toPageName);
  }

  /**
   * Resolve a link target that matched no live page to a page it was renamed
   * from, or null (#1082).
   *
   * Callers must have already failed live resolution — this is a fallback, not
   * a lookup, and answering for a title that still exists would let a stale
   * rename shadow a real page. Returns null on ambiguity rather than guessing:
   * a confidently wrong link to a page that merely once shared a name is worse
   * than the red link it would replace.
   */
  resolveRenamedPage(formerTitle: string): string | null {
    return this.renameMap.resolve(formerTitle, (title) => this.linkGraph[title] !== undefined
      || this.cachedPageNames.includes(title));
  }

  /** Number of former titles currently resolvable (#1082). Diagnostics only. */
  getRenameMapSize(): number {
    return this.renameMap.size;
  }

  removePageFromLinkGraph(pageName: string): void {
    // Remove the page's entry
    delete this.linkGraph[pageName];

    // Remove from all referring pages lists
    for (const targetPage of Object.keys(this.linkGraph)) {
      const referrers = this.linkGraph[targetPage];
      const index = referrers.indexOf(pageName);
      if (index !== -1) {
        referrers.splice(index, 1);
      }
    }

    // Remove from cached names
    if (this.cachedPageNames) {
      const index = this.cachedPageNames.indexOf(pageName);
      if (index !== -1) {
        this.cachedPageNames.splice(index, 1);
      }
    }

    // Keep DOMLinkHandler in sync so old title shows as RED-LINK immediately on next render
    const markupParser = this.engine.getManager<MarkupParser>('MarkupParser');
    if (markupParser?.domLinkHandler) {
      markupParser.domLinkHandler.removePageName(pageName);
    }
    // Flush handler-results cache so cached valid-link resolutions for this page
    // are discarded immediately (issue #291)
    if (markupParser) {
      markupParser.invalidateHandlerCache().catch(() => { /* non-fatal */ });
    }

    logger.debug(`[RenderingManager] Removed page from link graph: ${pageName}`);
  }

  invalidateHandlerCache(): void {
    const markupParser = this.engine.getManager<MarkupParser>('MarkupParser');
    if (markupParser) {
      markupParser.invalidateHandlerCache().catch(() => { /* non-fatal */ });
    }
  }

  /**
   * Get pages that refer to a specific page
   * @param {string} pageName - Target page name
   * @returns {Array<string>} Array of referring page names
   * @todo
   * SHOULD BE using plugins/referringPagesPlugin.js
   */
  getReferringPages(pageName: string): string[] {
    return this.linkGraph[pageName] || [];
  }

  /**
   * Render page preview
   * @param {string} content - Markdown content
   * @param {string} pageName - Page name for context
   * @param {object} userContext - User context for authentication variables
   * @returns {Promise<string>} Rendered HTML preview
   */
  async renderPreview(content: string, pageName: string, userContext: UserContext | null = null): Promise<string> {
    return await this.renderMarkdown(content, pageName, userContext);
  }

  /**
   * Get current username from user context
   * @param {object} userContext - User context object
   * @returns {string} Username or "Anonymous"
   */
  getUserName(userContext: UserContext | null): string {
    if (!userContext || !userContext.username) {
      return 'Anonymous';
    }

    // Handle special authentication states
    switch (userContext.username) {
    case 'anonymous':
      return 'Anonymous';
    case 'asserted':
      return userContext.displayName || 'Asserted User';
    default:
      return userContext.displayName || userContext.username;
    }
  }

  /**
   * Get current login status from user context
   * @param {object} userContext - User context object
   * @returns {string} Login status description
   */
  getLoginStatus(userContext: UserContext | null): string {
    if (!userContext || !userContext.username) {
      return 'Anonymous';
    }

    // Handle authentication states as defined in Authentication States Implementation
    switch (userContext.username) {
    case 'anonymous':
      return 'Anonymous';
    case 'asserted':
      return 'Asserted';
    default:
      return 'Authenticated';
    }
  }

  /**
   * Render wiki links (JSPWiki-style links) using LinkParser
   * @param {string} content - Content with wiki links
   * @returns {string} Content with rendered links
   */
  renderWikiLinks(content: string): string {
    if (!content) return '';

    try {
      // Use the centralized LinkParser for comprehensive link processing
      return this.linkParser.parseLinks(content, {
        pageName: 'current', // Could be passed in if needed
        engine: this.engine
      });
    } catch (error) {
      logger.error('LinkParser failed, falling back to original content:', error);
      return content;
    }
  }

  /**
   * Render plugins (JSPWiki-style plugins)
   * @param {string} content - Content with plugin syntax
   * @param {string} pageName - Page name for plugin context
   * @returns {string} Content with rendered plugins
   */
  async renderPlugins(content: string, pageName: string): Promise<string> {
    if (!content) return '';

    // Process plugin syntax [{PluginName param1=value1}]
    const pluginManager = this.engine.getManager<PluginManager>('PluginManager');
    if (!pluginManager) return content;

    const macroRegex = /\[\{([^}]+)\}\]/g;
    const matches = [];
    let match;

    // Collect all matches first
    while ((match = macroRegex.exec(content)) !== null) {
      matches.push({
        fullMatch: match[0],
        content: match[1],
        index: match.index
      });
    }

    // Process matches in reverse order to maintain string positions
    let processedContent = content;
    for (let i = matches.length - 1; i >= 0; i--) {
      const matchInfo = matches[i];
      try {
        const parts = matchInfo.content.trim().split(/\s+/);
        const pluginName = parts[0];

        if (pluginManager.hasPlugin && pluginManager.hasPlugin(pluginName)) {
          // Parse parameters
          const params: Record<string, string> = {};
          for (let j = 1; j < parts.length; j++) {
            const paramParts = parts[j].split('=');
            if (paramParts.length === 2) {
              params[paramParts[0]] = paramParts[1];
            }
          }

          const result = await pluginManager.execute(pluginName, pageName, params, { engine: this.engine });

          // Replace the match in the content
          processedContent = processedContent.substring(0, matchInfo.index) + result + processedContent.substring(matchInfo.index + matchInfo.fullMatch.length);
        }
      } catch {
        const parts = matchInfo.content.trim().split(/\s+/);
        const errorReplacement = `<span class="error">Plugin ${parts[0]} error</span>`;
        processedContent = processedContent.substring(0, matchInfo.index) + errorReplacement + processedContent.substring(matchInfo.index + matchInfo.fullMatch.length);
      }
    }

    return processedContent;
  }

  /**
   * Converts wiki markup to HTML using the provided WikiContext.
   * This is the main entry point for the rendering pipeline.
   * @param {WikiContext} context The context for the rendering operation.
   * @param {string} content The raw wiki markup to render.
   * @returns {Promise<string>} The rendered HTML.
   */

  async textToHTML(context: WikiContext, content: string): Promise<string> {
    logger.info(`[RENDER] textToHTML page=${context?.pageName} ctx=${context?.getContext?.()} contentLen=${content?.length ?? 0}`);
    if (!context || typeof context.renderMarkdown !== 'function') {
      throw new Error('RenderingManager.textToHTML requires a valid WikiContext object.');
    }
    const html = await context.renderMarkdown(content);
    logger.info(`[RENDER] resultLen=${html?.length ?? 0}`);
    return html;
  }
}

export default RenderingManager;
