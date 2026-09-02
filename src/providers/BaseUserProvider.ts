import logger from '../utils/logger.js';
import type { ProviderInfo } from '../types/Provider.js';
import { User, UserUpdateData, UserSession } from '../types/index.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import BaseProvider from './BaseProvider.js';

/**
 * Backup data structure
 */
interface BackupData {
  users?: Map<string, User> | Record<string, User>;
  sessions?: Map<string, UserSession> | Record<string, UserSession>;
  timestamp?: string;
  [key: string]: unknown;
}

/**
 * BaseUserProvider - Abstract interface for user storage providers
 *
 * All user storage providers must extend this class and implement its methods.
 * Providers handle the actual storage and retrieval of user accounts and sessions,
 * whether from filesystem (JSON), database, LDAP, or other backends.
 *
 * @class BaseUserProvider
 * @abstract
 *
 * @property {WikiEngine} engine - Reference to the wiki engine
 * @property {boolean} initialized - Whether provider has been initialized
 *
 * @see {@link FileUserProvider} for filesystem implementation
 * @see {@link UserManager} for usage
 */
abstract class BaseUserProvider extends BaseProvider {
  /** Reference to the wiki engine */
  protected engine: WikiEngine;

  /** Whether provider has been initialized */
  protected initialized: boolean;

  /**
   * Create a new user provider
   *
   * @constructor
   * @param {WikiEngine} engine - The WikiEngine instance
   * @throws {Error} If engine is not provided
   */
  constructor(engine: WikiEngine) {
    super();
    if (!engine) {
      throw new Error('BaseUserProvider requires an engine instance');
    }
    this.engine = engine;
    this.initialized = false;
  }

  /**
   * Initialize the provider
   *
   * IMPORTANT: Providers MUST access configuration via ConfigurationManager:
   *   const configManager = this.engine.getManager('ConfigurationManager');
   *   const value = configManager.getProperty('key', 'default');
   *
   * Do NOT read configuration files directly.
   *
   * @async
   * @abstract
   * @returns {Promise<void>}
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract initialize(): Promise<void>;

  /**
   * Get a user by username
   *
   * @async
   * @abstract
   * @param {string} username - Username to look up
   * @returns {Promise<User|null>} User object or null if not found
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract getUser(username: string): Promise<User | null>;

  /**
   * Get all usernames
   *
   * @async
   * @abstract
   * @returns {Promise<string[]>} Array of all usernames
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract getAllUsernames(): Promise<string[]>;

  /**
   * Get all users
   *
   * @async
   * @abstract
   * @returns {Promise<Map<string, User>>} Map of username to user object
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract getAllUsers(): Promise<Map<string, User>>;

  /**
   * Create a new user
   *
   * @async
   * @abstract
   * @param {User} userData - User data (password should be hashed by UserManager)
   * @returns {Promise<User>} Created user object
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract createUser(userData: User): Promise<User>;

  /**
   * Update an existing user
   *
   * @async
   * @abstract
   * @param {string} username - Username
   * @param {UserUpdateData} userData - Updated user data
   * @returns {Promise<void>}
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract updateUser(username: string, userData: UserUpdateData): Promise<void>;

  /**
   * Delete a user
   *
   * @async
   * @abstract
   * @param {string} username - Username to delete
   * @returns {Promise<boolean>} True if deleted, false if not found
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract deleteUser(username: string): Promise<boolean>;

  /**
   * Check if user exists
   *
   * @async
   * @abstract
   * @param {string} username - Username to check
   * @returns {Promise<boolean>} True if user exists
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract userExists(username: string): Promise<boolean>;

  /**
   * Create a new session
   *
   * @async
   * @abstract
   * @param {string} sessionId - Session ID
   * @param {UserSession} sessionData - Session data
   * @returns {Promise<void>}
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract createSession(sessionId: string, sessionData: UserSession): Promise<void>;

  /**
   * Get a session by ID
   *
   * @async
   * @abstract
   * @param {string} sessionId - Session ID
   * @returns {Promise<UserSession|null>} Session object or null if not found
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract getSession(sessionId: string): Promise<UserSession | null>;

  /**
   * Get all sessions
   *
   * @async
   * @abstract
   * @returns {Promise<Map<string, UserSession>>} Map of sessionId to session object
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract getAllSessions(): Promise<Map<string, UserSession>>;

  /**
   * Delete a session
   *
   * @async
   * @abstract
   * @param {string} sessionId - Session ID to delete
   * @returns {Promise<boolean>} True if deleted, false if not found
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract deleteSession(sessionId: string): Promise<boolean>;

  /**
   * Clean up expired sessions
   *
   * @async
   * @abstract
   * @returns {Promise<number>} Number of sessions removed
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract cleanExpiredSessions(): Promise<number>;

  /**
   * Backup all user and session data
   *
   * @async
   * @abstract
   * @returns {Promise<BackupData>} Backup data
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract backup(): Promise<BackupData>;

  /**
   * Restore user and session data from backup
   *
   * @async
   * @abstract
   * @param {BackupData} backupData - Backup data from backup() method
   * @returns {Promise<void>}
   * @throws {Error} Always throws - must be implemented by subclass
   */
  abstract restore(backupData: BackupData): Promise<void>;

  /**
   * Get provider information
   *
   * @returns {ProviderInfo} Provider metadata
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'BaseUserProvider',
      version: '1.0.0',
      description: 'Abstract base provider',
      features: []
    };
  }

  /**
   * Shutdown the provider (cleanup resources)
   *
   * @async
   * @returns {Promise<void>}
   */
  shutdown(): void {
    this.initialized = false;
    logger.info(`${this.getProviderInfo().name} shut down`);
  }
}

export default BaseUserProvider;
export { WikiEngine, ProviderInfo, BackupData };

