/**
 * PluginManager's formatter helpers, for tests (#1820).
 *
 * PluginManager owns the helpers and hands them to every plugin it executes
 * as `context.formatters`; routes and managers read
 * `engine.getManager('PluginManager').formatters`. A test that calls a
 * plugin's `execute` directly, or mocks the engine, supplies them the same
 * way — from a real PluginManager, so the test runs against the object the
 * site uses.
 */
import PluginManager from '../managers/PluginManager.js';
import type { PluginFormatters } from '../managers/PluginManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';

/** The frozen helpers a PluginManager hands its plugins. */
export const TEST_FORMATTERS: PluginFormatters =
  new PluginManager({ getManager: () => undefined } as unknown as WikiEngine).formatters;

/** A mock engine's `PluginManager`: only the formatters routes and managers read. */
export const TEST_PLUGIN_MANAGER = { formatters: TEST_FORMATTERS };

/**
 * The plugin as PluginManager executes it: `execute` receives the test's
 * context with `formatters` added, as `PluginManager.execute` builds it.
 * Everything else on the plugin is the plugin itself.
 */
export function asExecuted<T extends object>(plugin: T): T {
  return new Proxy(plugin, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (prop !== 'execute' || typeof value !== 'function') return value;
      return (context: Record<string, unknown> | null | undefined, ...rest: unknown[]) =>
        (value as (...args: unknown[]) => unknown).call(target, { ...context, formatters: TEST_FORMATTERS }, ...rest);
    }
  });
}
