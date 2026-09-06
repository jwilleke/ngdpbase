import Engine from './core/Engine.js';
import logger, { reconfigureLogger, setLoggingProvider, resolveLoggingProvider } from './utils/logger.js';
import { refreshRedactedSecrets } from './utils/redactSecrets.js';
import type { WikiConfig } from './types/Config.js';

// Managers
import ConfigurationManager from './managers/ConfigurationManager.js';
import NotificationManager from './managers/NotificationManager.js';
import PageManager from './managers/PageManager.js';
import PluginManager from './managers/PluginManager.js';
import RenderingManager from './managers/RenderingManager.js';
import SearchManager from './managers/SearchManager.js';
import UserManager from './managers/UserManager.js';
import ACLManager from './managers/ACLManager.js';
import SchemaManager from './managers/SchemaManager.js';
import VariableManager from './managers/VariableManager.js';
import ValidationManager from './managers/ValidationManager.js';
import PolicyManager from './managers/PolicyManager.js';
import PolicyValidator from './managers/PolicyValidator.js';
import PolicyEvaluator from './managers/PolicyEvaluator.js';
import ExportManager from './managers/ExportManager.js';
import TemplateManager from './managers/TemplateManager.js';
import AttachmentManager from './managers/AttachmentManager.js';
import MediaManager from './managers/MediaManager.js';
import AssetManager from './managers/AssetManager.js';
import AssetService from './managers/AssetService.js';
import BackupManager from './managers/BackupManager.js';
import CacheManager from './managers/CacheManager.js';
import AuditManager from './managers/AuditManager.js';
import AddonsManager from './managers/AddonsManager.js';
import ImportManager from './managers/ImportManager.js';
import AuthManager from './managers/AuthManager.js';
import AgentTokenManager from './managers/AgentTokenManager.js';
import EmailManager from './managers/EmailManager.js';
import MetricsManager from './managers/MetricsManager.js';
import SessionStatsManager from './managers/SessionStatsManager.js';
import BackgroundJobManager from './managers/BackgroundJobManager.js';
import CatalogManager from './managers/CatalogManager.js';
import CommentManager from './managers/CommentManager.js';
import FootnoteManager from './managers/FootnoteManager.js';
import ShareManager from './managers/ShareManager.js';
import OrganizationManager from './managers/OrganizationManager.js';
import PersonManager from './managers/PersonManager.js';
import RoleManager from './managers/RoleManager.js';

// Parsers
import MarkupParser from './parsers/MarkupParser.js';
import FilterManager from './managers/FilterManager.js';

/**
 * WikiEngine - The core orchestrator for the wiki application
 *
 * Follows JSPWiki's architecture patterns by coordinating all managers
 * and providing a central access point for wiki functionality. This is the
 * main entry point for the application and initializes all 24+ managers
 * in the correct dependency order.
 *
 * @class WikiEngine
 * @extends Engine
 * @implements IWikiEngine
 *
 * @property {WikiConfig|null} config - Configuration object (inherited from Engine)
 * @property {number} startTime - Timestamp when the engine was started
 *
 * The engine holds no request state. A WikiContext is per-request and is passed
 * into manager calls; see {@link ApiContext.from} for the per-request shape.
 *
 * @see {@link Engine} for base functionality
 */
class WikiEngine extends Engine {
  /** Timestamp when the engine was started */
  public readonly startTime: number;

  /**
   * Creates a new WikiEngine instance
   *
   * @constructor
   * @param {WikiConfig} [config={}] - Initial configuration object (not used in constructor)
   */
  constructor(config: WikiConfig = {} as WikiConfig) {
    super();
    this.config = config;
    this.startTime = Date.now(); // Track when the engine was started
  }

  /**
   * Initialize the wiki engine with configuration
   *
   * This method initializes all 24+ managers in the correct dependency order:
   * 1. ConfigurationManager - Core configuration (no dependencies)
   * 2. CacheManager - Caching support (used by many managers)
   * 3. UserManager - User authentication/authorization (critical for security)
   * 4. NotificationManager - Notification system
   * 5. PageManager - Page storage and retrieval
   * 6. TemplateManager - Template rendering
   * 7. PolicyManager/PolicyValidator/PolicyEvaluator - Policy system
   * 8. ACLManager - Access control (depends on PolicyEvaluator)
   * 9. PluginManager - Plugin system
   * 10. MarkupParser - Markup parsing
   * 11. RenderingManager - Content rendering (depends on MarkupParser)
   * 12. SearchManager - Full-text search
   * 13. ValidationManager - Schema validation
   * 14. VariableManager - Variable expansion
   * 15. SchemaManager - Schema management
   * 16. ExportManager - Page export
   * 17. AttachmentManager - File attachments
   * 18. AuditManager - Audit logging
   * 19. BackupManager - Backup/restore (must be last)
   *
   * @async
   * @param {WikiConfig} [config={}] - Configuration object (passed to ConfigurationManager)
   * @returns {Promise<WikiEngine>} The initialized engine instance
   * @throws {Error} If any manager fails to initialize
   *
   * @example
   * const engine = new WikiEngine();
   * await engine.initialize();
   * console.log('Engine ready with', engine.getRegisteredManagers().length, 'managers');
   */
  async initialize(config: WikiConfig = {} as WikiConfig): Promise<void> {
    // NOTE: All configuration access MUST use ConfigurationManager.getProperty()
    // The config parameter is passed to ConfigurationManager for any runtime overrides

    // 1. Initialize core managers with no dependencies
    const configManager = new ConfigurationManager(this);
    this.registerManager('ConfigurationManager', configManager);
    await configManager.initialize(config);

    // Reconfigure logger with settings from ConfigurationManager
    // Logger starts with defaults, then reconfigures here after config is available.
    // #169: select the logging provider before rebuilding transports.
    setLoggingProvider(resolveLoggingProvider(
      configManager.getProperty('ngdpbase.logging.provider', 'fileloggingprovider') as string
    ));
    reconfigureLogger({
      level: configManager.getProperty('ngdpbase.logging.level', 'info') as string,
      dir: configManager.getResolvedDataPath('ngdpbase.logging.dir', './data/logs'),
      maxSize: configManager.getProperty('ngdpbase.logging.max-size', '1MB') as string,
      maxFiles: configManager.getProperty('ngdpbase.logging.max-files', 5) as number
    });
    logger.info('Logger reconfigured from ConfigurationManager');

    // #1030: fill the log-redaction table now that config is resolved. The
    // logger bootstraps before ConfigurationManager exists, so it cannot read
    // `ngdpbase.config.secret-keys` itself — the values are pushed in here
    // instead. Until this line runs nothing is redacted, which is safe because
    // nothing has read a config secret yet.
    //
    // Skipped keys are reported rather than swallowed: a secret silently not
    // being redacted is exactly the state this feature exists to prevent, and
    // `too-short` in particular is really a warning about a weak value.
    const redaction = refreshRedactedSecrets(configManager);
    logger.info(`🔐 Log redaction active for ${redaction.active} configured secret(s)`);
    for (const { key, reason } of redaction.skipped) {
      if (reason === 'unset' || reason === 'env-ref') continue; // ordinary, not worth a line
      logger.warn(`[redact] ${key} will NOT be redacted from logs (${reason})`);
    }

    // 1b. Initialize CatalogManager right after ConfigurationManager so all later
    //     managers (including addons) can call getManager('CatalogManager')
    const catalogManager = new CatalogManager(this);
    this.registerManager('CatalogManager', catalogManager);
    await catalogManager.initialize();

    // 2. Initialize CacheManager early so other managers can use caching
    const cacheManager = new CacheManager(this);
    this.registerManager('CacheManager', cacheManager);
    await cacheManager.initialize();

    // 2b. Initialize MetricsManager early so other managers can record metrics
    const metricsManager = new MetricsManager(this);
    this.registerManager('MetricsManager', metricsManager);
    await metricsManager.initialize();
    this.setCapability('metrics', metricsManager.isEnabled());

    // 2b'. SessionStatsManager — in-process session counts for the routes and
    // SessionsPlugin; app.ts attaches the express-session store (#1246).
    const sessionStatsManager = new SessionStatsManager(this);
    this.registerManager('SessionStatsManager', sessionStatsManager);
    await sessionStatsManager.initialize();

    // 2c. OrganizationManager + PersonManager — canonical core identity
    // records (#617). Loaded before UserManager so downstream managers can
    // resolve the install's anchor org / paired Person from the start.
    const organizationManager = new OrganizationManager(this);
    this.registerManager('OrganizationManager', organizationManager);
    await organizationManager.initialize();

    const personManager = new PersonManager(this);
    this.registerManager('PersonManager', personManager);
    await personManager.initialize();

    const roleManager = new RoleManager(this);
    this.registerManager('RoleManager', roleManager);
    await roleManager.initialize();

    // 3. Initialize UserManager early as it's critical for security and context
    const userManager = new UserManager(this);
    this.registerManager('UserManager', userManager);
    await userManager.initialize();

    // 3a. EmailManager — only register when mail is enabled; magic-link depends on it
    if (configManager.getProperty('ngdpbase.mail.enabled', false)) {
      const emailManager = new EmailManager(this);
      this.registerManager('EmailManager', emailManager);
      await emailManager.initialize();
    }

    // #946: must precede AuthManager — AgentTokenAuthProvider resolves this
    // manager from the engine when it registers.
    const agentTokenManager = new AgentTokenManager(this);
    this.registerManager('AgentTokenManager', agentTokenManager);
    await agentTokenManager.initialize();

    const authManager = new AuthManager(this);
    this.registerManager('AuthManager', authManager);
    await authManager.initialize();

    // 4. Initialize other managers that may depend on the above
    const notificationManager = new NotificationManager(this);
    this.registerManager('NotificationManager', notificationManager);
    await notificationManager.initialize();

    const backgroundJobManager = new BackgroundJobManager(this);
    this.registerManager('BackgroundJobManager', backgroundJobManager);
    await backgroundJobManager.initialize();

    const pageManager = new PageManager(this);
    this.registerManager('PageManager', pageManager);
    await pageManager.initialize();

    const templateManager = new TemplateManager(this);
    this.registerManager('TemplateManager', templateManager);
    await templateManager.initialize();

    // Initialize PolicyManager and PolicyEvaluator BEFORE ACLManager
    // because ACLManager depends on PolicyEvaluator
    const policyManager = new PolicyManager(this);
    this.registerManager('PolicyManager', policyManager);
    await policyManager.initialize();

    const policyValidator = new PolicyValidator(this);
    this.registerManager('PolicyValidator', policyValidator);
    await policyValidator.initialize();

    const policyEvaluator = new PolicyEvaluator(this);
    this.registerManager('PolicyEvaluator', policyEvaluator);
    await policyEvaluator.initialize();

    const aclManager = new ACLManager(this);
    this.registerManager('ACLManager', aclManager);
    await aclManager.initialize();

    const pluginManager = new PluginManager(this);
    this.registerManager('PluginManager', pluginManager);
    await pluginManager.initialize();

    // Create AddonsManager after PluginManager so it is available via getManager(),
    // but do NOT initialize it here — initialization registers Express routes and must
    // happen after session/userContext middleware are set up in app.ts.
    // Call engine.initializeAddons() from app.ts after session middleware.
    const addonsManager = new AddonsManager(this);
    this.registerManager('AddonsManager', addonsManager);

    // FilterManager owns the content-filter chain (#1117); MarkupParser and
    // ValidationManager both read it from here, so it initializes first.
    const filterManager = new FilterManager(this);
    this.registerManager('FilterManager', filterManager);
    await filterManager.initialize();

    // Initialize MarkupParser before RenderingManager (RenderingManager depends on it)
    const markupParser = new MarkupParser(this);
    this.registerManager('MarkupParser', markupParser);
    await markupParser.initialize();

    const renderingManager = new RenderingManager(this);
    this.registerManager('RenderingManager', renderingManager);
    await renderingManager.initialize();

    const searchManager = new SearchManager(this);
    this.registerManager('SearchManager', searchManager);
    await searchManager.initialize();

    const validationManager = new ValidationManager(this);
    this.registerManager('ValidationManager', validationManager);
    await validationManager.initialize();

    // Add VariableManager to the initialization sequence
    const variableManager = new VariableManager(this);
    this.registerManager('VariableManager', variableManager);
    await variableManager.initialize();

    const schemaManager = new SchemaManager(this);
    this.registerManager('SchemaManager', schemaManager);
    await schemaManager.initialize();

    // Add the missing ExportManager to the initialization sequence
    const exportManager = new ExportManager(this);
    this.registerManager('ExportManager', exportManager);
    await exportManager.initialize();

    // Add ImportManager for importing content from external wiki formats
    const importManager = new ImportManager(this);
    this.registerManager('ImportManager', importManager);
    await importManager.initialize();

    // Add AttachmentManager to the initialization sequence
    const attachmentManager = new AttachmentManager(this);
    this.registerManager('AttachmentManager', attachmentManager);
    await attachmentManager.initialize();

    // Conditionally register MediaManager when ngdpbase.media.enabled is true
    const mediaEnabled = configManager.getProperty('ngdpbase.media.enabled', false) as boolean;
    this.setCapability('media', mediaEnabled);
    if (mediaEnabled) {
      const mediaManager = new MediaManager(this);
      this.registerManager('MediaManager', mediaManager);
      await mediaManager.initialize();
    }

    // AssetManager — provider registry; must come after AttachmentManager/MediaManager
    const assetManager = new AssetManager(this);
    this.registerManager('AssetManager', assetManager);
    await assetManager.initialize();

    // AssetService — backward-compatible search facade over AssetManager
    const assetService = new AssetService(this);
    this.registerManager('AssetService', assetService);
    await assetService.initialize();

    // Add AuditManager for audit trail logging
    const auditManager = new AuditManager(this);
    this.registerManager('AuditManager', auditManager);
    await auditManager.initialize();

    // Add CommentManager for page comments
    const commentManager = new CommentManager(this);
    this.registerManager('CommentManager', commentManager);
    await commentManager.initialize();

    // Add FootnoteManager for page footnote sidecar storage
    const footnoteManager = new FootnoteManager(this);
    this.registerManager('FootnoteManager', footnoteManager);
    await footnoteManager.initialize();

    // Add ShareManager for share-link capability tokens (#842)
    const shareManager = new ShareManager(this);
    this.registerManager('ShareManager', shareManager);
    await shareManager.initialize();

    // Add BackupManager to the initialization sequence (must be last)
    const backupManager = new BackupManager(this);
    this.registerManager('BackupManager', backupManager);
    await backupManager.initialize();

    // Mark engine as initialized (required for Engine base class contract)
    this.initialized = true;

    // Record engine initialization duration
    metricsManager.recordEngineInit(Date.now() - this.startTime);

    logger.info('All managers initialized');
  }

  /**
   * Initialize the AddonsManager — must be called from app.ts AFTER session and
   * userContext middleware have been registered on the Express app, so that addon
   * route handlers can read req.session and req.userContext normally.
   */
  async initializeAddons(): Promise<void> {
    const addonsManager = this.getManager<AddonsManager>('AddonsManager');
    if (!addonsManager) {
      logger.warn('[WikiEngine] initializeAddons: AddonsManager not registered');
      return;
    }
    await addonsManager.initialize();
    logger.info('[WikiEngine] Addons initialized');
  }

  /**
   * Create a new WikiEngine with default configuration
   *
   * Factory method for creating and initializing a WikiEngine in one step.
   *
   * @static
   * @async
   * @param {WikiConfig} [overrides={}] - Configuration overrides to apply
   * @returns {Promise<WikiEngine>} Fully initialized WikiEngine instance
   *
   * @example
   * const engine = await WikiEngine.createDefault({
   *   applicationName: 'MyWiki',
   *   port: 3000
   * });
   */
  static async createDefault(overrides: WikiConfig = {} as WikiConfig): Promise<WikiEngine> {
    const engine = new WikiEngine();
    await engine.initialize(overrides);
    return engine;
  }

  /**
   * Get application name from configuration
   *
   * Uses ConfigurationManager to retrieve the application name.
   *
   * @returns {string} Application name (defaults to 'ngdpbase')
   *
   * @example
   * const name = engine.getApplicationName(); // 'ngdpbase'
   */
  getApplicationName(): string {
    try {
      const configManager = this.getManager<ConfigurationManager>('ConfigurationManager');
      if (configManager) {
        const name = configManager.getProperty('ngdpbase.application-name', 'ngdpbase') as string;
        return name || 'ngdpbase';
      }
      return 'ngdpbase';
    } catch {
      // ConfigurationManager not yet initialized
      return 'ngdpbase';
    }
  }

  /**
   * Get configuration instance
   *
   * @deprecated Use engine.getManager('ConfigurationManager').getProperty() instead
   * @throws {Error} Always throws - use ConfigurationManager instead
   *
   * @example
   * // OLD (deprecated):
   * // const config = engine.getConfig();
   * // const value = config.get('key');
   *
   * // NEW (use this instead):
   * const configManager = engine.getManager('ConfigurationManager');
   * const value = configManager.getProperty('ngdpbase.key', 'default');
   */
  getConfig(): never {
    throw new Error(
      'getConfig() is deprecated. Use engine.getManager("ConfigurationManager").getProperty() instead. ' +
        'See Issue #176 for migration guide.'
    );
  }

  /**
   * Convenience method to get PageManager
   *
   * @returns {PageManager | undefined} PageManager instance or undefined if not initialized
   *
   * @example
   * const page = await engine.getPageManager()?.getPage('Main');
   */
  getPageManager(): PageManager | undefined {
    return this.getManager<PageManager>('PageManager');
  }

  /**
   * Convenience method to get PluginManager
   *
   * @returns {PluginManager | undefined} PluginManager instance or undefined if not initialized
   *
   * @example
   * const plugins = engine.getPluginManager()?.getAllPlugins();
   */
  getPluginManager(): PluginManager | undefined {
    return this.getManager<PluginManager>('PluginManager');
  }
}

export default WikiEngine;

