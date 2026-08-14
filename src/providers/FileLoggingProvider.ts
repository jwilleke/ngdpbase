/**
 * FileLoggingProvider - Default logging provider (Issue #169)
 *
 * Winston console + rotating-file transports with a timestamped single-line
 * format. This is the behaviour `src/utils/logger.ts` shipped before #169 —
 * extracted verbatim behind {@link BaseLoggingProvider} so the storage backend
 * is swappable without touching call sites. The exported `logger` API is
 * unchanged.
 *
 * @class FileLoggingProvider
 * @extends BaseLoggingProvider
 */

import path from 'path';
import { format, transports, Logform } from 'winston';
import type Transport from 'winston-transport';
import BaseLoggingProvider, {
  LoggingProviderConfig,
  LoggingProviderInfo
} from './BaseLoggingProvider.js';
import { redactSecretsFormat } from '../utils/redactSecrets.js';

/** Fallback when maxSize is unset or unparseable (1MB) */
const DEFAULT_MAX_SIZE = 1048576;

class FileLoggingProvider extends BaseLoggingProvider {
  /**
   * Console transport always; rotating-file transport added only when `dir`
   * is provided (avoids creating ./data/logs before ConfigurationManager
   * resolves paths — same guard as the pre-#169 logger).
   */
  createTransports(config: LoggingProviderConfig): Transport[] {
    const logTransports: Transport[] = [new transports.Console()];

    if (config.dir) {
      logTransports.push(
        new transports.File({
          filename: path.join(config.dir, 'app.log'),
          maxsize: this.resolveMaxSize(config.maxSize),
          maxFiles: config.maxFiles
        })
      );
    }

    return logTransports;
  }

  createFormat(): Logform.Format {
    return format.combine(
      format.timestamp(),
      // #1030: strike configured secrets before anything renders them. Placed
      // here rather than inside printf so it covers every transport at once,
      // and before printf because printf is what produces the final line.
      // The table is empty until WikiEngine fills it — see redactSecrets.ts for
      // why it cannot be read from config at this point.
      redactSecretsFormat(),
      format.printf((info) => {
        const ts = typeof info.timestamp === 'string' ? info.timestamp : JSON.stringify(info.timestamp);
        const msg = typeof info.message === 'string' ? info.message : JSON.stringify(info.message);
        return `${ts} [${info.level}]: ${msg}`;
      })
    );
  }

  getProviderInfo(): LoggingProviderInfo {
    return {
      name: 'FileLoggingProvider',
      version: '1.0.0',
      description: 'Winston console + rotating-file transports (default)',
      features: ['console', 'file', 'rotation']
    };
  }

  /** Convert a number or `'<n>[MB|KB|B]'` string to a byte count. */
  private resolveMaxSize(maxSize: number | string | undefined): number {
    if (typeof maxSize === 'number') return maxSize;
    if (typeof maxSize === 'string') {
      const m = maxSize.match(/^(\d+(?:\.\d+)?)\s*(MB|KB|B)?$/i);
      if (m) {
        const [, size, unit] = m;
        const mult = unit?.toUpperCase() === 'MB' ? 1024 * 1024
          : unit?.toUpperCase() === 'KB' ? 1024 : 1;
        return parseFloat(size) * mult;
      }
    }
    return DEFAULT_MAX_SIZE;
  }
}

export default FileLoggingProvider;
