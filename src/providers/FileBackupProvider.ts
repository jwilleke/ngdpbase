/**
 * FileBackupProvider - Default backup storage provider (Issue #170)
 *
 * Local-filesystem storage target for BackupManager. This is the I/O
 * behaviour BackupManager performed inline before #170 (fs-extra against
 * `ngdpbase.backup.directory`), extracted verbatim behind
 * {@link BaseBackupProvider} so the storage backend is swappable without
 * changing the orchestration/serialization logic.
 *
 * @class FileBackupProvider
 * @extends BaseBackupProvider
 */

import fs from 'fs-extra';
import path from 'path';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import BaseBackupProvider, {
  BackupObjectInfo,
  BackupProviderInfo
} from './BaseBackupProvider.js';

class FileBackupProvider extends BaseBackupProvider {
  private backupDirectory = '';

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('FileBackupProvider requires ConfigurationManager');
    }
    // Uses getResolvedDataPath to support INSTANCE_DATA_FOLDER (same key/default
    // BackupManager used before #170).
    this.backupDirectory = configManager.getResolvedDataPath(
      'ngdpbase.backup.directory',
      './data/backups'
    );
    await this.ensureContainer();
    this.initialized = true;
  }

  getBackupDirectory(): string {
    return this.backupDirectory;
  }

  async ensureContainer(): Promise<void> {
    if (this.backupDirectory) {
      await fs.ensureDir(this.backupDirectory);
    }
  }

  async writeBackup(filename: string, data: string | Buffer): Promise<string> {
    const target = path.join(this.backupDirectory, filename);
    await fs.writeFile(target, data);
    return target;
  }

  async readBackup(idOrPath: string): Promise<Buffer> {
    return fs.readFile(this.resolve(idOrPath));
  }

  async backupExists(idOrPath: string): Promise<boolean> {
    return fs.pathExists(this.resolve(idOrPath));
  }

  async listBackupObjects(): Promise<BackupObjectInfo[]> {
    if (!this.backupDirectory) return [];
    const dir = this.backupDirectory;
    const files = await fs.readdir(dir);
    return Promise.all(
      files.map(async (filename: string) => {
        const filePath = path.join(dir, filename);
        const stats = await fs.stat(filePath);
        return {
          filename,
          path: filePath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
    );
  }

  async removeBackup(idOrPath: string): Promise<void> {
    await fs.remove(this.resolve(idOrPath));
  }

  async setBackupDirectory(directory: string): Promise<void> {
    this.backupDirectory = directory;
    await this.ensureContainer();
  }

  getProviderInfo(): BackupProviderInfo {
    return {
      name: 'FileBackupProvider',
      version: '1.0.0',
      description: 'Local-filesystem backup storage (default)',
      features: ['local-fs']
    };
  }

  /** Absolute paths (from listBackupObjects / createBackup) pass through; bare
   *  names are resolved against the backup directory. */
  private resolve(idOrPath: string): string {
    return path.isAbsolute(idOrPath) ? idOrPath : path.join(this.backupDirectory, idOrPath);
  }
}

export default FileBackupProvider;
