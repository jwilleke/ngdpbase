import type { WikiConfig } from '../types/Config.js';
import type BaseManager from '../managers/BaseManager.js';
import { MaintenanceState } from '../utils/maintenanceState.js';

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
 * @property {boolean} initialized - Flag indicating if engine has been initialized
 * @property {WikiConfig} config - Configuration object passed during initialization
 */
class Engine {
  /** Map of registered manager instances */
  protected managers: Map<string, BaseManager>;


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
   * Check if engine has been initialized
   *
   * @returns {boolean} True if engine is initialized and configured
   */
  isConfigured(): boolean {
    return this.initialized;
  }

  /**
   * The application's name. The base engine has no configuration of its own:
   * WikiEngine overrides this to read `ngdpbase.application-name` from
   * ConfigurationManager, the one configuration reader (#1191).
   *
   * @returns {string} 'ngdpbase'
   */
  getApplicationName(): string {
    return 'ngdpbase';
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
   * Whether the site is in maintenance mode, and why (#1906): the one door a
   * manager calls to close the site (`enter(reason, { message? })`) or reopen
   * it (`leave(reason)`). Created here, before any manager initialises, because
   * the boot paths enter it while initialisation is still running.
   *
   * It replaces `blockConfiguration` (#1152): a value an administrator can
   * repair, or a failure the site cannot serve through, is still recorded
   * rather than thrown, so `initialize()` finishes and the instance serves
   * `/admin`, `/login` and `/logout` with a route to the fix. A failure of the
   * machinery needed to SERVE that UI is fatal and still throws — see D10 of
   * docs/security-posture.md.
   */
  readonly maintenance = new MaintenanceState();

  /**
   * Every manager that is not `ready`, with its reason (#1155).
   *
   * Thirteen managers could end up degraded and exactly one reported it
   * anywhere a person could see. This is the collection point that makes the
   * other twelve reachable — by the admin dashboard, by the effective-posture
   * report (#1146), and by anything else that needs to know what the instance
   * is actually doing rather than what it was configured to do.
   */
  getDegradedManagers(): Array<{ manager: string } & import('../managers/BaseManager.js').ManagerStatus> {
    const out: Array<{ manager: string } & import('../managers/BaseManager.js').ManagerStatus> = [];
    for (const [name, manager] of this.managers) {
      const withStatus = manager as unknown as {
        getManagerStatus?: () => import('../managers/BaseManager.js').ManagerStatus;
      };
      const status = withStatus.getManagerStatus?.();
      // `disabled` is deliberate and is not a problem — including it would make
      // the report warn about features somebody switched off, and a report like
      // that is one nobody reads.
      if (status && (status.state === 'degraded' || status.state === 'failed')) {
        out.push({ manager: name, ...status });
      }
    }
    return out;
  }

  async shutdown(): Promise<void> {
    // Cleanup managers in reverse registration order: a manager registered later
    // may depend on one registered earlier (AddonsManager's add-ons on
    // DatabaseManager's connections), so it must stop first
    // (ngdp-accounting-addons#13).
    for (const manager of [...this.managers.values()].reverse()) {
      if (manager.shutdown) {
        await manager.shutdown();
      }
    }
    this.initialized = false;
  }
}

export default Engine;

