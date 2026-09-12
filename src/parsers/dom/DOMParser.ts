import { Tokenizer } from './Tokenizer.js';
import DOMBuilder from './DOMBuilder.js';
import WikiDocument from './WikiDocument.js';
import logger from '../../utils/logger.js';

/**
 * DOMParser - Complete DOM-based parsing pipeline for wiki markup
 *
 * ============================================================================
 * ARCHITECTURE NOTE (Phase 4, Issue #118):
 * ============================================================================
 *
 * **This DOMParser is a REFERENCE IMPLEMENTATION and is NOT actively used
 * in the current rendering pipeline.**
 *
 * This parser uses the Tokenizer → DOMBuilder pipeline, which was the Phase 0
 * approach to WikiDocument DOM parsing. However, it has been superseded by
 * the extraction-based approach in Phases 1-3.
 *
 * CURRENT ACTIVE PIPELINE:
 * ------------------------
 * Use `MarkupParser.parseWithDOMExtraction()` instead of this DOMParser.
 *
 * The new pipeline:
 * 1. MarkupParser.extractJSPWikiSyntax() - Extract JSPWiki syntax
 * 2. MarkupParser.createDOMNode() - Create DOM nodes
 * 3. markdown-it makeHtml() - Process markdown
 * 4. MarkupParser.mergeDOMNodes() - Merge nodes into HTML
 *
 * WHY THIS DOMPARSER IS KEPT:
 * ---------------------------
 * - Reference implementation for token-based parsing
 * - Useful for understanding the tokenization approach
 * - May be enhanced for specific use cases in the future
 * - Educational value for understanding different parsing strategies
 *
 * SEE ALSO:
 * - Tokenizer.js - For detailed architecture notes
 * - MarkupParser.parseWithDOMExtraction() - Current active pipeline
 * - Issue #114 - WikiDocument DOM Solution
 * - Issue #118 - Architecture documentation (this change)
 *
 * ============================================================================
 *
 * ORIGINAL DESCRIPTION:
 * Integrates Tokenizer and DOMBuilder to convert wiki markup into
 * a structured WikiDocument DOM tree. Provides error handling, recovery,
 * and detailed error messages with position information.
 *
 * This follows JSPWiki's MarkupParser architecture.
 *
 * Key Features:
 * - Complete parsing pipeline (Tokenizer → DOMBuilder)
 * - Error handling with position tracking
 * - Helpful error messages
 * - Parse statistics and metadata
 * - Graceful degradation on errors
 *
 * Part of Phase 2.5 of WikiDocument DOM Migration (GitHub Issue #93)
 *
 * JSPWiki Reference:
 * https://github.com/apache/jspwiki/blob/master/jspwiki-main/src/main/java/org/apache/wiki/parser/MarkupParser.java
 */

/**
 * DOMParser options
 */
export interface DOMParserOptions {
  /** Enable debug logging */
  debug?: boolean;
  /** Throw on parse errors instead of creating error document */
  throwOnError?: boolean;
  /** Error callback */
  onError?: ((error: ParseError) => void) | null;
  /** Warning callback */
  onWarning?: ((warning: WarningInfo) => void) | null;
}

/**
 * Parse statistics
 */
export interface ParseStatistics {
  /** Total number of parses attempted */
  totalParses: number;
  /** Number of successful parses */
  successfulParses: number;
  /** Number of failed parses */
  failedParses: number;
  /** Total parse time in milliseconds */
  totalParseTime: number;
  /** Last parse time in milliseconds */
  lastParseTime: number;
}

/**
 * Extended statistics with computed values
 */
export interface ExtendedStatistics extends ParseStatistics {
  /** Average parse time in milliseconds */
  averageParseTime: number;
  /** Success rate as percentage */
  successRate: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the content is valid */
  valid: boolean;
  /** Parse errors */
  errors: ErrorInfo[];
  /** Parse warnings */
  warnings: WarningInfo[];
}

/**
 * Error information
 */
export interface ErrorInfo {
  /** Error message */
  message: string;
  /** Character position */
  position?: number;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
}

/**
 * Warning information
 */
export interface WarningInfo {
  /** Warning message */
  message: string;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
}

/**
 * Token interface (from Tokenizer)
 */
export interface Token {
  /** Token type */
  type: string;
  /** Token value */
  value: string;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
  /** Additional properties */
  [key: string]: unknown;
}

/**
 * Rendering context
 */
export interface RenderContext {
  /** Additional context properties */
  [key: string]: unknown;
}

/**
 * DOMParser class
 */
class DOMParser {
  /** Parser options */
  protected options: Required<DOMParserOptions>;

  /** Parse statistics */
  private parseStats: ParseStatistics;

  /**
   * Creates a new DOMParser
   *
   * @param options - Parser options
   */
  constructor(options: DOMParserOptions = {}) {
    this.options = {
      debug: options.debug || false,
      throwOnError: options.throwOnError || false,
      onError: options.onError || null,
      onWarning: options.onWarning || null
    };

    this.parseStats = {
      totalParses: 0,
      successfulParses: 0,
      failedParses: 0,
      totalParseTime: 0,
      lastParseTime: 0
    };
  }

  /**
   * Parses wiki markup content into a WikiDocument
   *
   * Main entry point for DOM-based parsing. This is equivalent to
   * JSPWiki's MarkupParser.parse() method.
   *
   * @param content - Wiki markup content to parse
   * @param context - Rendering context (page info, user, etc.)
   * @returns Parsed WikiDocument with DOM tree
   * @throws ParseError if throwOnError is true and parsing fails
   */
  parse(content: string | null | undefined, context: RenderContext | null = null): WikiDocument {
    const startTime = Date.now();
    this.parseStats.totalParses++;

    try {
      // Validate input
      let validContent = content;
      if (validContent === null || validContent === undefined) {
        validContent = '';
      }

      if (typeof validContent !== 'string') {
        throw new ParseError(
          'Invalid content type',
          0, 0, 0,
          `Expected string, got ${typeof validContent}`
        );
      }

      // Step 1: Create WikiDocument
      const wikiDocument = new WikiDocument(validContent, context ?? undefined);
      wikiDocument.setMetadata('parserVersion', '1.0.0');
      wikiDocument.setMetadata('parseStartTime', startTime);

      // Step 2: Tokenize
      this.log('Tokenizing content...');
      const tokenizer = new Tokenizer(validContent);
      let tokens: Token[];

      try {
         
        tokens = tokenizer.tokenize();
        this.log(`Tokenized into ${tokens.length} tokens`);
        wikiDocument.setMetadata('tokenCount', tokens.length);
      } catch (err) {
        throw new ParseError(
          'Tokenization failed',
           
          tokenizer.position,
           
          tokenizer.line,
           
          tokenizer.column,
          err instanceof Error ? err.message : String(err),
          err instanceof Error ? err : undefined
        );
      }

      // Step 3: Build DOM
      this.log('Building DOM tree...');
      const builder = new DOMBuilder(wikiDocument);

      try {
        builder.buildFromTokens(tokens);
        this.log(`Built DOM with ${wikiDocument.getChildCount()} root nodes`);
        wikiDocument.setMetadata('nodeCount', wikiDocument.getChildCount());
      } catch (err) {
        throw new ParseError(
          'DOM building failed',
          0, 0, 0,
          err instanceof Error ? err.message : String(err),
          err instanceof Error ? err : undefined
        );
      }

      // Step 4: Finalize
      const parseTime = Date.now() - startTime;
      this.parseStats.successfulParses++;
      this.parseStats.totalParseTime += parseTime;
      this.parseStats.lastParseTime = parseTime;

      wikiDocument.setMetadata('parseTime', parseTime);
      wikiDocument.setMetadata('parseSuccess', true);

      this.log(`Parse completed in ${parseTime}ms`);

      return wikiDocument;

    } catch (err) {
      this.parseStats.failedParses++;

      // Call error handler if provided
      if (this.options.onError && err instanceof ParseError) {
        this.options.onError(err);
      }

      // Either throw or return error document
      if (this.options.throwOnError) {
        throw err;
      } else {
        const validContent = content || '';
        return this.createErrorDocument(validContent, context, err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /**
   * Creates an error document when parsing fails
   *
   * This allows graceful degradation - the page will still render
   * but show the error to the user.
   *
   * @param content - Original content
   * @param context - Rendering context
   * @param error - The error that occurred
   * @returns Error document
   */
  createErrorDocument(content: string, context: RenderContext | null, error: Error): WikiDocument {
    const wikiDocument = new WikiDocument(content, context ?? undefined);
    wikiDocument.setMetadata('parseSuccess', false);
    wikiDocument.setMetadata('parseError', error.message);

    // Create error display
    const errorDiv = wikiDocument.createElement('div', {
      class: 'wiki-parse-error',
      'data-error-type': (error as ParseError).type || 'ParseError'
    });

    const errorTitle = wikiDocument.createElement('h3', {
      class: 'wiki-parse-error-title'
    });
    errorTitle.textContent = 'Parse Error';
    errorDiv.appendChild(errorTitle);

    const errorMessage = wikiDocument.createElement('p', {
      class: 'wiki-parse-error-message'
    });
    errorMessage.textContent = error.message || 'Unknown parse error';
    errorDiv.appendChild(errorMessage);

    // Add position info if available
    const parseError = error as ParseError;
    if (parseError.line !== undefined && parseError.column !== undefined) {
      const errorPosition = wikiDocument.createElement('p', {
        class: 'wiki-parse-error-position'
      });
      errorPosition.textContent = `At line ${parseError.line}, column ${parseError.column}`;
      errorDiv.appendChild(errorPosition);
    }

    // Add original content as preformatted text
    const contentPre = wikiDocument.createElement('pre', {
      class: 'wiki-parse-error-content'
    });
    const contentCode = wikiDocument.createElement('code');
    contentCode.textContent = content;
    contentPre.appendChild(contentCode);
    errorDiv.appendChild(contentPre);

    wikiDocument.appendChild(errorDiv);

    return wikiDocument;
  }

  /**
   * Validates wiki markup without building full DOM
   *
   * Useful for syntax checking before saving.
   *
   * @param content - Wiki markup to validate
   * @returns Validation result { valid: boolean, errors: [], warnings: [] }
   */
  validate(content: string): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: []
    };

    try {
      // Try tokenizing
      const tokenizer = new Tokenizer(content);
       
      const tokens: Token[] = tokenizer.tokenize();

      // Check for common issues
      this.checkForWarnings(tokens, result);

    } catch (err) {
      result.valid = false;
      const error = err as ParseError;
      result.errors.push({
        message: error.message || String(err),
        position: error.position,
        line: error.line,
        column: error.column
      });
    }

    return result;
  }

  /**
   * Checks tokens for common warnings
   *
   * @param tokens - Tokens to check
   * @param result - Result object to add warnings to
   */
  checkForWarnings(tokens: Token[], result: ValidationResult): void {
    // Look for unclosed brackets, unmatched delimiters, etc.
    // This is a placeholder for more sophisticated checks

    for (const token of tokens) {
      // Count opening/closing brackets in text
      if (token.value) {
        const openBrackets = (token.value.match(/\[/g) || []).length;
        const closeBrackets = (token.value.match(/]/g) || []).length;

        if (openBrackets !== closeBrackets) {
          result.warnings.push({
            message: 'Possibly unmatched brackets',
            line: token.line,
            column: token.column
          });
        }
      }
    }
  }

  /**
   * Gets parser statistics
   *
   * @returns Parser statistics
   */
  getStatistics(): ExtendedStatistics {
    return {
      ...this.parseStats,
      averageParseTime: this.parseStats.totalParses > 0
        ? this.parseStats.totalParseTime / this.parseStats.totalParses
        : 0,
      successRate: this.parseStats.totalParses > 0
        ? (this.parseStats.successfulParses / this.parseStats.totalParses) * 100
        : 0
    };
  }

  /**
   * Resets parser statistics
   */
  resetStatistics(): void {
    this.parseStats = {
      totalParses: 0,
      successfulParses: 0,
      failedParses: 0,
      totalParseTime: 0,
      lastParseTime: 0
    };
  }

  /**
   * Logs debug message if debug mode enabled
   *
   * @param message - Message to log
   */
  log(message: string): void {
    if (this.options.debug) {
      logger.debug(`[DOMParser] ${message}`);
    }
  }
}

/**
 * Custom error class for parse errors
 */
export class ParseError extends Error {
  /** Error type */
  type: string;
  /** Character position */
  position: number;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Underlying error */
  override cause?: Error;

  /**
   * Creates a parse error with position information
   *
   * @param type - Error type
   * @param position - Character position
   * @param line - Line number
   * @param column - Column number
   * @param message - Error message
   * @param cause - Underlying error
   */
  constructor(type: string, position: number, line: number, column: number, message: string, cause?: Error) {
    super(message);
    this.name = 'ParseError';
    this.type = type;
    this.position = position;
    this.line = line;
    this.column = column;
    this.cause = cause;

    // Create detailed message
    if (line !== undefined && column !== undefined) {
      this.message = `${type} at line ${line}, column ${column}: ${message}`;
    } else {
      this.message = `${type}: ${message}`;
    }
  }
}

export { DOMParser };
export default DOMParser;

// CommonJS compatibility - support both default and named imports
