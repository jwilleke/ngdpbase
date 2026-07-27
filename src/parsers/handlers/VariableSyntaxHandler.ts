import BaseSyntaxHandler, { InitializationContext, ParseContext } from './BaseSyntaxHandler.js';
import logger from '../../utils/logger.js';

/**
 * Variable match information
 */
interface VariableMatch {
  fullMatch: string;
  varName: string;
  index: number;
  length: number;
}

/**
 * Variable handler function type
 */
type VariableHandler = (context: ParseContext) => string | number | null | undefined | Promise<unknown>;

/**
 * Variable manager interface
 */
interface VariableManager {
  variableHandlers: Map<string, VariableHandler>;
}

/**
 * Wiki engine interface
 */
interface WikiEngine {
  getManager(name: string): unknown;
}

/**
 * VariableSyntaxHandler - WikiVariable syntax processing
 *
 * Handles JSPWiki-style variable syntax: [{$variablename}]
 * Variables are resolved through the VariableManager.
 *
 * Part of Issue #110 - Variable Syntax Fix
 */
class VariableSyntaxHandler extends BaseSyntaxHandler {
  declare handlerId: string;
  private engine: WikiEngine | null;
  private variableManager: VariableManager | null;

  constructor(engine: WikiEngine | null = null) {
    super(
      /\[\{\$(\w+)\}\]/g, // Pattern: [{$variablename}]
      95, // Higher priority than plugins (90) - process variables first
      {
        description: 'JSPWiki-style variable syntax handler',
        version: '1.0.0',
        dependencies: [] // No hard dependencies - gracefully handles missing VariableManager
      }
    );
    this.handlerId = 'VariableSyntaxHandler';
    this.engine = engine;
    this.variableManager = null;
  }

  /**
   * Initialize handler with configuration
   * @param context - Initialization context
   */
  protected async onInitialize(context: InitializationContext): Promise<void> {
    this.engine = context.engine ?? null;
    this.variableManager = this.engine?.getManager('VariableManager') as VariableManager | undefined ?? null;

    if (!this.variableManager) {
      logger.warn('  VariableSyntaxHandler: VariableManager not available');
    }
  }

  /**
   * Process content by finding and resolving all variables
   * @param content - Content to process
   * @param context - Parse context
   * @returns Content with variables resolved
   */
  async process(content: string, context: ParseContext): Promise<string> {
    if (!content || !this.variableManager) {
      return content;
    }

    const matches: VariableMatch[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.pattern.lastIndex = 0;

    // Find all variable matches
    while ((match = this.pattern.exec(content)) !== null) {
      matches.push({
        fullMatch: match[0],       // [{$variablename}]
        varName: match[1] ?? '',   // variablename
        index: match.index,
        length: match[0].length
      });
    }

    // Process matches in reverse order to maintain correct positions
    let result = content;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];

      try {
        // Resolve variable value
        const value = this.resolveVariable(m.varName, context);

        if (value !== null && value !== undefined) {
          // Replace with resolved value
          result = result.substring(0, m.index) +
                   value +
                   result.substring(m.index + m.length);
        } else {
          // Variable not found - keep original syntax
          logger.warn(`  Variable not found: ${m.varName}`);
          // Keep [{$variablename}] as-is
        }
      } catch (error) {
        const err = error as Error;
        logger.error(`Error resolving variable '${m.varName}':`, err.message);
        // On error, replace with error message
        const errorMsg = `[Error: ${err.message}]`;
        result = result.substring(0, m.index) +
                 errorMsg +
                 result.substring(m.index + m.length);
      }
    }

    return result;
  }

  /**
   * Resolves a variable name to its value
   *
   * @param varName - Variable name (without [{$ }])
   * @param context - Rendering context
   * @returns Variable value or null if not found
   */
  private resolveVariable(varName: string, context: ParseContext): string | null {
    if (!this.variableManager || !this.variableManager.variableHandlers) {
      return null;
    }

    // Get handler for this variable (case-insensitive)
    const handler = this.variableManager.variableHandlers.get(varName.toLowerCase().trim());

    if (!handler) {
      return null;
    }

    try {
      const result = handler(context);

      // Handle async handlers
      if (result instanceof Promise) {
        logger.warn(`  Variable '${varName}' returned Promise - cannot resolve synchronously`);
        return null;
      }

      return result !== null && result !== undefined ? String(result) : null;

    } catch (error) {
      logger.error(`Error resolving variable '${varName}':`, error);
      throw error;
    }
  }

}

export default VariableSyntaxHandler;

