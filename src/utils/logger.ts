/**
 * Simple logging framework using winston
 *
 * Provides centralized logging for the entire ngdpbase application with
 * file rotation, console output, and configurable log levels.
 *
 * Issue #169: transport + format construction is delegated to a
 * {@link BaseLoggingProvider} (default {@link FileLoggingProvider}) so the
 * storage backend is swappable. The exported `logger` API is unchanged —
 * call sites need no edits. The provider is deliberately engine-free: the
 * logger bootstraps before WikiEngine/ConfigurationManager exist and is
 * imported by nearly every module, so provider *selection* happens later in
 * `WikiEngine.initialize()` via {@link setLoggingProvider}.
 *
 * @module logger
 *
 * @example
 * import logger from './utils/logger';
 * logger.info('Application started');
 * logger.error('Error occurred', { error });
 */

import { createLogger, Logger } from 'winston';
import BaseLoggingProvider from '../providers/BaseLoggingProvider.js';
import FileLoggingProvider from '../providers/FileLoggingProvider.js';

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Log level (error, warn, info, debug) */
  level?: string;
  /** Log directory path */
  dir?: string;
  /** Max log file size in bytes or string format (e.g., '1MB') */
  maxSize?: number | string;
  /** Max number of rotated log files */
  maxFiles?: number;
}

// Default config (can be overridden)
// Note: File transport is only added when 'dir' is explicitly provided
// (e.g., during reconfiguration from WikiEngine after ConfigurationManager resolves paths)
const defaultConfig = {
  level: 'info',
  maxSize: 1048576, // 1MB
  maxFiles: 5
} as const;

/**
 * The active logging provider. Defaults to FileLoggingProvider (the pre-#169
 * behaviour). Swapped via {@link setLoggingProvider} once config is resolved.
 */
let activeProvider: BaseLoggingProvider = new FileLoggingProvider();

/**
 * Resolve a provider name (e.g. `'fileloggingprovider'`) to an instance.
 * Unknown names fall back to FileLoggingProvider — logging must never fail
 * to initialize because of a misconfigured provider key.
 *
 * @param name - Lowercase provider name from `ngdpbase.logging.provider`
 * @returns A logging provider instance
 */
export function resolveLoggingProvider(name: string | undefined): BaseLoggingProvider {
  switch ((name ?? '').toLowerCase()) {
  case 'fileloggingprovider':
  case '':
    return new FileLoggingProvider();
  default:
    // No logger guarantees available here yet; fall back silently to the
    // default rather than throwing during bootstrap.
    return new FileLoggingProvider();
  }
}

/**
 * Set the active logging provider. Called by WikiEngine after
 * ConfigurationManager resolves `ngdpbase.logging.provider`. Does not rebuild
 * the running logger on its own — {@link reconfigureLogger} does that.
 *
 * @param provider - The provider instance to activate
 */
export function setLoggingProvider(provider: BaseLoggingProvider): void {
  activeProvider = provider;
}

/**
 * Creates a winston logger instance with the specified configuration.
 * Transports and format are produced by the active logging provider.
 *
 * @param config - Logger configuration
 * @returns Winston logger instance
 */
export function createLoggerWithConfig(config: LoggerConfig = {}): Logger {
  const logConfig = { ...defaultConfig, ...config };

  return createLogger({
    level: logConfig.level,
    format: activeProvider.createFormat(),
    transports: activeProvider.createTransports(logConfig)
  });
}

/**
 * Reconfigures the global logger instance with new settings
 *
 * @param config - New logger configuration
 * @returns Updated logger instance
 */
export function reconfigureLogger(config: LoggerConfig): Logger {
  if (!loggerInstance) {
    throw new Error('Logger instance not initialized');
  }

  const currentLogger = loggerInstance; // Capture for closure
  const newLogger = createLoggerWithConfig(config);

  // Clear existing transports
  currentLogger.clear();

  // Add new transports from the reconfigured logger
  newLogger.transports.forEach(transport => {
    currentLogger.add(transport);
  });

  // Update logger level
  currentLogger.level = newLogger.level;

  return currentLogger;
}

// Create default logger instance - always initialized before export
const loggerInstance: Logger = createLoggerWithConfig();

// Export the logger instance as default
export default loggerInstance;
