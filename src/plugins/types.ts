/**
 * Plugin types for ngdpbase plugins
 *
 * These types provide proper TypeScript definitions for plugins
 * that use the object-with-execute pattern.
 */

/**
 * Wiki engine interface for plugins
 */
export interface WikiEngine {
  getManager(name: string): unknown;
  startTime?: number;
  logger?: {
    error: (...args: unknown[]) => void;
  };
  getConfig?(): { get?: (key: string, defaultValue: unknown) => unknown };
}

/**
 * Plugin context passed to plugins during execution
 */
export interface PluginContext {
  engine?: WikiEngine;
  pageName: string;
  linkGraph: Record<string, unknown>;
  /** Query-string parameters from the current HTTP request (e.g. { page: '2' }) */
  query?: Record<string, string>;
  /**
   * #1751: this render reads `topic`'s data (by convention the owning
   * manager's name, e.g. 'LedgerManager'). Call before reading; the cached
   * page is re-rendered once the manager bumps that topic.
   */
  dependsOn?: (topic: string) => void;
  /** #1751: this render's output changes on its own; do not cache the page. */
  markVolatile?: () => void;
  [key: string]: unknown;
}

/**
 * Plugin parameters (parsed from plugin syntax)
 */
export interface PluginParams {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Simple plugin interface for plugins that use the execute method pattern
 * (does not require the callable function signature)
 */
export interface SimplePlugin {
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  initialize?: (engine: unknown) => Promise<void> | void;
  fetch?:      (engine: unknown) => Promise<void> | void;
  execute?: (context: PluginContext, params: PluginParams) => Promise<string> | string;
  /**
   * Its output changes with nothing written (a clock): a page that runs it is
   * not kept in the page cache (#1751). Data a plugin reads from a manager is
   * declared with `context.dependsOn(topic)` instead, which keeps the page
   * cached until that data changes.
   */
  volatile?: boolean;
}

/**
 * Callable plugin type for plugins that can be called directly
 * (like referringPagesPlugin)
 */
export type CallablePlugin = ((
  pageName: string,
  params: PluginParams,
  linkGraph: Record<string, string[]>
) => string | Promise<string>) & {
  name: string;
  description: string;
  author: string;
  version: string;
  initialize?: (engine: unknown) => void;
};
