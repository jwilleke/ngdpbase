/**
 * WikiEngine type definitions
 *
 * Defines the core WikiEngine interface and manager registry types.
 * WikiEngine is the central orchestrator that manages all subsystems.
 */

import { WikiConfig } from './Config.js';
import type { Logger } from 'winston';
import type { Application, Request, RequestHandler, Router, RouterOptions } from 'express';
import type express from 'express';
import type { MaintenanceState } from '../utils/maintenanceState.js';

/**
 * All known manager names as a union type
 * Use with getManager() for type-safe access when combined with explicit type parameter
 */
export type ManagerName =
  | 'ConfigurationManager'
  | 'PageManager'
  | 'UserManager'
  | 'PolicyInformationPoint'
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

  // No `context` slot. Request state is never stored on the engine — a
  // WikiContext is created per request and passed into manager calls (#1132).

  /**
   * Express application instance — available for add-ons to mount routes and
   * middleware via engine.app.use().  Set by app.js before AddonsManager
   * initialises (#359).
   */
  app?: Application;

  /**
   * The data every page view gets — the header, the left menu, the CSRF token,
   * the signed-in user — exactly as core's own views get it
   * (WikiRoutes.getCommonTemplateData). An add-on route that renders a view
   * spreads it first: `res.render(view, { ...(await engine.templateData?.(req)), ... })`.
   * One path (#1749): no add-on builds its own. Set by app.ts once the routes
   * exist; add-ons call it per request.
   */
  templateData?: (req: Request) => Promise<Record<string, unknown>>;

  /**
   * An Express `Router` from core's own Express (#1861). Add-ons build routers
   * here and mount them with `engine.app.use(...)`; they never value-import
   * `express` (an installed add-on has none to resolve). `lint:addons` enforces it.
   */
  createRouter(options?: RouterOptions): Router;

  /**
   * `express.static` from core's own Express, for an add-on's `public/`
   * folder (#1861): `engine.app?.use('/addons/x', engine.serveStatic(dir))`.
   */
  serveStatic(root: string, options?: Parameters<typeof express.static>[1]): RequestHandler;

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
   * Whether the site is in maintenance mode, and why (#1906): the one door.
   * A manager that needs the site closed calls `maintenance.enter(reason,
   * { message?, estimatedDuration? })`, and `maintenance.leave(reason)` when
   * the reason clears. Reasons are for administrators only; visitors get
   * `maintenance.visitorView(configManager)`. Replaces `blockConfiguration`
   * (#1152), still recorded rather than thrown so `initialize()` finishes and
   * `/admin`, `/login` and `/logout` stay reachable.
   */
  readonly maintenance: MaintenanceState;

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
