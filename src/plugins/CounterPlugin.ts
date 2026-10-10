/**
 * CounterPlugin - JSPWiki-style plugin for ngdpbase
 * Maintains page-specific counters that increment each time they render
 *
 * Unlike a persistent hit counter, this tracks counters within a single page render cycle.
 * Useful for numbering items, tracking plugin invocations, or conditional logic.
 *
 * Counter values can be accessed as variables:
 * - [{$counter}] - Access default counter value without incrementing
 * - [{$counter-name}] - Access named counter value without incrementing
 *
 * Syntax examples:
 * [{Counter}]                          - Default counter, increments by 1, shows value
 * [{Counter increment='5'}]            - Increments default counter by 5
 * [{Counter name='chapter'}]           - Named counter 'chapter'
 * [{Counter name='chapter' increment='2'}] - Increments 'chapter' by 2
 * [{Counter showResult='false'}]       - Silent increment (no output)
 * [{Counter start='100'}]              - Reset counter to 100
 * [{Counter name='section' start='1'}] - Reset named counter to 1
 * [{Counter increment='-1'}]           - Decrement counter
 *
 * Based on JSPWiki's Counter.java:
 * https://github.com/apache/jspwiki/blob/master/jspwiki-main/src/main/java/org/apache/wiki/plugin/Counter.java
 * https://jspwiki-wiki.apache.org/Wiki.jsp?page=Counter
 */

import type { PluginContext, PluginParams } from './types.js';

interface CounterContext extends PluginContext {
  counters?: Record<string, number>;
}

interface VariableManager {
  registerVariable(name: string, handler: (context: CounterContext) => string): void;
}

interface CounterParams {
  name?: string;
  increment?: string | number;
  showResult?: string | boolean;
  start?: string | number;
}

/**
 * Parse a parameter value as a number
 * @param value - Value to parse
 * @param defaultValue - Default if parsing fails
 * @returns Parsed number
 */
function parseNumber(value: unknown, defaultValue: number): number {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const num = Number(value);
  if (isNaN(num)) {
    // Invalid number, silently use default
    return defaultValue;
  }

  return num;
}

/**
 * Parse a parameter value as a boolean
 * @param value - Value to parse
 * @param defaultValue - Default if parsing fails
 * @returns Parsed boolean
 */
function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  // Handle non-string values safely
  if (typeof value !== 'string' && typeof value !== 'number') {
    return defaultValue;
  }
  const str = String(value).toLowerCase();
  if (str === 'true' || str === 'yes' || str === '1') {
    return true;
  }
  if (str === 'false' || str === 'no' || str === '0') {
    return false;
  }

  return defaultValue;
}

const CounterPlugin = {
  name: 'CounterPlugin',
  // #1751: each render counts again, so a page showing it is not kept in the page cache.
  volatile: true,
  description: 'Maintains page-specific counters for numbering and tracking',
  author: 'ngdpbase',
  version: '1.0.0',

  // Export helper methods for testing
  parseNumber,
  parseBoolean,

  /**
   * Execute the plugin
   * @param context - Wiki context containing counter state
   * @param params - Plugin parameters
   * @returns Counter value or empty string
   */
  execute(context: PluginContext, params: PluginParams): string {
    try {
      const counterContext = context as CounterContext;
      const opts = (params || {}) as CounterParams;
      const counterName = opts.name || 'counter';
      const increment = parseNumber(opts.increment, 1);
      const showResult = parseBoolean(opts.showResult, true);
      const start = opts.start !== undefined ? parseNumber(opts.start, 0) : undefined;

      // Initialize counters storage in context if needed
      if (!counterContext.counters) {
        counterContext.counters = {};
      }

      // Build the counter variable name (matches JSPWiki format)
      const varName = counterName === 'counter' ? 'counter' : `counter-${counterName}`;

      // Handle 'start' parameter - resets the counter
      if (start !== undefined) {
        counterContext.counters[varName] = start;
      } else {
        // Get current value or initialize to 0
        const currentValue = counterContext.counters[varName] || 0;
        // Apply increment
        counterContext.counters[varName] = currentValue + increment;
      }

      // Return the counter value if showResult is true
      if (showResult) {
        return String(counterContext.counters[varName]);
      }

      // Silent mode - return empty string
      return '';

    } catch (error) {
      const err = error as Error;
      return `[Counter Error: ${err.message}]`;
    }
  },

  /**
   * Plugin initialization (JSPWiki-style)
   * Registers counter variables with VariableManager for [{$counter}] access
   * @param engine - Wiki engine instance
   */
  initialize(engine: unknown): void {
    // Register counter variable handler with VariableManager
    const engineWithManager = engine as { getManager?: (name: string) => unknown };
    const variableManager = engineWithManager.getManager?.('VariableManager') as VariableManager | undefined;
    if (variableManager) {
      // Register handler for default counter variable [{$counter}]
      variableManager.registerVariable('counter', (context: CounterContext) => {
        return context?.counters?.counter?.toString() || '0';
      });
    }
  }
};

export default CounterPlugin;
