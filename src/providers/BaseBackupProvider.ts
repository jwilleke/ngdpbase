/**
 * BaseBackupProvider - Base class for backup storage providers (Issue #170)
 *
 * Abstracts ONLY the backup storage target — where the assembled archive is
 * written/read/listed/pruned. The *content* side (calling backup() on every
 * manager, gzip, JSON, validation, retention policy, the auto-backup
 * scheduler) stays in BackupManager and is unchanged: per-manager
 * serialization was already provider-abstracted via `manager.backup()`, so
 * #170 deliberately does not re-abstract it.
 *
 * Consistent with the engine-based Base*Provider family
 * (Search/Audit/Cache/...). Unlike BaseLoggingProvider (#169), backup runs
 * well after engine init, so the standard engine + initialize() shape applies.
 *
 * @class BaseBackupProvider
 * @abstract
 *
 * @see {@link FileBackupProvider} for the default local-filesystem implementation
 * @see {@link BackupManager} for usage
 */

import type { WikiEngine } from '../types/WikiEngine.js';

/** Metadata for a stored backup object */
export interface BackupObjectInfo {
  filename: string;
  path: string;
  size: number;
  created: Date;
  modified: Date;
}

/** Provider metadata, consistent with the other Base*Provider classes */
export interface BackupProviderInfo {
  name: string;
  version: string;
  description: string;
  features: string[];
}

abstract class BaseBackupProvider {
  protected engine: WikiEngine;
  protected initialized: boolean;

  constructor(engine: WikiEngine) {
    this.engine = engine;
    this.initialized = false;
  }

  /** Load config and prepare the storage target (e.g. ensure the directory). */
  abstract initialize(): Promise<void>;

  /** The resolved backup container location (directory / bucket prefix). */
  abstract getBackupDirectory(): string;

  /** Ensure the storage container exists. */
  abstract ensureContainer(): Promise<void>;

  /**
   * Persist a backup object.
   *
   * @param filename - Object name (no path)
   * @param data - Serialized (optionally gzip-compressed) payload
   * @returns The full path / identifier of the written object
   */
  abstract writeBackup(filename: string, data: string | Buffer): Promise<string>;

  /** Read a backup object by full path or bare filename. */
  abstract readBackup(idOrPath: string): Promise<Buffer>;

  /** Whether a backup object exists, by full path or bare filename. */
  abstract backupExists(idOrPath: string): Promise<boolean>;

  /** All objects in the container (BackupManager applies its own name filter). */
  abstract listBackupObjects(): Promise<BackupObjectInfo[]>;

  /** Delete a backup object by full path or bare filename. */
  abstract removeBackup(idOrPath: string): Promise<void>;

  /** Re-point the storage target at runtime (admin changes the directory). */
  abstract setBackupDirectory(directory: string): Promise<void>;

  /** Provider metadata. */
  getProviderInfo(): BackupProviderInfo {
    return {
      name: 'BaseBackupProvider',
      version: '1.0.0',
      description: 'Base backup storage provider interface',
      features: []
    };
  }

  /** Health check — overridable by providers with remote dependencies. */
  async isHealthy(): Promise<boolean> {
    return true;
  }
}

export default BaseBackupProvider;
