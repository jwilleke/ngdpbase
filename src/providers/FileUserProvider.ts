import BaseUserProvider, { WikiEngine, BackupData } from './BaseUserProvider.js';
import type ConfigurationManager from '../managers/ConfigurationManager.js';
import { promises as fs } from 'fs';
import path from 'path';
import { normalizeUsername } from '../utils/username.js';
import { writeFileAtomic } from '../utils/atomicWrite.js';
import logger from '../utils/logger.js';
import { User, UserUpdateData, UserSession } from '../types/index.js';

/**
 * FileUserProvider backup data structure
 */
interface FileUserProviderBackupData extends BackupData {
  providerName: string;
  version: string;
  timestamp: string;
  config: {
    usersDirectory: string;
    usersFile: string;
    sessionsFile: string;
  };
  users: Record<string, User>;
  sessions: Record<string, UserSession>;
  statistics: {
    totalUsers: number;
    activeSessions: number;
    usernames: string[];
  };
}

/**
 * Node.js error with code property
 */
interface NodeError extends Error {
  code?: string;
}

/**
 * FileUserProvider - JSON file-based user and session storage
 *
 * Stores users and sessions in JSON files on the filesystem.
 * This is the default provider for UserManager.
 */
class FileUserProvider extends BaseUserProvider {
  private users: Map<string, User>;
  private sessions: Map<string, UserSession>;
  private usersDirectory: string | null;
  private usersFile: string | null;
  private sessionsFile: string | null;

  constructor(engine: WikiEngine) {
    super(engine);
    this.users = new Map();
    this.sessions = new Map();
    this.usersDirectory = null;
    this.usersFile = null;
    this.sessionsFile = null;
  }

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      throw new Error('FileUserProvider requires ConfigurationManager');
    }

    // Load configuration - uses getResolvedDataPath to support INSTANCE_DATA_FOLDER
    this.usersDirectory = configManager.getResolvedDataPath(
      'ngdpbase.user.provider.storagedir',
      './data/users'
    );
    this.usersFile = configManager.getProperty(
      'ngdpbase.user.provider.files.users',
      'users.json'
    ) as string;
    this.sessionsFile = configManager.getProperty(
      'ngdpbase.user.provider.files.sessions',
      'sessions.json'
    ) as string;

    // Create storage directory
    await fs.mkdir(this.usersDirectory, { recursive: true });

    // Load users and sessions
    await this.loadUsers();
    await this.loadSessions();

    this.initialized = true;
    logger.info(`📁 FileUserProvider initialized with ${this.users.size} users`);
  }

  /**
   * Load users from disk
   */
  private async loadUsers(): Promise<void> {
    if (!this.usersDirectory || !this.usersFile) {
      throw new Error('FileUserProvider not initialized');
    }
    try {
      const usersFilePath = path.join(this.usersDirectory, this.usersFile);
      const usersData = await fs.readFile(usersFilePath, 'utf8');
      const users = JSON.parse(usersData) as Record<string, User>;

      // #1436: the index is keyed by the COMPARISON form of the name; the
      // record keeps whatever the person typed. Two records whose names differ
      // only in case or padding are one account under that rule, and silently
      // keeping whichever loaded last would hand one person another's record.
      // Refuse to start instead — the same choice the system principal makes
      // when its env var is unset (#631): an instance with an ambiguous user
      // store stops rather than guessing.
      const index = new Map<string, User>();
      const collisions: string[] = [];
      for (const [storedName, record] of Object.entries(users)) {
        const key = normalizeUsername(record?.username ?? storedName);
        const existing = index.get(key);
        if (existing) {
          collisions.push(`'${existing.username ?? key}' and '${record?.username ?? storedName}'`);
          continue;
        }
        index.set(key, record);
      }
      if (collisions.length > 0) {
        throw new Error(
          `User store has names that differ only in case or spacing, so they are the same account: ${collisions.join(', ')}. ` +
          'Rename or remove one of each pair in the user store, then restart (#1436).'
        );
      }
      this.users = index;
      logger.info(`📁 Loaded ${this.users.size} users from ${usersFilePath}`);
    } catch (err) {
      const error = err as NodeError;
      if (error.code === 'ENOENT') {
        // Users file doesn't exist yet
        this.users = new Map();
        logger.info('📁 No users file found, starting with empty user store');
      } else {
        logger.error('Error loading users:', err);
        throw err;
      }
    }
  }

  /**
   * Save users to disk
   */
  private async saveUsers(): Promise<void> {
    if (!this.usersDirectory || !this.usersFile) {
      throw new Error('FileUserProvider not initialized');
    }
    try {
      const usersFilePath = path.join(this.usersDirectory, this.usersFile);
      // Keyed by the stored name, not the normalized one, so the file keeps
      // reading the way an operator wrote it. Load normalizes again (#1436).
      const users = Object.fromEntries(
        Array.from(this.users.values()).map((u) => [u.username, u])
      );
      // #1438: temp-then-rename, never in place. The user store is the one
      // file whose loss stops the instance rather than degrading it — no
      // users means no admin, so it cannot be repaired through the UI. An
      // interrupted or raced in-place write left `users.json` one byte past
      // a complete JSON object on jimstest, and the engine refused to boot
      // nine times until the file was repaired by hand.
      //
      // Every sibling provider — role, person, organization — already wrote
      // this way (#1062). This one was the exception, and it was the one that
      // mattered most.
      //
      // fsync deliberately off, per atomicWrite's default: the failure here is
      // a process dying or two processes racing, and rename alone covers both.
      await writeFileAtomic(usersFilePath, JSON.stringify(users, null, 2));
      logger.debug(`📁 Saved ${this.users.size} users to ${usersFilePath}`);
    } catch (err) {
      logger.error('Error saving users:', err);
      throw err;
    }
  }

  /**
   * Load sessions from disk and clean up expired ones
   */
  private async loadSessions(): Promise<void> {
    if (!this.usersDirectory || !this.sessionsFile) {
      throw new Error('FileUserProvider not initialized');
    }
    this.sessions.clear();
    const sessionsFilePath = path.join(this.usersDirectory, this.sessionsFile);

    try {
      const sessionsData = await fs.readFile(sessionsFilePath, 'utf8');
      const sessionsFromFile = JSON.parse(sessionsData) as Record<string, UserSession>;

      const now = new Date();
      let sessionsChanged = false;

      for (const [sessionId, session] of Object.entries(sessionsFromFile)) {
        if (new Date(session.expiresAt) > now) {
          this.sessions.set(sessionId, session);
        } else {
          sessionsChanged = true;
        }
      }

      if (sessionsChanged) {
        await this.saveSessions();
      }

      logger.info(`📁 Loaded ${this.sessions.size} active sessions from ${sessionsFilePath}`);
    } catch (err) {
      const error = err as NodeError;
      if (error.code === 'ENOENT') {
        logger.info(`📁 No sessions file found at ${sessionsFilePath}, starting fresh`);
        this.sessions = new Map();
      } else {
        logger.error(`Error loading sessions from ${sessionsFilePath}:`, err);
        this.sessions = new Map();
      }
    }
  }

  /**
   * Save sessions to disk
   */
  private async saveSessions(): Promise<void> {
    if (!this.usersDirectory || !this.sessionsFile) {
      throw new Error('FileUserProvider not initialized');
    }
    const sessionsFilePath = path.join(this.usersDirectory, this.sessionsFile);

    try {
      const sessionsObject = Object.fromEntries(this.sessions);
      await fs.mkdir(path.dirname(sessionsFilePath), { recursive: true });
      // #1438: same reason as the user store, though this one fails softly —
      // a corrupt sessions file costs everyone their login, not the site.
      await writeFileAtomic(sessionsFilePath, JSON.stringify(sessionsObject, null, 2));
      logger.debug(`📁 Saved ${this.sessions.size} sessions to ${sessionsFilePath}`);
    } catch (err) {
      logger.error(`Error saving sessions to ${sessionsFilePath}:`, err);
      throw err;
    }
  }

  /**
   * Get a user by username
   */
  getUser(username: string): Promise<User | null> {
    return Promise.resolve(this.users.get(normalizeUsername(username)) || null);
  }

  /**
   * Get all usernames
   */
  getAllUsernames(): Promise<string[]> {
    // The names as stored, not the comparison keys — this feeds display and
    // admin listings, and lookups normalize on the way in anyway (#1436).
    return Promise.resolve(Array.from(this.users.values()).map((u) => u.username));
  }

  /**
   * Get all users
   */
  getAllUsers(): Promise<Map<string, User>> {
    return Promise.resolve(new Map(this.users));
  }

  /**
   * Create a new user
   */
  async createUser(userData: User): Promise<User> {
    const username = userData.username;
    // #1436: compare normalized, so `Jim` cannot be registered beside `jim`.
    if (this.users.has(normalizeUsername(username))) {
      throw new Error(`User already exists: ${username}`);
    }

    this.users.set(normalizeUsername(username), userData);
    await this.saveUsers();
    logger.info(`📁 Created user: ${username}`);
    return userData;
  }

  /**
   * Update an existing user
   */
  async updateUser(username: string, userData: UserUpdateData): Promise<void> {
    if (!this.users.has(normalizeUsername(username))) {
      throw new Error(`User not found: ${username}`);
    }

    this.users.set(normalizeUsername(username), userData as User);
    await this.saveUsers();
    logger.info(`📁 Updated user: ${username}`);
  }

  /**
   * Delete a user
   */
  async deleteUser(username: string): Promise<boolean> {
    const deleted = this.users.delete(normalizeUsername(username));

    if (deleted) {
      await this.saveUsers();
      logger.info(`📁 Deleted user: ${username}`);
    }

    return deleted;
  }

  /**
   * Check if user exists
   */
  userExists(username: string): Promise<boolean> {
    return Promise.resolve(this.users.has(normalizeUsername(username)));
  }

  /**
   * Create a new session
   */
  async createSession(sessionId: string, sessionData: UserSession): Promise<void> {
    this.sessions.set(sessionId, sessionData);
    await this.saveSessions();
    logger.debug(`📁 Created session: ${sessionId}`);
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Promise<UserSession | null> {
    return Promise.resolve(this.sessions.get(sessionId) || null);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Promise<Map<string, UserSession>> {
    return Promise.resolve(new Map(this.sessions));
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const deleted = this.sessions.delete(sessionId);

    if (deleted) {
      await this.saveSessions();
      logger.debug(`📁 Deleted session: ${sessionId}`);
    }

    return deleted;
  }

  /**
   * Clean up expired sessions
   */
  async cleanExpiredSessions(): Promise<number> {
    const now = new Date();
    let removedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (new Date(session.expiresAt) <= now) {
        this.sessions.delete(sessionId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      await this.saveSessions();
      logger.info(`📁 Cleaned up ${removedCount} expired sessions`);
    }

    return removedCount;
  }

  /**
   * Backup all user and session data
   */
  backup(): Promise<FileUserProviderBackupData> {
    logger.info('[FileUserProvider] Starting backup...');

    const backupData: FileUserProviderBackupData = {
      providerName: 'FileUserProvider',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      config: {
        usersDirectory: this.usersDirectory ?? '',
        usersFile: this.usersFile ?? '',
        sessionsFile: this.sessionsFile ?? ''
      },
      users: Object.fromEntries(this.users),
      sessions: Object.fromEntries(this.sessions),
      statistics: {
        totalUsers: this.users.size,
        activeSessions: this.sessions.size,
        usernames: Array.from(this.users.keys())
      }
    };

    logger.info(`[FileUserProvider] Backup complete: ${this.users.size} users, ${this.sessions.size} sessions`);

    return Promise.resolve(backupData);
  }

  /**
   * Restore user and session data from backup
   */
  async restore(backupData: BackupData): Promise<void> {
    logger.info('[FileUserProvider] Starting restore...');

    if (!backupData) {
      throw new Error('FileUserProvider: No backup data provided for restore');
    }

    try {
      // Restore users
      if (backupData.users && typeof backupData.users === 'object') {
        const usersRecord = backupData.users as Record<string, User>;
        this.users = new Map(Object.entries(usersRecord));
        await this.saveUsers();
        logger.info(`[FileUserProvider] Restored ${this.users.size} users`);
      }

      // Restore sessions
      if (backupData.sessions && typeof backupData.sessions === 'object') {
        // Filter out expired sessions during restore
        const now = new Date();
        const sessionsRecord = backupData.sessions as Record<string, UserSession>;
        const validSessions = Object.entries(sessionsRecord).filter(
          ([, session]) => new Date(session.expiresAt) > now
        );

        this.sessions = new Map(validSessions);
        await this.saveSessions();
        logger.info(`[FileUserProvider] Restored ${this.sessions.size} active sessions (expired sessions filtered out)`);
      }

      logger.info('[FileUserProvider] Restore completed successfully');
    } catch (error) {
      logger.error('[FileUserProvider] Restore failed:', error);
      throw error;
    }
  }

  /**
   * Get provider information
   */
  getProviderInfo(): { name: string; version: string; description: string; features: string[] } {
    return {
      name: 'FileUserProvider',
      version: '1.0.0',
      description: 'JSON file-based user and session storage',
      features: ['users', 'sessions', 'backup', 'restore', 'expiration-cleanup']
    };
  }

  /**
   * Shutdown the provider - clean up expired sessions then call parent
   */
  shutdown(): void {
    // Clean up expired sessions before shutdown (fire and forget for sync shutdown)
    void this.cleanExpiredSessions();

    super.shutdown();
    logger.info('FileUserProvider shut down');
  }
}

export default FileUserProvider;

