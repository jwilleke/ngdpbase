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
        // #1141: render the metadata too. This printf used to emit only
        // timestamp/level/message, so the second argument of every
        // `logger.error(msg, { error, stack })` call in the codebase was
        // dropped — a 500 on every missing page logged as the bare line
        // `[error]: [VIEW] Error viewing page`, with the cause nowhere on
        // disk. Redaction runs before this (see redactSecretsFormat above),
        // so what arrives here has already been stripped of secrets.
        const meta = FileLoggingProvider.renderMeta(info);
        return meta ? `${ts} [${info.level}]: ${msg} ${meta}` : `${ts} [${info.level}]: ${msg}`;
      })
    );
  }

  /**
   * Render whatever a caller passed as the second argument to `logger.*`.
   *
   * Winston merges that object onto `info` alongside its own keys, so the
   * three it owns are excluded, as are its symbol-keyed internals (`level`,
   * `message`, `splat`) — those are winston's plumbing and putting them in the
   * line would be noise at best.
   *
   * A `stack` is emitted on its own lines because a one-line stack is
   * unreadable, and reading the stack is the entire reason this exists.
   *
   * @param info - The winston info object for one log record
   * @returns The rendered metadata, or an empty string when there is none
   */
  private static renderMeta(info: Record<string, unknown>): string {
    const own = new Set(['timestamp', 'level', 'message']);
    const parts: string[] = [];
    let stack: string | undefined;

    for (const key of Object.keys(info)) {
      if (own.has(key)) continue;
      const value = info[key];
      if (value === undefined) continue;
      if (key === 'stack' && typeof value === 'string') {
        stack = value;
        continue;
      }
      parts.push(`${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }

    const inline = parts.length > 0 ? parts.join(' ') : '';
    if (stack) {
      return inline ? `${inline}\n${stack}` : stack;
    }
    return inline;
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
