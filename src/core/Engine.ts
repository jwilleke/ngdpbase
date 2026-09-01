import type { WikiConfig } from '../types/Config.js';
import type BaseManager from '../managers/BaseManager.js';

/**
 * Engine interface - Main wiki engine following JSPWiki architecture
 *
 * Provides Wiki services to the application. There's basically only a single Engine
 * for each web application instance. This is the base class that WikiEngine extends.
 *
 * @class Engine
 * @abstract
 *
 * @property {Map<string, BaseManager>} managers - Map of registered manager instances keyed by name
 * @property {Map<string, unknown>} properties - Map of configuration properties
 * @property {boolean} initialized - Flag indicating if engine has been initialized
 * @property {WikiConfig} config - Configuration object passed during initialization
 */
class Engine {
  /** Map of registered manager instances */
  protected managers: Map<string, BaseManager>;

  /** Map of configuration properties */
  protected properties: Map<string, unknown>;

  /** Flag indicating if engine has been initialized */
  protected initialized: boolean;

  /** Configuration object */
  public config?: WikiConfig;

  /**
   * Optional-capability registry.
   * Records which optional features (e.g. 'media', 'audit') are enabled.
   * Set via setCapability() during initialization; read by admin UIs and templates.
   */
  protected capabilities: Map<string, boolean>;

  /**
   * Creates a new Engine instance
   *
   * @constructor
   */
  constructor() {
    this.managers = new Map();
    this.properties = new Map();
    this.initialized = false;
    this.capabilities = new Map();
  }

  /**
   * Initialize the engine with configuration
   *
   * @async
   * @param {WikiConfig} config - Configuration object containing engine settings
   * @returns {Promise<void>}
   * @throws {Error} If engine is already initialized
   */
  async initialize(config: WikiConfig = {} as WikiConfig): Promise<void> {
    if (this.initialized) {
      throw new Error('Engine already initialized');
    }

    // Store configuration - DON'T overwrite this.config if it's already set
    if (!this.config) {
      this.config = config;
    }
    this.properties = new Map(Object.entries(config));

    // Initialize managers in order
    await this.initializeManagers();

    this.initialized = true;
  }

  /**
   * Initialize all managers
   *
   * To be implemented by subclasses.
   * Subclasses can make this async if needed.
   *
   * @protected
   * @returns {Promise<void>}
   */
  protected initializeManagers(): Promise<void> {
    // To be implemented - managers will be registered here
    // Subclasses override this method
    return Promise.resolve();
  }

  /**
   * Get a manager instance by class/name
   *
   * @param {string} managerName - Name of the manager to retrieve
   * @returns {T|undefined} Manager instance or undefined if not found
   *
   * @example
   * // Type-safe usage with explicit type parameter:
   * const pageManager = engine.getManager<PageManager>('PageManager');
   * const configManager = engine.getManager<ConfigurationManager>('ConfigurationManager');
   */
  getManager<T = BaseManager>(managerName: string): T | undefined {
    return this.managers.get(managerName) as T | undefined;
  }

  /**
   * Register a manager with the engine
   *
   * @param {string} name - Unique name for the manager
   * @param {BaseManager} manager - Manager instance to register
   * @returns {void}
   *
   * @example
   * engine.registerManager('PageManager', new PageManager(engine));
   */
  registerManager(name: string, manager: BaseManager): void {
    this.managers.set(name, manager);
  }

  /**
   * Get all registered manager names
   *
   * @returns {string[]} Array of registered manager names
   *
   * @example
   * const managers = engine.getRegisteredManagers();
   * // ['ConfigurationManager', 'PageManager', 'UserManager', ...]
   */
  getRegisteredManagers(): string[] {
    return Array.from(this.managers.keys());
  }

  /**
   * Get configuration property value
   *
   * @param {string} key - Configuration property key
   * @param {T} [defaultValue=null] - Default value if property not found
   * @returns {T} Property value or default value
   *
   * @example
   * const appName = engine.getProperty('applicationName', 'MyWiki');
   */
  getProperty<T = unknown>(key: string, defaultValue: T | null = null): T | null {
    const value = this.properties.get(key);
    return (value !== undefined ? value : defaultValue) as T | null;
  }

  /**
   * Get all configuration properties
   *
   * @returns {Map<string, unknown>} Map of all configuration properties
   */
  getProperties(): Map<string, unknown> {
    return this.properties;
  }

  /**
   * Check if engine has been initialized
   *
   * @returns {boolean} True if engine is initialized and configured
   */
  isConfigured(): boolean {
    return this.initialized;
  }

  /**
   * Get application name from configuration
   *
   * @returns {string} Application name (defaults to 'ngdpbase')
   */
  getApplicationName(): string {
    return this.getProperty<string>('applicationName', 'ngdpbase') || 'ngdpbase';
  }

  /**
   * Get working directory path from configuration
   *
   * @returns {string} Working directory path (defaults to './')
   */
  getWorkDir(): string {
    return this.getProperty<string>('workDir', './') || './';
  }

  /**
   * Get configuration object
   *
   * @returns {WikiConfig} Configuration object
   */
  getConfig(): WikiConfig {
    return this.config || {} as WikiConfig;
  }

  /**
   * Record whether an optional capability is active.
   * Call this during initialization for every feature that can be enabled or disabled.
   *
   * @param id - Short identifier used in admin UIs and templates (e.g. 'media', 'audit')
   * @param enabled - Whether the capability is active in this instance
   *
   * @example
   * this.setCapability('media', mediaEnabled);
   */
  setCapability(id: string, enabled: boolean): void {
    this.capabilities.set(id, enabled);
  }

  /**
   * Return a plain-object snapshot of all registered optional capabilities.
   * Consumed by getCommonTemplateData() so every EJS template receives it.
   *
   * @returns Record mapping capability ID → boolean
   *
   * @example
   * const caps = engine.getCapabilities();
   * // { media: false, audit: true }
   */
  getCapabilities(): Record<string, boolean> {
    return Object.fromEntries(this.capabilities);
  }

  /**
   * Shutdown the engine and cleanup all managers
   *
   * @async
   * @returns {Promise<void>}
   */
  /**
   * Configuration values that could not be used (#1152).
   *
   * Recorded rather than thrown, and that distinction is the whole mechanism.
   * A manager that throws aborts `initialize()` partway, so the routes and
   * admin screens are never registered — and the operator is left with a dead
   * process and a repair path that requires filesystem access. A manager that
   * RECORDS lets initialisation finish, after which `app.ts` puts the instance
   * into maintenance mode with `/admin` and `/login` reachable.
   *
   * Only for values an administrator can repair through the admin UI. A
   * failure of the machinery needed to SERVE that UI is fatal and still
   * throws — see D10 of docs/security-posture.md.
   */
  private blockingConditions: string[] = [];

  /** Record a configuration value that cannot be used (#1152). */
  blockConfiguration(reason: string): void {
    this.blockingConditions.push(reason);
  }

  /** Configuration values that could not be used, in the order found. */
  getBlockingConditions(): readonly string[] {
    return [...this.blockingConditions];
  }

  async shutdown(): Promise<void> {
    // Cleanup managers
    for (const [, manager] of this.managers) {
      if (manager.shutdown) {
        await manager.shutdown();
      }
    }
    this.initialized = false;
  }
}

export default Engine;

