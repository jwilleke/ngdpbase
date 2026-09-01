/**
 * WikiEngine type definitions
 *
 * Defines the core WikiEngine interface and manager registry types.
 * WikiEngine is the central orchestrator that manages all subsystems.
 */

import { WikiConfig } from './Config.js';
import type { Logger } from 'winston';
import type { Application } from 'express';

/**
 * All known manager names as a union type
 * Use with getManager() for type-safe access when combined with explicit type parameter
 */
export type ManagerName =
  | 'ConfigurationManager'
  | 'PageManager'
  | 'UserManager'
  | 'ACLManager'
  | 'PluginManager'
  | 'RenderingManager'
  | 'SearchManager'
  | 'VariableManager'
  | 'ValidationManager'
  | 'SchemaManager'
  | 'PolicyManager'
  | 'PolicyValidator'
  | 'PolicyEvaluator'
  | 'ExportManager'
  | 'ImportManager'
  | 'TemplateManager'
  | 'AttachmentManager'
  | 'BackupManager'
  | 'CacheManager'
  | 'AuditManager'
  | 'NotificationManager'
  | 'CatalogManager';

/**
 * Manager registry - maps manager names to manager instances
 * Note: Uses 'any' for backwards compatibility with existing code
 */
export interface ManagerRegistry {
  [managerName: string]: unknown;
}

/**
 * WikiEngine interface
 *
 * The core engine that orchestrates all wiki functionality.
 * Manages initialization, configuration, and provides access to all managers.
 */
export interface WikiEngine {
  /** Wiki configuration */
  config?: WikiConfig;

  // Note: `managers` and `initialized` are protected in the class implementation,
  // so they can't be declared here. They're accessible via index signature.

  /** Logger instance (winston Logger) */
  logger?: Logger;

  /** Engine start time */
  startTime?: number;

  /** Current context (request-scoped) */
  context?: unknown;

  /**
   * Express application instance — available for add-ons to mount routes and
   * middleware via engine.app.use().  Set by app.js before AddonsManager
   * initialises (#359).
   */
  app?: Application;

  /**
   * Initialize the wiki engine
   * @param config - Wiki configuration
   * @returns The initialized engine or void
   */
  initialize(config?: WikiConfig): Promise<void>;

  /**
   * Initialize AddonsManager — call from app.ts after session/userContext middleware.
   */
  initializeAddons(): Promise<void>;

  /**
   * Get a manager by name
   * @param managerName - Name of the manager
   * @returns Manager instance or undefined
   *
   * @example
   * // Type-safe usage with explicit type parameter:
   * const pageManager = engine.getManager<PageManager>('PageManager');
   */
  getManager<T = unknown>(managerName: string): T | undefined;

  /**
   * Register a manager
   * @param managerName - Name of the manager
   * @param manager - Manager instance
   */
  registerManager(managerName: string, manager: unknown): void;

  /**
   * Get wiki configuration
   * @returns Wiki configuration object
   */
  getConfig(): WikiConfig;

  /**
   * Shutdown the wiki engine
   */
  shutdown(): Promise<void>;

  /**
   * Record a configuration value that cannot be used (#1152).
   *
   * Recorded rather than thrown so `initialize()` finishes and the admin
   * screens exist — the instance then serves maintenance mode with a route to
   * the repair, instead of exiting and leaving the filesystem as the only way
   * back. Only for values an administrator can fix through the admin UI; a
   * failure of the machinery needed to serve that UI is fatal and still throws.
   */
  blockConfiguration(reason: string): void;

  /** Configuration values that could not be used, in the order found (#1152). */
  getBlockingConditions(): readonly string[];

  /**
   * Get all registered manager names
   * @returns Array of manager names
   */
  getRegisteredManagers(): string[];

  /**
   * Return the optional-capability map set during initialization.
   * Used by templates to conditionally show/hide panels for disabled features.
   * @returns Record mapping capability ID → boolean (e.g. { media: false })
   */
  getCapabilities(): Record<string, boolean>;

  /**
   * Record whether an optional capability is active.
   * @param id - Capability identifier (e.g. 'media', 'audit')
   * @param enabled - Whether the capability is active
   */
  setCapability(id: string, enabled: boolean): void;

  /** Allow additional properties for extensibility */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- index signature needed for class compatibility
  [key: string]: any;
}
