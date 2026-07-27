import logger from '../../utils/logger.js';
import type ParseContext from '../context/ParseContext.js';

/**
 * BaseSyntaxHandler - Abstract base class for all markup syntax handlers
 *
 * Defines the contract that all syntax handlers must implement and provides
 * common utilities for pattern matching, parameter parsing, and error handling.
 *
 * Related Issue: #56 - Handler Registration and Priority System
 * Epic: #41 - Implement JSPWikiMarkupParser for Complete Enhancement Support
 */

/**
 * Handler configuration options
 */
export interface HandlerOptions {
  enabled?: boolean;
  timeout?: number;
  caseSensitive?: boolean;
  multiline?: boolean;
  global?: boolean;
  version?: string;
  description?: string;
  dependencies?: Array<string | DependencySpec>;
  throwOnError?: boolean;
  cacheEnabled?: boolean;
}

/**
 * Specific dependency specification
 */
export interface DependencySpec {
  type: 'manager' | 'handler';
  name: string;
  version?: string;
  optional?: boolean;
}

/**
 * Handler performance statistics
 */
export interface HandlerStats {
  executionCount: number;
  totalTime: number;
  errorCount: number;
  lastExecuted: Date | null;
  averageTime: number;
}

/**
 * Dependency validation error
 */
export interface DependencyError {
  type: 'manager' | 'handler' | 'validation_error';
  name?: string;
  dependency?: unknown;
  message: string;
  dependencySpec?: DependencySpec;
}

/**
 * Parameter validation rule
 */
export interface ValidationRule {
  type?: 'string' | 'number' | 'boolean' | 'object';
  required?: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  pattern?: string;
}

/**
 * Parameter validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  params: Record<string, unknown>;
}

/**
 * Single parameter validation result
 */
export interface ParameterValidationResult {
  error?: string;
  value?: unknown;
}

/**
 * Error context for debugging
 */
export interface ErrorContext {
  handlerId: string;
  error: string;
  stack?: string;
  contentLength: number;
  contentPreview: string;
  context: {
    pageName?: string;
    userName?: string;
    processingTime?: number;
  };
  stats: HandlerStats;
  timestamp: string;
}

/**
 * Handler metadata
 */
export interface HandlerMetadata {
  id: string;
  version: string;
  description: string;
  priority: number;
  pattern: string;
  dependencies: Array<string | DependencySpec>;
  options: Required<HandlerOptions>;
  stats: HandlerStats & {
    handlerId: string;
    priority: number;
    enabled: boolean;
    initialized: boolean;
  };
}

/**
 * Handler clone configuration
 */
export interface HandlerCloneConfig {
  handlerId?: string;
  pattern: RegExp;
  priority: number;
  options: Required<HandlerOptions>;
  version: string;
  description: string;
  dependencies: Array<string | DependencySpec>;
}

/**
 * Initialization context (minimal interface for unconverted dependencies)
 */
export interface InitializationContext {
  engine?: {
    getManager(name: string): unknown;
  };
  handlerRegistry?: {
    getHandler(name: string): unknown;
  };
}

/**
 * ParseContext re-export — the real class from `../context/ParseContext.js`.
 * Kept as a re-export so existing handlers can keep their
 * `import { ParseContext }` paths unchanged. (#629 Pass 2 resolved the
 * long-standing TODO of using the proper ParseContext type.)
 */
export type { ParseContext };

/**
 * BaseSyntaxHandler - Abstract base class for all markup syntax handlers
 */
abstract class BaseSyntaxHandler {
  priority: number;
  readonly pattern: RegExp;
  readonly handlerId: string;
  readonly version: string;
  readonly description: string;
  readonly dependencies: Array<string | DependencySpec>;

  protected options: Required<HandlerOptions>;
  protected stats: HandlerStats;
  protected initialized: boolean;
  protected enabled: boolean;
  protected initContext?: InitializationContext;
  protected dependencyErrors?: DependencyError[];

  /**
   * Create a syntax handler
   * @param pattern - Pattern to match (regex or string)
   * @param priority - Handler priority (0-1000, higher = executed first)
   * @param options - Handler configuration options
   */
  constructor(pattern: RegExp | string, priority: number = 100, options: HandlerOptions = {}) {
    if (new.target === BaseSyntaxHandler) {
      throw new Error('BaseSyntaxHandler is abstract and cannot be instantiated directly');
    }

    // Validate required parameters
    if (!pattern) {
      throw new Error('Pattern is required for syntax handler');
    }

    if (typeof priority !== 'number' || priority < 0 || priority > 1000) {
      throw new Error('Priority must be a number between 0 and 1000');
    }

    // Core handler properties
    this.priority = priority;
    this.options = {
      enabled: true,
      timeout: 5000, // 5 second timeout for handler execution
      caseSensitive: true,
      multiline: false,
      global: true,
      throwOnError: true,
      version: '1.0.0',
      description: '',
      dependencies: [],
      cacheEnabled: false,
      ...options
    };
    this.pattern = this.compilePattern(pattern);

    // Handler metadata
    this.handlerId = this.constructor.name;
    this.version = this.options.version;
    this.description = this.options.description;
    this.dependencies = this.options.dependencies;

    // Performance tracking
    this.stats = {
      executionCount: 0,
      totalTime: 0,
      errorCount: 0,
      lastExecuted: null,
      averageTime: 0
    };

    // Handler state
    this.initialized = false;
    this.enabled = this.options.enabled;
  }

  /**
   * Compile pattern into RegExp if it's a string
   * @param pattern - Pattern to compile
   * @returns Compiled regular expression
   */
  protected compilePattern(pattern: RegExp | string): RegExp {
    if (pattern instanceof RegExp) {
      return pattern;
    }

    if (typeof pattern === 'string') {
      // Escape special regex characters if it's a plain string
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = this.buildRegexFlags();
      return new RegExp(escaped, flags);
    }

    throw new Error('Pattern must be a RegExp or string');
  }

  /**
   * Build regex flags based on options
   * @returns Regex flags string
   */
  protected buildRegexFlags(): string {
    let flags = '';
    if (this.options.global) flags += 'g';
    if (!this.options.caseSensitive) flags += 'i';
    if (this.options.multiline) flags += 'm';
    return flags;
  }

  /**
   * Initialize the handler (optional override)
   * Called when handler is registered
   * @param context - Initialization context
   */
  async initialize(context: InitializationContext = {}): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Store context for later validation
    this.initContext = context;

    // Validate dependencies (non-throwing, stores errors for later)
    this.validateDependencies(context);

    // Perform custom initialization
    await this.onInitialize(context);

    this.initialized = true;
  }

  /**
   * Custom initialization logic (override in subclasses)
   * @param _context - Initialization context
   */
  protected async onInitialize(_context: InitializationContext): Promise<void> {
    // Override in subclasses for custom initialization
  }

  /**
   * Validate handler dependencies
   * @param context - Initialization context
   */
  protected validateDependencies(context: InitializationContext): void {
    // Initialize dependency errors array if not exists
    if (!this.dependencyErrors) {
      this.dependencyErrors = [];
    }

    for (const dependency of this.dependencies) {
      try {
        if (typeof dependency === 'string') {
          // Check if manager is available
          if (context.engine && !context.engine.getManager(dependency)) {
            this.dependencyErrors.push({
              type: 'manager',
              name: dependency,
              message: `Handler ${this.handlerId} requires ${dependency} manager`
            });
          }
        } else if (typeof dependency === 'object') {
          // Check specific dependency requirements
          this.validateSpecificDependency(dependency, context);
        }
      } catch (error) {
        // Store error instead of throwing
        this.dependencyErrors.push({
          type: 'validation_error',
          dependency,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Validate specific dependency requirement
   * @param dependency - Dependency specification
   * @param context - Initialization context
   */
  protected validateSpecificDependency(
    dependency: DependencySpec,
    context: InitializationContext
  ): void {
    const { type, name, optional = false } = dependency;

    if (type === 'manager') {
      const manager = context.engine?.getManager(name);
      if (!manager && !optional) {
        // Store error instead of throwing
        this.dependencyErrors = this.dependencyErrors || [];
        this.dependencyErrors.push({
          type: 'manager',
          name,
          message: `Handler ${this.handlerId} requires ${name} manager`,
          dependencySpec: dependency
        });
      }
    } else if (type === 'handler') {
      // Check if another handler is available
      const handler = context.handlerRegistry?.getHandler(name);
      if (!handler && !optional) {
        // Store error instead of throwing
        this.dependencyErrors = this.dependencyErrors || [];
        this.dependencyErrors.push({
          type: 'handler',
          name,
          message: `Handler ${this.handlerId} requires ${name} handler`,
          dependencySpec: dependency
        });
      }
    }
  }

  /**
   * Get dependency validation errors
   * @returns Array of dependency errors
   */
  getDependencyErrors(): DependencyError[] {
    return this.dependencyErrors || [];
  }

  /**
   * Check if handler has unresolved dependencies
   * @returns True if there are dependency errors
   */
  hasDependencyErrors(): boolean {
    return (this.dependencyErrors || []).length > 0;
  }

  /**
   * Main processing method - MUST be implemented by subclasses
   * @param content - Content to process
   * @param context - Parse context
   * @returns Processed content
   */
  abstract process(content: string, context: ParseContext): Promise<string>;

  /**
   * Handle a specific match - called for each pattern match
   * @param match - Regex match result
   * @param context - Parse context
   * @returns Replacement content
   */
  handle(_match: RegExpMatchArray, _context: ParseContext): Promise<string> {
    return Promise.reject(new Error(`Handler ${this.handlerId} must implement handle() method`));
  }

  /**
   * Execute the handler with performance tracking and error handling
   * @param content - Content to process
   * @param context - Parse context
   * @returns Processed content
   */
  async execute(content: string, context: ParseContext): Promise<string> {
    if (!this.enabled) {
      return content;
    }

    const startTime = Date.now();
    this.stats.executionCount++;

    try {
      // Set up timeout if specified
      const timeoutPromise = this.createTimeoutPromise();
      const processPromise = this.process(content, context);

      const result = await Promise.race([processPromise, timeoutPromise]);

      // Update performance stats
      const executionTime = Date.now() - startTime;
      this.stats.totalTime += executionTime;
      this.stats.averageTime = this.stats.totalTime / this.stats.executionCount;
      this.stats.lastExecuted = new Date();

      return result;

    } catch (error) {
      this.stats.errorCount++;

      // Create detailed error context
      const errorContext = this.createErrorContext(error as Error, content, context);

      if (this.options.throwOnError !== false) {
        throw new HandlerExecutionError(
          `Handler ${this.handlerId} execution failed: ${(error as Error).message}`,
          this.handlerId,
          errorContext
        );
      }

      // Log error and return original content for graceful degradation
      logger.error(`Handler ${this.handlerId} failed: ${JSON.stringify(errorContext)}`);
      return content;
    }
  }

  /**
   * Create timeout promise for handler execution
   * @returns Promise that rejects after timeout
   */
  protected createTimeoutPromise(): Promise<string> {
    if (!this.options.timeout) {
      return new Promise(() => {}); // Never resolves
    }

    return new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Handler ${this.handlerId} timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);
      timer.unref();
    });
  }

  /**
   * Create error context for debugging
   * @param error - The error that occurred
   * @param content - Content being processed
   * @param context - Parse context
   * @returns Error context
   */
  protected createErrorContext(error: Error, content: string, context: ParseContext): ErrorContext {
    return {
      handlerId: this.handlerId,
      error: error.message,
      stack: error.stack,
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + '...',
      context: {
        pageName: context.wikiContext?.pageName ?? undefined,
        userName: context.userName,
        processingTime: context.getTotalTime?.()
      },
      stats: { ...this.stats },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Parse parameters from parameter string
   * Handles various formats: key=value, key='value', key="value"
   * @param paramString - Parameter string to parse
   * @returns Parsed parameters
   */
  parseParameters(paramString: string | null | undefined): Record<string, unknown> {
    if (!paramString || typeof paramString !== 'string') {
      return {};
    }

    const params: Record<string, unknown> = {};
    const paramRegex = /(\w+)=(?:'([^']*)'|"([^"]*)"|([^\s]+))/g;
    let match: RegExpExecArray | null;

    while ((match = paramRegex.exec(paramString)) !== null) {
      const key = match[1];
      const value = match[2] || match[3] || match[4] || '';

      // Try to parse as JSON for complex values
      try {
         
        params[key] = JSON.parse(value);
      } catch {
        // If JSON parsing fails, use as string
         
        params[key] = value;
      }
    }

    return params;
  }

  /**
   * Validate parameters against schema
   * @param params - Parameters to validate
   * @param schema - Validation schema
   * @returns Validation result
   */
  validateParameters(
    params: Record<string, unknown>,
    schema: Record<string, ValidationRule> = {}
  ): ValidationResult {
    const errors: string[] = [];
    const validated: Record<string, unknown> = {};

    for (const [key, rule] of Object.entries(schema)) {
      const value = params[key];
      const result = this.validateParameter(key, value, rule);

      if (result.error) {
        errors.push(result.error);
      } else {
        validated[key] = result.value;
      }
    }

    // Add any parameters not in schema
    for (const [key, value] of Object.entries(params)) {
      if (!(key in schema)) {
        validated[key] = value;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      params: validated
    };
  }

  /**
   * Validate a single parameter
   * @param key - Parameter key
   * @param value - Parameter value
   * @param rule - Validation rule
   * @returns Validation result
   */
  protected validateParameter(key: string, value: unknown, rule: ValidationRule): ParameterValidationResult {
    const { type, required = false, default: defaultValue, min, max, pattern } = rule;

    // Check if required parameter is missing
    if (required && (value === undefined || value === null || value === '')) {
      return { error: `Parameter '${key}' is required` };
    }

    // Use default value if not provided
    if (value === undefined && defaultValue !== undefined) {
      return { value: defaultValue };
    }

    // Skip validation if value is undefined/null and not required
    if (value === undefined || value === null) {
      return { value: value };
    }

    // Type validation
    if (type && typeof value !== type) {
      return { error: `Parameter '${key}' must be of type ${type}` };
    }

    // Range validation for numbers
    if (type === 'number') {
      const numValue = value as number;
      if (min !== undefined && numValue < min) {
        return { error: `Parameter '${key}' must be >= ${min}` };
      }
      if (max !== undefined && numValue > max) {
        return { error: `Parameter '${key}' must be <= ${max}` };
      }
    }

    // Pattern validation for strings
    if (type === 'string' && pattern) {
      const regex = new RegExp(pattern);
      if (!regex.test(value as string)) {
        return { error: `Parameter '${key}' does not match required pattern` };
      }
    }

    return { value: value };
  }

  /**
   * Enable the handler
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable the handler
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if handler is enabled
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get handler statistics
   * @returns Handler statistics
   */
  getStats(): HandlerStats & {
    handlerId: string;
    priority: number;
    enabled: boolean;
    initialized: boolean;
    } {
    return {
      ...this.stats,
      handlerId: this.handlerId,
      priority: this.priority,
      enabled: this.enabled,
      initialized: this.initialized
    };
  }

  /**
   * Reset handler statistics
   */
  resetStats(): void {
    this.stats = {
      executionCount: 0,
      totalTime: 0,
      errorCount: 0,
      lastExecuted: null,
      averageTime: 0
    };
  }

  /**
   * Get handler metadata
   * @returns Handler metadata
   */
  getMetadata(): HandlerMetadata {
    return {
      id: this.handlerId,
      version: this.version,
      description: this.description,
      priority: this.priority,
      pattern: this.pattern.source,
      dependencies: this.dependencies,
      options: { ...this.options },
      stats: this.getStats()
    };
  }

  /**
   * Clean up handler resources (optional override)
   * Called when handler is unregistered
   */
  async shutdown(): Promise<void> {
    await this.onShutdown();
    this.initialized = false;
  }

  /**
   * Custom shutdown logic (override in subclasses)
   */
  protected async onShutdown(): Promise<void> {
    // Override in subclasses for custom cleanup
  }

  /**
   * Create a clone of this handler with different options
   * @param overrides - Option overrides
   * @returns Handler configuration for creating new instance
   */
  clone(overrides: Partial<HandlerOptions> & { handlerId?: string; priority?: number } = {}): HandlerCloneConfig {
    // Return a configuration object instead of trying to instantiate
    return {
      handlerId: overrides.handlerId || this.handlerId,
      pattern: this.pattern,
       
      priority: overrides.priority !== undefined ? overrides.priority : this.priority,
      options: { ...this.options, ...overrides },
      version: overrides.version || this.version,
      description: overrides.description || this.description,
      dependencies: [...this.dependencies]
    };
  }

  /**
   * String representation of handler
   * @returns String representation
   */
  toString(): string {
    return `${this.handlerId}(priority=${this.priority}, pattern=${this.pattern.source})`;
  }
}

/**
 * Custom error class for handler execution errors
 */
export class HandlerExecutionError extends Error {
  readonly handlerId: string;
  readonly context: ErrorContext;

  constructor(message: string, handlerId: string, context: ErrorContext) {
    super(message);
    this.name = 'HandlerExecutionError';
    this.handlerId = handlerId;
    this.context = context;
  }
}

// Export for ES modules
export default BaseSyntaxHandler;

