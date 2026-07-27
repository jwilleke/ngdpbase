import BaseSyntaxHandler, { InitializationContext } from './BaseSyntaxHandler.js';
import ParseContext from '../context/ParseContext.js';
import * as crypto from 'crypto';
import logger from '../../utils/logger.js';

/**
 * WikiTag match information
 */
interface WikiTagMatch {
  fullMatch: string;
  tagName: string;
  attributeString: string;
  tagContent: string | null;
  index: number;
  length: number;
  selfClosing: boolean;
}

/**
 * Tag attributes
 */
interface TagAttributes {
  test?: string;
  page?: string;
  section?: string;
  status?: string;
  role?: string;
  group?: string;
  user?: string;
  [key: string]: string | undefined;
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
  parse(content: string, context: Record<string, unknown>): Promise<string>;
}

/**
 * Page manager interface
 */
interface PageManager {
  getPage(pageName: string): Promise<{ content: string } | null>;
}

/**
 * Variable manager interface
 */
interface VariableManager {
  expandVariables(template: string, context: Record<string, unknown>): string;
}

/**
 * Extended parse context for WikiTag handling.
 *
 * Adds the metadata accessor pair that the handler relies on; everything else
 * (pageName, userContext, hasRole, hasPermission, canAccess) is now reached
 * via `context.wikiContext.X` per #629 Pass 2.
 */
interface WikiTagParseContext extends ParseContext {
  getMetadata(key: string): unknown;
  setMetadata(key: string, value: unknown): void;
  clone(overrides: Record<string, unknown>): WikiTagParseContext & { pageContext: Record<string, unknown> };
}

/**
 * WikiTagHandler - JSP-like tag processing for conditional content and page inclusion
 *
 * Supports JSPWiki WikiTags:
 * - <wiki:If test="condition">content</wiki:If> - Conditional display
 * - <wiki:Include page="PageName" /> - Page inclusion
 * - <wiki:UserCheck status="authenticated">content</wiki:UserCheck> - User validation
 *
 * Related Issue: #59 - WikiTag Handler (If, Include, UserCheck)
 * Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support
 */
class WikiTagHandler extends BaseSyntaxHandler {
  declare handlerId: string;
  private engine: WikiEngine | null;
  private config: HandlerConfig | null;
  private supportedTags: Set<string>;

  constructor(engine: WikiEngine | null = null) {
    super(
      /<wiki:(\w+)([^>]*?)(?:\/>|>(.*?)<\/wiki:\1>)/gs, // Pattern: <wiki:TagName attributes>content</wiki:TagName>
      95, // Very high priority - process before other handlers
      {
        description: 'JSPWiki-style WikiTag handler for conditional content and page inclusion',
        version: '1.0.0',
        dependencies: ['UserManager', 'PolicyManager', 'PageManager'],
        timeout: 8000
      }
    );
    this.handlerId = 'WikiTagHandler';
    this.engine = engine;
    this.config = null;

    // Supported WikiTags
    this.supportedTags = new Set(['If', 'Include', 'UserCheck']);
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
      this.config = markupParser.getHandlerConfig('wikitag');

      if (this.config?.priority && this.config.priority !== this.priority) {
        logger.info(`WikiTagHandler priority configured as ${this.config.priority} (using ${this.priority})`);
      }
    }
  }

  /**
   * Process content by finding and executing all WikiTag instances
   * @param content - Content to process
   * @param context - Parse context
   * @returns Content with WikiTags processed
   */
  async process(content: string, context: ParseContext): Promise<string> {
    if (!content) {
      return content;
    }

    const matches: WikiTagMatch[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.pattern.lastIndex = 0;

    while ((match = this.pattern.exec(content)) !== null) {
      matches.push({
        fullMatch: match[0],
        tagName: match[1] ?? '',
        attributeString: match[2] ?? '',
        tagContent: match[3] ?? null, // null for self-closing tags
        index: match.index,
        length: match[0].length,
        selfClosing: !match[3] // true if no content between tags
      });
    }

    // Process matches in reverse order to maintain string positions
    let processedContent = content;

    for (let i = matches.length - 1; i >= 0; i--) {
      const matchInfo = matches[i];

      try {
        const replacement = await this.handleTag(matchInfo, context);

        processedContent =
          processedContent.slice(0, matchInfo.index) +
          replacement +
          processedContent.slice(matchInfo.index + matchInfo.length);

      } catch (error) {
        const err = error as Error;
        logger.error(`WikiTag execution error for ${matchInfo.tagName}: ${err.message}`);

        // Leave original tag on error for debugging
        const errorPlaceholder = `<!-- WikiTag Error: ${matchInfo.tagName} - ${err.message} -->`;
        processedContent =
          processedContent.slice(0, matchInfo.index) +
          errorPlaceholder +
          processedContent.slice(matchInfo.index + matchInfo.length);
      }
    }

    return processedContent;
  }

  /**
   * Handle a specific WikiTag match
   * @param matchInfo - WikiTag match information
   * @param context - Parse context
   * @returns Tag output HTML
   */
  private async handleTag(matchInfo: WikiTagMatch, context: WikiTagParseContext): Promise<string> {
    const { tagName, attributeString, tagContent } = matchInfo;

    // Validate tag is supported
    if (!this.supportedTags.has(tagName)) {
      throw new Error(`Unsupported WikiTag: ${tagName}`);
    }

    // Parse tag attributes
    const attributes = this.parseTagAttributes(attributeString);

    // Check cache for tag result if caching enabled
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

    // Route to specific tag handler
    let result: string;
    switch (tagName) {
    case 'If':
      result = await this.handleIfTag(attributes, tagContent, context);
      break;
    case 'Include':
      result = await this.handleIncludeTag(attributes, context);
      break;
    case 'UserCheck':
      result = await this.handleUserCheckTag(attributes, tagContent, context);
      break;
    default:
      throw new Error(`No handler implemented for WikiTag: ${tagName}`);
    }

    // Cache the result if caching enabled
    if (this.options.enabled && result) {
      const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;
      if (markupParser) {
        await markupParser.cacheHandlerResult(this.handlerId, contentHash, contextHash, result);
      }
    }

    return result || '';
  }

  /**
   * Handle wiki:If tag - conditional content display
   * @param attributes - Tag attributes
   * @param content - Tag content
   * @param context - Parse context
   * @returns Conditional content or empty string
   */
  private async handleIfTag(attributes: TagAttributes, content: string | null, context: WikiTagParseContext): Promise<string> {
    if (!content) {
      return ''; // No content to conditionally display
    }

    const condition = attributes.test;
    if (!condition) {
      throw new Error('wiki:If tag requires "test" attribute');
    }

    // Evaluate the condition
    const conditionResult = await this.evaluateCondition(condition, context);

    if (conditionResult) {
      // Recursively process the content through MarkupParser
      const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;
      if (markupParser) {
        return await markupParser.parse(content, {
          pageName: context.wikiContext?.pageName ?? 'unknown',
          userName: context.userName,
          userContext: context.wikiContext?.userContext
        });
      }
      return content;
    }

    return ''; // Condition failed, return empty content
  }

  /**
   * Handle wiki:Include tag - page inclusion
   * @param attributes - Tag attributes
   * @param context - Parse context
   * @returns Included page content
   */
  private async handleIncludeTag(attributes: TagAttributes, context: WikiTagParseContext): Promise<string> {
    const pageName = attributes.page;
    if (!pageName) {
      throw new Error('wiki:Include tag requires "page" attribute');
    }

    // Security check - validate user can access the included page
    const hasPermission = await this.checkIncludePermission(pageName, context);
    if (!hasPermission) {
      throw new Error(`Access denied to include page: ${pageName}`);
    }

    // Prevent recursive inclusion
    if (this.isRecursiveInclusion(pageName, context)) {
      throw new Error(`Recursive inclusion detected for page: ${pageName}`);
    }

    // Get PageManager
    const pageManager = context.getManager('PageManager') as PageManager | undefined;
    if (!pageManager) {
      throw new Error('PageManager not available');
    }

    try {
      // Load the page content
      const pageData = await pageManager.getPage(pageName);
      if (!pageData) {
        return `<!-- Page not found: ${pageName} -->`;
      }

      let includeContent = pageData.content;

      // Handle section inclusion if specified
      if (attributes.section) {
        includeContent = this.extractSection(includeContent, attributes.section);
      }

      // Create inclusion context to track recursive includes
      const inclusionStack = (context.getMetadata('inclusionStack') as string[] | undefined) || [];
      const inclusionContext = context.clone({
        pageName: pageName,
        inclusionStack: [...inclusionStack, context.wikiContext?.pageName ?? '']
      });
      inclusionContext.setMetadata('inclusionStack', inclusionContext.pageContext.inclusionStack);

      // Recursively process the included content
      const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;
      if (markupParser) {
        return await markupParser.parse(includeContent, inclusionContext.pageContext);
      }

      return includeContent;

    } catch (error) {
      const err = error as Error;
      throw new Error(`Failed to include page ${pageName}: ${err.message}`);
    }
  }

  /**
   * Handle wiki:UserCheck tag - user authentication and authorization checks
   * @param attributes - Tag attributes
   * @param content - Tag content
   * @param context - Parse context
   * @returns Content if user check passes, empty otherwise
   */
  private async handleUserCheckTag(attributes: TagAttributes, content: string | null, context: WikiTagParseContext): Promise<string> {
    if (!content) {
      return ''; // No content to conditionally display
    }

    const status = attributes.status;
    const role = attributes.role;
    const group = attributes.group;
    const user = attributes.user;

    // Evaluate user check conditions
    let checkPassed = false;

    if (status) {
      if (status === 'authenticated') {
        checkPassed = context.isAuthenticated();
      } else if (status === 'anonymous') {
        checkPassed = !context.isAuthenticated();
      }
    }

    if (role && context.isAuthenticated()) {
      checkPassed = context.wikiContext.hasRole(role);
    }

    if (group && context.isAuthenticated()) {
      // Check group membership (groups are treated as roles in our system)
      checkPassed = context.wikiContext.hasRole(group);
    }

    if (user && context.isAuthenticated()) {
      checkPassed = context.userName === user;
    }

    if (checkPassed) {
      // Recursively process the content
      const markupParser = this.engine?.getManager('MarkupParser') as MarkupParser | undefined;
      if (markupParser) {
        return await markupParser.parse(content, {
          pageName: context.wikiContext?.pageName ?? 'unknown',
          userName: context.userName,
          userContext: context.wikiContext?.userContext
        });
      }
      return content;
    }

    return ''; // User check failed
  }

  /**
   * Evaluate conditional expression for wiki:If tags
   * @param condition - Condition expression to evaluate
   * @param context - Parse context
   * @returns True if condition passes
   */
  private async evaluateCondition(condition: string, context: WikiTagParseContext): Promise<boolean> {
    // Simple condition evaluation - can be extended for complex expressions

    // Authentication check
    if (condition === 'authenticated') {
      return context.isAuthenticated();
    }

    if (condition === 'anonymous') {
      return !context.isAuthenticated();
    }

    // Permission checks: hasPermission:read, hasPermission:write
    // #633: was the resource-aware two-arg form; use canAccess for the
    // current page's resource-aware ACL evaluation.
    const permissionMatch = condition.match(/^hasPermission:(\w+)$/);
    if (permissionMatch) {
      const permission = permissionMatch[1];
      return context.wikiContext.canAccess(permission);
    }

    // Page existence checks: exists:PageName
    const existsMatch = condition.match(/^exists:(.+)$/);
    if (existsMatch) {
      const pageName = existsMatch[1];
      const pageManager = context.getManager('PageManager') as PageManager | undefined;
      if (pageManager) {
        try {
          const page = await pageManager.getPage(pageName);
          return !!page;
        } catch {
          return false;
        }
      }
      return false;
    }

    // Variable comparisons: $user == 'admin', $pagename != 'Main'
    const variableMatch = condition.match(/^\$(\w+)\s*(==|!=)\s*['"](.+)['"]$/);
    if (variableMatch) {
      const [, varName, operator, expectedValue] = variableMatch;
      const actualValue = await this.resolveContextVariable(varName, context);

      if (operator === '==') {
        return actualValue === expectedValue;
      } else if (operator === '!=') {
        return actualValue !== expectedValue;
      }
    }

    // Boolean operations: authenticated && hasPermission:write
    if (condition.includes('&&') || condition.includes('||')) {
      return await this.evaluateComplexCondition(condition, context);
    }

    // Default: try to parse as boolean
    if (condition === 'true') return true;
    if (condition === 'false') return false;

    logger.warn(`Unknown condition in wiki:If: ${condition}`);
    return false;
  }

  /**
   * Evaluate complex boolean conditions with && and || operators
   * @param condition - Complex condition expression
   * @param context - Parse context
   * @returns Evaluation result
   */
  private async evaluateComplexCondition(condition: string, context: WikiTagParseContext): Promise<boolean> {
    // Simple implementation - can be enhanced with proper expression parsing

    // Handle AND operations: condition1 && condition2
    if (condition.includes('&&')) {
      const parts = condition.split('&&').map(part => part.trim());
      for (const part of parts) {
        const result = await this.evaluateCondition(part, context);
        if (!result) {
          return false; // Short-circuit on first false
        }
      }
      return true;
    }

    // Handle OR operations: condition1 || condition2
    if (condition.includes('||')) {
      const parts = condition.split('||').map(part => part.trim());
      for (const part of parts) {
        const result = await this.evaluateCondition(part, context);
        if (result) {
          return true; // Short-circuit on first true
        }
      }
      return false;
    }

    return false;
  }

  /**
   * Resolve context variable for conditions
   * @param varName - Variable name
   * @param context - Parse context
   * @returns Variable value
   */
  private async resolveContextVariable(varName: string, context: WikiTagParseContext): Promise<string> {
    switch (varName) {
    case 'user':
    case 'username':
      return context.userName || 'anonymous';
    case 'page':
    case 'pagename':
      return context.wikiContext?.pageName || '';
    case 'authenticated':
      return context.isAuthenticated().toString();
    default: {
      // Try to resolve through VariableManager
      const variableManager = context.getManager('VariableManager') as VariableManager | undefined;
      if (variableManager) {
        try {
          return variableManager.expandVariables(`\${${varName}}`, {});
        } catch {
          return '';
        }
      }
      return '';
    }
    }
  }

  /**
   * Check if user has permission to include specified page
   * @param pageName - Page to include
   * @param context - Parse context
   * @returns True if permission granted
   */
  private async checkIncludePermission(pageName: string, context: WikiTagParseContext): Promise<boolean> {
    // #633: prior implementation called PolicyManager.checkPermission (which the
    // class doesn't actually expose — broken at runtime) for anonymous users and
    // the deprecated two-arg ParseContext.hasPermission for authenticated users.
    // Migrated to the canonical ACLManager 3-tier evaluator so anonymous and
    // authenticated paths share one code path. PolicyEvaluator's anonymous-role
    // expansion ('anonymous', 'All') makes the if-anonymous branch unnecessary.
    //
    // Note: tier 0 (private user-keyword) and tier 1 (frontmatter audience) are
    // skipped here because we don't fetch the included page's content/metadata.
    // The check falls through to tier 2 (PolicyEvaluator), which matches what
    // the original PolicyManager-based path was attempting. A future enhancement
    // could fetch the included page's metadata for full tier-0/1 evaluation.
    const aclManager = context.getManager('ACLManager') as { checkPagePermissionWithContext(ctx: unknown, action: string): Promise<boolean> } | undefined;
    if (!aclManager) return true; // Conservative: allow if ACLManager isn't registered
    return aclManager.checkPagePermissionWithContext({
      pageName,
      content: '',
      userContext: context.wikiContext?.userContext ?? undefined,
      pageMetadata: null
    }, 'view');
  }

  /**
   * Check for recursive inclusion to prevent infinite loops
   * @param pageName - Page being included
   * @param context - Parse context
   * @returns True if recursive inclusion detected
   */
  private isRecursiveInclusion(pageName: string, context: WikiTagParseContext): boolean {
    const inclusionStack = (context.getMetadata('inclusionStack') as string[] | undefined) || [];
    return inclusionStack.includes(pageName) || context.wikiContext?.pageName === pageName;
  }

  /**
   * Extract specific section from page content
   * @param content - Full page content
   * @param sectionName - Section name to extract
   * @returns Section content or full content if section not found
   */
  private extractSection(content: string, sectionName: string): string {
    // Look for markdown headers that match the section name
    const lines = content.split('\n');

    let startIndex = -1;
    let endIndex = lines.length;
    let sectionLevel = 0;

    // Find section start
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(#+)\s*(.+)\s*$/);

      if (headerMatch && headerMatch[2].trim().toLowerCase() === sectionName.toLowerCase()) {
        startIndex = i;
        sectionLevel = headerMatch[1].length;
        break;
      }
    }

    if (startIndex === -1) {
      // Section not found, return empty content with comment
      return `<!-- Section "${sectionName}" not found -->`;
    }

    // Find section end (next header of same or higher level)
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(#+)\s*(.+)\s*$/);

      if (headerMatch && headerMatch[1].length <= sectionLevel) {
        endIndex = i;
        break;
      }
    }

    return lines.slice(startIndex, endIndex).join('\n');
  }

  /**
   * Parse tag attributes from attribute string
   * @param attributeString - Attribute string to parse
   * @returns Parsed attributes
   */
  private parseTagAttributes(attributeString: string): TagAttributes {
    if (!attributeString || !attributeString.trim()) {
      return {};
    }

    const attributes: TagAttributes = {};
    // Enhanced regex to handle quoted attribute values
    const attributeRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
    let match: RegExpExecArray | null;

    while ((match = attributeRegex.exec(attributeString)) !== null) {
      const key = match[1];
      const value = match[2] ?? match[3] ?? match[4] ?? '';
      attributes[key] = value;
    }

    return attributes;
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
  private generateContextHash(context: WikiTagParseContext): string {
    const contextData = {
      pageName: context.wikiContext?.pageName,
      userName: context.userName,
      authenticated: context.isAuthenticated(),
      roles: context.getUserRoles(),
      // Include inclusion stack in hash to handle recursive includes
      inclusionStack: (context.getMetadata('inclusionStack') as string[] | undefined) || [],
      timeBucket: Math.floor(Date.now() / 300000) // 5-minute buckets
    };

    return crypto.createHash('md5').update(JSON.stringify(contextData)).digest('hex');
  }

  /**
   * Get supported WikiTag patterns
   * @returns Array of supported patterns
   */
  getSupportedPatterns(): string[] {
    return [
      '<wiki:If test="condition">content</wiki:If>',
      '<wiki:Include page="PageName" />',
      '<wiki:Include page="PageName" section="SectionName" />',
      '<wiki:UserCheck status="authenticated">content</wiki:UserCheck>',
      '<wiki:UserCheck role="admin">content</wiki:UserCheck>',
      '<wiki:UserCheck group="editors">content</wiki:UserCheck>',
      '<wiki:UserCheck user="username">content</wiki:UserCheck>'
    ];
  }

  /**
   * Get supported conditions for wiki:If tags
   * @returns Array of supported conditions
   */
  getSupportedConditions(): string[] {
    return [
      'authenticated',
      'anonymous',
      'hasPermission:read',
      'hasPermission:write',
      'exists:PageName',
      '$user == "value"',
      '$pagename != "value"',
      'authenticated && hasPermission:write',
      'exists:PageName || hasPermission:create'
    ];
  }

  /**
   * Get handler information for debugging and documentation
   * @returns Handler information
   */
  getInfo(): Record<string, unknown> {
    return {
      ...super.getMetadata(),
      supportedTags: Array.from(this.supportedTags),
      supportedPatterns: this.getSupportedPatterns(),
      supportedConditions: this.getSupportedConditions(),
      features: [
        'Conditional content display',
        'Page inclusion with security',
        'Section extraction',
        'User authentication checks',
        'Role and group validation',
        'Complex boolean conditions',
        'Recursive inclusion prevention',
        'Performance caching',
        'Security validation'
      ]
    };
  }
}

export default WikiTagHandler;

