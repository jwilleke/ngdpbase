/**
 * BaseLoggingProvider - Base class for all logging providers (Issue #169)
 *
 * Encapsulates winston transport + format construction behind the provider
 * pattern, consistent with the Base*Provider family
 * (Search/Audit/Cache/Page/User/...).
 *
 * IMPORTANT — deliberate deviation from the engine-based provider pattern:
 * the logger is bootstrapped at module load (`src/utils/logger.ts`), long
 * before the WikiEngine or ConfigurationManager exist, and is imported by
 * virtually every module (including ConfigurationManager itself). A logging
 * provider therefore CANNOT take an engine or read ConfigurationManager in a
 * constructor/initialize() — doing so would create a bootstrap cycle. It is a
 * pure, dependency-free transport/format factory. Provider *selection* happens
 * later in `WikiEngine.initialize()` once config is resolved.
 *
 * @class BaseLoggingProvider
 * @abstract
 *
 * @see {@link FileLoggingProvider} for the default file+console implementation
 * @see {@link module:logger} for usage / selection
 */

import type Transport from 'winston-transport';
import type { Logform } from 'winston';
import BaseProvider from './BaseProvider.js';

/**
 * Logger configuration passed to a provider when (re)building transports.
 * Mirrors {@link module:logger.LoggerConfig}.
 */
export interface LoggingProviderConfig {
  /** Log level (error, warn, info, debug) */
  level?: string;
  /** Log directory path — file transport is only added when this is set */
  dir?: string;
  /** Max log file size in bytes or string form (e.g. '1MB') */
  maxSize?: number | string;
  /** Max number of rotated log files */
  maxFiles?: number;
}

/** Provider metadata, consistent with the other Base*Provider classes */
export interface LoggingProviderInfo {
  name: string;
  version: string;
  description: string;
  features: string[];
}

abstract class BaseLoggingProvider extends BaseProvider {
  /**
   * Build the winston transports for the given configuration.
   *
   * @param config - Resolved logger configuration
   * @returns Array of winston transport instances
   * @abstract
   */
  abstract createTransports(config: LoggingProviderConfig): Transport[];

  /**
   * Build the winston log format. Default is a timestamped single-line
   * `printf`. Subclasses may override for structured/JSON output.
   *
   * @returns winston format
   */
  abstract createFormat(): Logform.Format;

  /**
   * Provider metadata.
   */
  getProviderInfo(): LoggingProviderInfo {
    return {
      name: 'BaseLoggingProvider',
      version: '1.0.0',
      description: 'Base logging provider interface',
      features: []
    };
  }
}

export default BaseLoggingProvider;
