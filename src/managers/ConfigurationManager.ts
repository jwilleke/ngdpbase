import fs from 'fs-extra';
import path from 'path';
import { WikiConfig } from '../types/Config.js';
import logger from '../utils/logger.js';
import BaseManager, { BackupData } from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';

interface ConfigManagerBackupData extends BackupData {
  customConfig: Partial<WikiConfig> | null;
  environment?: string;
  defaultConfig?: Partial<WikiConfig> | null;
  mergedConfig?: Partial<WikiConfig> | null;
  paths?: { defaultConfigPath: string; customConfigPath: string };
  statistics?: { defaultPropertiesCount: number; customPropertiesCount: number; mergedPropertiesCount: number };
}

/**
 * ConfigurationManager - Handles JSPWiki-compatible configuration management
 *
 * Implements a two-tier configuration system that merges default settings with
 * instance-specific overrides. This allows for flexible deployment configurations
 * while maintaining sensible defaults.
 *
 * Configuration merge order (later overrides earlier):
 * 1. config/app-default-config.json (base defaults - required, read-only)
 * 2. INSTANCE_DATA_FOLDER/config/app-custom-config.json (instance overrides - optional)
 *
 * INSTANCE_DATA_FOLDER defaults to './data' but can be set via environment variable
 * for Docker/Kubernetes deployments (typically '/app/data').
 *
 * @class ConfigurationManager
 *
 * @property {WikiEngine} engine - Reference to the wiki engine
 * @property {WikiConfig|null} defaultConfig - Default configuration (required)
 * @property {Partial<WikiConfig>|null} customConfig - Custom local overrides (optional)
 * @property {WikiConfig|null} mergedConfig - Final merged configuration
 * @property {string} environment - Current environment (from NODE_ENV)
 * @property {string} defaultConfigPath - Path to default config file
 * @property {string} customConfigPath - Path to custom config file
 *
 * @see {@link BaseManager} for base functionality
 *
 * @example
 * const configManager = engine.getManager('ConfigurationManager');
 * const appName = configManager.getApplicationName();
 * const port = configManager.getServerPort();
 */
class ConfigurationManager extends BaseManager {
  private defaultConfig: WikiConfig | null;
  private customConfig: Partial<WikiConfig> | null;
  private mergedConfig: WikiConfig | null;
  private environment: string;
  private defaultConfigPath: string;
  private customConfigPath: string;
  private instanceDataFolder: string;

  /**
   * Creates a new ConfigurationManager instance
   *
   * @constructor
   * @param {any} engine - The wiki engine instance
   */

  constructor(engine: WikiEngine) {
    super(engine);
    this.defaultConfig = null;
    this.customConfig = null;
    this.mergedConfig = null;
    this.environment = process.env.NODE_ENV || 'development';

    // Fast-storage data folder: operational data (sessions, logs, users, search-index, config).
    // FAST_STORAGE is preferred; falls back to legacy INSTANCE_DATA_FOLDER, then './data'.
    this.instanceDataFolder = process.env.FAST_STORAGE || process.env.INSTANCE_DATA_FOLDER || './data';

    // Default config stays in ./config/ (code/repo - base defaults, read-only)
    const codeConfigDir = path.join(process.cwd(), 'config');
    this.defaultConfigPath = path.join(codeConfigDir, 'app-default-config.json');

    // Custom config in INSTANCE_DATA_FOLDER/config/ (instance-specific overrides)
    // Config file name can be overridden via INSTANCE_CONFIG_FILE env var
    const instanceConfigDir = path.join(this.getInstanceDataFolder(), 'config');
    const configFileName = process.env.INSTANCE_CONFIG_FILE || 'app-custom-config.json';
    this.customConfigPath = path.join(instanceConfigDir, configFileName);
  }

  /**
   * Initialize the configuration manager
   *
   * Loads and merges all configuration files in the correct priority order.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If default configuration file is not found
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);
    try {
      await this.loadConfigurations();
      await this.assertBaseUrlConfigured();
      logger.info(`ConfigurationManager initialized for environment: ${this.environment}`);
      logger.info(`Loaded configs: default + ${this.customConfig && Object.keys(this.customConfig).length > 0 ? 'custom' : 'no custom'}`);
    } catch (error) {
      logger.error('Failed to initialize ConfigurationManager:', error);
      throw error;
    }
  }

  /**
   * #642: post-install startup invariant. Once `.install-complete` exists,
   * the operator must have explicitly configured `ngdpbase.application.base-url`
   * — either in the custom config, via the `NGDPBASE_BASE_URL` env var, or
   * (for legacy installs) under one of the migrated keys handled in
   * `migrateLegacyBaseUrl()`. Falling back to the default localhost URL
   * silently emits broken absolute URLs (template variables, magic-link
   * emails, org @ids), so we refuse to start instead.
   *
   * Pre-install (`.install-complete` absent), the default is fine — the
   * install flow will set the value before completing.
   */
  private async assertBaseUrlConfigured(): Promise<void> {
    const installCompletePath = path.join(this.getInstanceDataFolder(), '.install-complete');
    const installComplete = await fs.pathExists(installCompletePath);
    if (!installComplete) return;

    const explicitlySetInCustom = !!this.customConfig
      && 'ngdpbase.application.base-url' in this.customConfig;
    const explicitlySetInEnv = !!process.env.NGDPBASE_BASE_URL;
    if (explicitlySetInCustom || explicitlySetInEnv) return;

    throw new Error(
      `[ConfigurationManager] Refusing to start: install is complete (${installCompletePath} exists) ` +
      'but \'ngdpbase.application.base-url\' is not explicitly configured. ' +
      `Set it in ${this.customConfigPath} or export NGDPBASE_BASE_URL. ` +
      'Falling back to the default \'http://localhost:3000\' would silently emit broken ' +
      'absolute URLs (template variables, magic-link emails, organization @ids). (#642)'
    );
  }

  /**
   * Reload configuration from disk
   *
   * @returns {Promise<void>}
   */
  async reload(): Promise<void> {
    await this.loadConfigurations();
    logger.info('ConfigurationManager reloaded');
  }

  /**
   * Load and merge configurations from all sources
   *
   * Loads configurations in priority order and merges them into a single
   * configuration object. Fields starting with '_' are treated as comments
   * and excluded from the final configuration.
   *
   * Priority: default < custom (highest)
   *
   * @async
   * @private
   * @returns {Promise<void>}
   * @throws {Error} If default configuration file cannot be loaded
   */
  private async loadConfigurations(): Promise<void> {
    // 1. Load default configuration (required, read-only in codebase)
    if (await fs.pathExists(this.defaultConfigPath)) {
      this.defaultConfig = (await fs.readJson(this.defaultConfigPath)) as WikiConfig;
    } else {
      throw new Error(`Default configuration file not found: ${this.defaultConfigPath}`);
    }

    // 2. Load custom configuration (optional, for instance-specific overrides)
    // Custom config is in INSTANCE_DATA_FOLDER/config/ (filename from INSTANCE_CONFIG_FILE or default)
    this.customConfig = {};
    if (await fs.pathExists(this.customConfigPath)) {
      const customData = (await fs.readJson(this.customConfigPath)) as Record<string, unknown>;
      // Filter out comment fields starting with _
      for (const [key, value] of Object.entries(customData)) {
        if (!key.startsWith('_')) {
          this.customConfig[key] = value;
        }
      }
      logger.info(`Loaded custom config: ${this.customConfigPath}`);
    }

    // #642: migrate legacy base-url keys into the canonical
    // ngdpbase.application.base-url. Operates on customConfig before the
    // merge so user intent wins over default.
    this.migrateLegacyBaseUrl();

    // Merge configurations with deep-merge for object-type properties
    this.mergedConfig = this.deepMergeConfigs(this.defaultConfig, this.customConfig);

    // Development mode defaults to debug logging unless explicitly overridden
    if (this.environment === 'development' && !this.customConfig?.['ngdpbase.logging.level']) {
      this.mergedConfig['ngdpbase.logging.level'] = 'debug';
    }
  }

  /**
   * #642: One-shot migration shim. If the custom config sets either of the
   * legacy keys `ngdpbase.base-url` or `ngdpbase.baseURL`, copy the value
   * into the canonical `ngdpbase.application.base-url` (unless that key is
   * already set explicitly), then drop the legacy keys. Logs a deprecation
   * warning so operators see they should update their custom config.
   *
   * Precedence when multiple legacy keys are present:
   *   custom application.base-url  >  custom base-url  >  custom baseURL
   */
  private migrateLegacyBaseUrl(): void {
    if (!this.customConfig) return;

    const canonical = 'ngdpbase.application.base-url';
    const legacyKebab = 'ngdpbase.base-url';
    const legacyCamel = 'ngdpbase.baseURL';

    const hasCanonical = canonical in this.customConfig;
    const kebabValue = this.customConfig[legacyKebab];
    const camelValue = this.customConfig[legacyCamel];

    if (!hasCanonical && (kebabValue !== undefined || camelValue !== undefined)) {
      const migratedValue = (kebabValue !== undefined ? kebabValue : camelValue) as string;
      const migratedFrom = kebabValue !== undefined ? legacyKebab : legacyCamel;
      this.customConfig[canonical] = migratedValue;
      logger.warn(
        `[ConfigurationManager] DEPRECATED: '${migratedFrom}' in custom config has been migrated to '${canonical}'. ` +
        `Update ${this.customConfigPath} to use '${canonical}' directly. (#642)`
      );
    } else if (hasCanonical && (kebabValue !== undefined || camelValue !== undefined)) {
      logger.warn(
        `[ConfigurationManager] DEPRECATED: legacy base-url keys present alongside '${canonical}'. ` +
        `Canonical key wins; remove legacy keys from ${this.customConfigPath}. (#642)`
      );
    }

    delete this.customConfig[legacyKebab];
    delete this.customConfig[legacyCamel];
  }

  /**
   * Deep merge configurations, handling object-type properties recursively
   *
   * Merge strategy:
   * - Plain objects: recursively merge properties (custom overrides default)
   * - Arrays with id-based objects: merge by id (custom overrides default with same id)
   * - Other arrays: custom replaces default entirely
   * - Primitives: custom overrides default
   *
   * @private
   * @param {WikiConfig} defaultConfig - Base default configuration
   * @param {Partial<WikiConfig>} customConfig - Custom overrides
   * @returns {WikiConfig} Merged configuration
   */
  private deepMergeConfigs(
    defaultConfig: WikiConfig,
    customConfig: Partial<WikiConfig>
  ): WikiConfig {
    const result = { ...defaultConfig } as WikiConfig;

    for (const key of Object.keys(customConfig)) {
      const customValue = customConfig[key];
      const defaultValue = result[key];

      if (customValue === undefined) {
        // Skip undefined values
        continue;
      } else if (customValue === null) {
        // Explicit null overrides
        result[key] = customValue;
      } else if (Array.isArray(customValue) && Array.isArray(defaultValue)) {
        // Merge arrays intelligently
        result[key] = this.mergeArrays(defaultValue, customValue);
      } else if (
        this.isPlainObject(customValue) &&
        this.isPlainObject(defaultValue)
      ) {
        // Deep merge plain objects
        result[key] = this.deepMergeObjects(
          defaultValue as Record<string, unknown>,
          customValue as Record<string, unknown>
        );
      } else {
        // Primitive or type mismatch: custom overrides
        result[key] = customValue;
      }
    }

    return result;
  }

  /**
   * Check if value is a plain object (not array, not null)
   *
   * @private
   * @param {unknown} value - Value to check
   * @returns {boolean} True if plain object
   */
  private isPlainObject(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    );
  }

  /**
   * Deep merge two plain objects
   *
   * @private
   * @param {Record<string, unknown>} defaultObj - Default object
   * @param {Record<string, unknown>} customObj - Custom object to merge
   * @returns {Record<string, unknown>} Merged object
   */
  private deepMergeObjects(
    defaultObj: Record<string, unknown>,
    customObj: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...defaultObj };

    for (const key of Object.keys(customObj)) {
      const customValue = customObj[key];
      const defaultValue = result[key];

      if (customValue === undefined) {
        continue;
      } else if (customValue === null) {
        result[key] = customValue;
      } else if (Array.isArray(customValue) && Array.isArray(defaultValue)) {
        result[key] = this.mergeArrays(
          defaultValue as unknown[],
          customValue as unknown[]
        );
      } else if (
        this.isPlainObject(customValue) &&
        this.isPlainObject(defaultValue)
      ) {
        result[key] = this.deepMergeObjects(
          defaultValue as Record<string, unknown>,
          customValue as Record<string, unknown>
        );
      } else {
        result[key] = customValue;
      }
    }

    return result;
  }

  /**
   * Merge two arrays intelligently
   *
   * If array items have 'id' fields, merge by id (custom overrides default with same id).
   * Otherwise, custom array replaces default entirely.
   *
   * @private
   * @param {unknown[]} defaultArray - Default array
   * @param {unknown[]} customArray - Custom array to merge
   * @returns {unknown[]} Merged array
   */
  private mergeArrays(defaultArray: unknown[], customArray: unknown[]): unknown[] {
    // Check if arrays contain objects with 'id' field for smart merging
    const defaultHasIds =
      defaultArray.length > 0 &&
      this.isPlainObject(defaultArray[0]) &&
      'id' in (defaultArray[0] as Record<string, unknown>);

    const customHasIds =
      customArray.length > 0 &&
      this.isPlainObject(customArray[0]) &&
      'id' in (customArray[0] as Record<string, unknown>);

    if (defaultHasIds && customHasIds) {
      // Merge by id: custom overrides default with same id, adds new ones
      const merged = new Map<string, unknown>();

      for (const item of defaultArray) {
        const id = (item as Record<string, unknown>).id as string;
        merged.set(id, item);
      }

      for (const item of customArray) {
        const id = (item as Record<string, unknown>).id as string;
        merged.set(id, item);
      }

      return Array.from(merged.values());
    }

    // No id-based merging possible: custom replaces default
    return customArray;
  }

  /**
   * Get a configuration property value
   *
   * Retrieves a property from the merged configuration with optional default value.
   * Checks environment variables first for specific keys (Docker/Traefik support).
   *
   * Priority order:
   * 1. Environment variables (for Docker/Traefik deployments)
   * 2. Merged configuration (from config files)
   * 3. Default value parameter
   *
   * @param {string} key - Configuration property key
   * @param {*} [defaultValue=null] - Default value if property not found
   * @returns {*} Configuration value or default
   *
   * @example
   * const appName = configManager.getProperty('ngdpbase.application-name', 'MyWiki');
   */
  getProperty(key: string, defaultValue: unknown = null): unknown {
    // Check environment variables for Docker/Traefik/K8s deployments
    // Allows dynamic configuration without editing config files
    // Used especially for headless installation mode (HEADLESS_INSTALL=true)
    const envOverrides: { [key: string]: string | undefined } = {
      'ngdpbase.application.base-url': process.env.NGDPBASE_BASE_URL,
      'ngdpbase.hostname': process.env.NGDPBASE_HOSTNAME,
      'ngdpbase.server.host': process.env.NGDPBASE_HOST,
      'ngdpbase.server.port': process.env.NGDPBASE_PORT,
      'ngdpbase.session.secret': process.env.NGDPBASE_SESSION_SECRET,
      'ngdpbase.application-name': process.env.NGDPBASE_APP_NAME
    };

    if (envOverrides[key]) {
      return envOverrides[key];
    }

    const raw = this.mergedConfig?.[key] ?? defaultValue;

    // Expand ${ENV_VAR} placeholders in string config values.
    // Only replaces a placeholder when the env var is actually set — leaves
    // unresolved placeholders intact so missing vars are obvious at runtime.
    if (typeof raw === 'string' && raw.includes('${')) {
      return raw.replace(/\$\{([^}]+)\}/g, (match: string, varName: string) =>
        varName in process.env ? (process.env[varName] as string) : match
      );
    }

    return raw;
  }

  /**
   * Set a configuration property (updates custom config)
   *
   * Sets a property value and persists it to the custom configuration file.
   * This allows runtime configuration changes that survive restarts.
   *
   * @async
   * @param {string} key - Configuration property key
   * @param {*} value - Configuration value to set
   * @returns {Promise<void>}
   *
   * @example
   * await configManager.setProperty('ngdpbase.application-name', 'My Custom Wiki');
   */
  async setProperty(key: string, value: unknown): Promise<void> {
    if (!this.customConfig) {
      this.customConfig = {};
    }

    this.customConfig[key] = value;
    if (this.mergedConfig) {
      this.mergedConfig[key] = value;
    }

    // Save to custom config file
    await this.saveCustomConfiguration();
  }

  /**
   * Apply a runtime-only config value (not persisted to custom config).
   *
   * Used by AddonsManager to inject domainDefaults without polluting
   * the operator's app-custom-config.json. Because this only updates
   * mergedConfig, the value disappears on next restart unless the addon
   * is still loaded and re-injects it.
   *
   * @param key   Configuration property key
   * @param value Value to apply
   */
  setRuntimeProperty(key: string, value: unknown): void {
    if (this.mergedConfig) {
      this.mergedConfig[key] = value;
    }
  }

  /**
   * Save custom configuration to file
   *
   * Persists the current custom configuration to disk with proper formatting.
   *
   * @async
   * @private
   * @returns {Promise<void>}
   */
  private async saveCustomConfiguration(): Promise<void> {
    const configToSave = {
      _comment: 'This file overrides values from app-default-config.json',
      ...this.customConfig
    };

    await fs.writeJson(this.customConfigPath, configToSave, { spaces: 2 });
  }

  /**
   * Get all configuration properties
   *
   * Returns a copy of the entire merged configuration object.
   *
   * @returns {WikiConfig} All merged configuration properties
   *
   * @example
   * const allConfig = configManager.getAllProperties();
   * console.log(JSON.stringify(allConfig, null, 2));
   */
  getAllProperties(): WikiConfig {
    return { ...this.mergedConfig } as WikiConfig;
  }

  /**
   * Get a property value only if it was explicitly set in the custom config
   * (i.e. not inherited from app-default-config.json).
   * Returns null if the key is not present in the custom config.
   *
   * Use this when a theme or other subsystem should own a value by default and
   * the config should only override it when the operator has explicitly said so.
   *
   * @param {string} key - Configuration key
   * @returns {unknown} Custom config value, or null if not explicitly set
   */
  getCustomProperty(key: string): unknown {
    if (!this.customConfig) return null;
    return (this.customConfig as Record<string, unknown>)[key] ?? null;
  }

  /**
   * Get application name
   *
   * @returns {string} Application name (defaults to 'ngdpbase')
   *
   * @example
   * const name = configManager.getApplicationName(); // 'ngdpbase'
   */
  getApplicationName(): string {
    return this.getProperty('ngdpbase.application-name', 'ngdpbase') as string;
  }

  /**
   * Get base URL for the wiki
   *
   * @returns {string} Base URL (defaults to 'http://localhost:3000')
   */
  getBaseURL(): string {
    return this.getProperty('ngdpbase.application.base-url', 'http://localhost:3000') as string;
  }

  /**
   * Get front page name
   *
   * @returns {string} Front page name (defaults to 'Welcome')
   */
  getFrontPage(): string {
    return this.getProperty('ngdpbase.front-page', 'Welcome') as string;
  }

  /**
   * Get encoding
   * @returns {string} Encoding
   */
  getEncoding(): string {
    return this.getProperty('ngdpbase.encoding', 'UTF-8') as string;
  }

  /**
   * Get server port
   * @returns {number} Server port
   */
  getServerPort(): number {
    return parseInt(this.getProperty('ngdpbase.server.port', '3000') as string);
  }

  /**
   * Get the set of recognised fenced code block language tags.
   * Tags not in this set should be flagged as unknown on page save.
   * @returns {Set<string>} Lower-cased tag names
   */
  getFencedCodeTags(): Set<string> {
    const tags = this.getProperty('ngdpbase.markup.fenced-code-tags', []) as string[];
    return new Set(Array.isArray(tags) ? tags.map(t => t.toLowerCase()) : []);
  }

  /**
   * Get server host
   * @returns {string} Server host
   */
  getServerHost(): string {
    return this.getProperty('ngdpbase.server.host', 'localhost') as string;
  }

  /**
   * Get session secret
   * @returns {string} Session secret
   */
  getSessionSecret(): string {
    return this.getProperty('ngdpbase.session.secret', 'ngdpbase-session-secret-change-in-production') as string;
  }

  /**
   * Get session max age in milliseconds
   * @returns {number} Session max age
   */
  getSessionMaxAge(): number {
    return parseInt(this.getProperty('ngdpbase.session.max-age', '86400000') as string);
  }

  /**
   * Get session secure flag
   * @returns {boolean} Session secure flag
   */
  getSessionSecure(): boolean {
    return this.getProperty('ngdpbase.session.secure', 'false') === 'true';
  }

  /**
   * Get session httpOnly flag
   * @returns {boolean} Session httpOnly flag
   */
  getSessionHttpOnly(): boolean {
    return this.getProperty('ngdpbase.session.http-only', 'true') === 'true';
  }

  /**
   * Get directory paths
   * @returns {Object} Directory configuration
   */
  getDirectories(): {
    pages: unknown;
    templates: unknown;
    resources: unknown;
    data: unknown;
    work: unknown;
    } {
    return {
      pages: this.getProperty('ngdpbase.directories.pages'),
      templates: this.getProperty('ngdpbase.directories.templates'),
      resources: this.getProperty('ngdpbase.directories.resources'),
      data: this.getProperty('ngdpbase.directories.data'),
      work: this.getProperty('ngdpbase.directories.work')
    };
  }

  /**
   * Get the instance data folder path
   *
   * Returns the base folder for all instance-specific data (pages, users,
   * attachments, logs, etc.). This can be configured via the INSTANCE_DATA_FOLDER
   * environment variable, allowing instance data to be stored anywhere on the
   * filesystem.
   *
   * @returns {string} Absolute path to the instance data folder
   *
   * @example
   * const dataFolder = configManager.getInstanceDataFolder();
   * // Returns '/var/lib/ngdpbase/data' if INSTANCE_DATA_FOLDER=/var/lib/ngdpbase/data
   * // Returns resolved './data' path if not set
   */
  getInstanceDataFolder(): string {
    return path.resolve(process.cwd(), this.instanceDataFolder);
  }

  /**
   * Resolve a data path relative to the instance data folder
   *
   * Takes a path that may contain './data/' prefix and resolves it relative
   * to the configured INSTANCE_DATA_FOLDER. This allows all data paths in
   * configuration to work correctly regardless of where instance data is stored.
   *
   * @param {string} relativePath - Path to resolve (may include './data/' prefix)
   * @returns {string} Absolute resolved path under instance data folder
   *
   * @example
   * // With INSTANCE_DATA_FOLDER=/var/lib/ngdpbase/data
   * configManager.resolveDataPath('./data/pages');     // '/var/lib/ngdpbase/data/pages'
   * configManager.resolveDataPath('data/users');       // '/var/lib/ngdpbase/data/users'
   * configManager.resolveDataPath('./data/logs/audit.log'); // '/var/lib/ngdpbase/data/logs/audit.log'
   * configManager.resolveDataPath('pages');            // '/var/lib/ngdpbase/data/pages'
   */
  resolveDataPath(relativePath: string): string {
    // Normalize the path by removing ./data/ or data/ prefix
    let normalizedPath = relativePath;

    // Strip leading ./ if present
    if (normalizedPath.startsWith('./')) {
      normalizedPath = normalizedPath.substring(2);
    }

    // Strip leading data/ if present (the base data folder)
    if (normalizedPath.startsWith('data/')) {
      normalizedPath = normalizedPath.substring(5);
    } else if (normalizedPath === 'data') {
      normalizedPath = '';
    }

    // Join with instance data folder and resolve to absolute path
    const instanceFolder = this.getInstanceDataFolder();
    return normalizedPath ? path.join(instanceFolder, normalizedPath) : instanceFolder;
  }

  /**
   * Get a resolved configuration property for data paths
   *
   * Convenience method that gets a configuration property and resolves it
   * if it appears to be a data path (starts with './data' or 'data/').
   *
   * @param {string} key - Configuration property key
   * @param {string} defaultValue - Default value if property not found
   * @returns {string} Resolved path or original value
   *
   * @example
   * const pagesDir = configManager.getResolvedDataPath(
   *   'ngdpbase.page.provider.filesystem.storagedir',
   *   './data/pages'
   * );
   */
  getResolvedDataPath(key: string, defaultValue: string): string {
    const value = this.getProperty(key, defaultValue) as string;

    // If the value still contains an unresolved ${VAR} placeholder (env var not set),
    // extract the path suffix and resolve it under instanceDataFolder to avoid
    // creating literal '${VAR}/...' directories in the cwd.
    if (value && value.includes('${')) {
      const suffix = value.replace(/^\$\{[^}]+\}[/\\]?/, '');
      const base = this.getInstanceDataFolder();
      return suffix ? path.join(base, suffix) : base;
    }

    // Check if this looks like a data path
    if (value && (value.startsWith('./data') || value.startsWith('data/'))) {
      return this.resolveDataPath(value);
    }

    // Return as-is if not a data path (could be absolute or other relative path)
    return value;
  }

  /**
   * Get manager-specific configuration
   *
   * Retrieves all configuration properties for a specific manager,
   * including enabled status and manager-specific settings.
   *
   * @param {string} managerName - Name of the manager
   * @returns {Object} Manager configuration object with enabled flag and settings
   * @returns {boolean} config.enabled - Whether the manager is enabled
   *
   * @example
   * const searchConfig = configManager.getManagerConfig('SearchManager');
   * if (searchConfig.enabled) {
   *   // Use search manager
   * }
   */
  getManagerConfig(managerName: string): { enabled: boolean; [key: string]: unknown } {
    const enabled = this.getProperty(`ngdpbase.managers.${managerName}.enabled`, true) as boolean;
    const config: { enabled: boolean; [key: string]: unknown } = { enabled };

    // Get manager-specific settings
    const allProps = this.mergedConfig || {};
    const keys = Object.keys(allProps).filter((key) => key.startsWith(`ngdpbase.managers.${managerName}.`) && !key.endsWith('.enabled'));

    keys.forEach((key) => {
      const settingName = key.replace(`ngdpbase.managers.${managerName}.`, '');
      config[settingName] = this.getProperty(key);
    });

    return config;
  }

  /**
   * Get feature configuration
   * @param {string} featureName - Name of feature
   * @returns {Object} Feature configuration
   */
  getFeatureConfig(featureName: string): { enabled: boolean; [key: string]: unknown } {
    const enabled = this.getProperty(`ngdpbase.features.${featureName}.enabled`, false) as boolean;
    const config: { enabled: boolean; [key: string]: unknown } = { enabled };

    // Get feature-specific settings
    const allProps = this.mergedConfig || {};
    const keys = Object.keys(allProps).filter((key) => key.startsWith(`ngdpbase.features.${featureName}.`) && !key.endsWith('.enabled'));

    keys.forEach((key) => {
      const settingName = key.replace(`ngdpbase.features.${featureName}.`, '');
      config[settingName] = this.getProperty(key);
    });

    return config;
  }

  /**
   * Get logging configuration
   * @returns {Object} Logging configuration
   */
  getLoggingConfig(): {
    level: unknown;
    dir: unknown;
    maxSize: unknown;
    maxFiles: number;
    } {
    return {
      level: this.getProperty('ngdpbase.logging.level'),
      dir: this.getProperty('ngdpbase.logging.dir'),
      maxSize: this.getProperty('ngdpbase.logging.max-size'),
      maxFiles: parseInt(this.getProperty('ngdpbase.logging.max-files') as string)
    };
  }

  /**
   * Get search configuration
   * @returns {Object} Search configuration
   */
  getSearchConfig(): {
    indexDir: unknown;
    enabled: boolean;
    } {
    return {
      indexDir: this.getProperty('ngdpbase.search.provider.lunr.indexdir'),
      enabled: this.getProperty('ngdpbase.search.enabled') === true
    };
  }

  /**
   * Get access control configuration
   * @returns {Object} Access control configuration
   */
  getAccessControlConfig(): {
    contextAware: {
      enabled: boolean;
      timeZone: unknown;
    };
    businessHours: {
      enabled: boolean;
      start: unknown;
      end: unknown;
      days: unknown;
    };
    } {
    const days = this.getProperty('ngdpbase.access-control.business-hours.days');
    return {
      contextAware: {
        enabled: this.getProperty('ngdpbase.access-control.context-aware.enabled') === true,
        timeZone: this.getProperty('ngdpbase.access-control.context-aware.time-zone')
      },
      businessHours: {
        enabled: this.getProperty('ngdpbase.access-control.business-hours.enabled') === true,
        start: this.getProperty('ngdpbase.access-control.business-hours.start'),
        end: this.getProperty('ngdpbase.access-control.business-hours.end'),
        days: typeof days === 'string' ? days.split(',') : days
      }
    };
  }

  /**
   * Get audit configuration
   * @returns {Object} Audit configuration
   */
  getAuditConfig(): {
    enabled: boolean;
    logDirectory: unknown;
    logFile: unknown;
    retention: {
      maxFiles: number;
      maxAge: unknown;
    };
    includeContext: {
      ip: boolean;
      userAgent: boolean;
      timestamp: boolean;
      decision: boolean;
      reason: boolean;
    };
    } {
    return {
      enabled: this.getProperty('ngdpbase.audit.enabled') === true,
      logDirectory: this.getProperty('ngdpbase.audit.provider.file.logdirectory'),
      logFile: this.getProperty('ngdpbase.audit.provider.file.auditfilename'),
      retention: {
        maxFiles: parseInt(this.getProperty('ngdpbase.audit.provider.file.maxfiles') as string),
        maxAge: this.getProperty('ngdpbase.audit.retentiondays')
      },
      includeContext: {
        ip: this.getProperty('ngdpbase.audit.include-context.ip') === true,
        userAgent: this.getProperty('ngdpbase.audit.include-context.user-agent') === true,
        timestamp: this.getProperty('ngdpbase.audit.include-context.timestamp') === true,
        decision: this.getProperty('ngdpbase.audit.include-context.decision') === true,
        reason: this.getProperty('ngdpbase.audit.include-context.reason') === true
      }
    };
  }

  /**
   * Get RSS settings
   * @returns {Object} RSS configuration
   */
  getRSSConfig(): {
    generate: unknown;
    fileName: unknown;
    interval: unknown;
    channelTitle: unknown;
    channelDescription: unknown;
    } {
    return {
      generate: this.getProperty('ngdpbase.rss.generate', true),
      fileName: this.getProperty('ngdpbase.rss.file-name', 'rss.xml'),
      interval: this.getProperty('ngdpbase.rss.interval', 3600),
      channelTitle: this.getProperty('ngdpbase.rss.channel-title', 'ngdpbase RSS Feed'),
      channelDescription: this.getProperty('ngdpbase.rss.channel-description', 'RSS feed for ngdpbase updates')
    };
  }

  /**
   * Reset configuration to defaults (admin only)
   *
   * Clears all custom configuration and resets to default values.
   * This operation persists the empty custom configuration to disk.
   *
   * @async
   * @returns {Promise<void>}
   *
   * @example
   * await configManager.resetToDefaults();
   * console.log('Configuration reset to defaults');
   */
  async resetToDefaults(): Promise<void> {
    this.customConfig = {};
    this.mergedConfig = { ...this.defaultConfig } as WikiConfig;
    await this.saveCustomConfiguration();
  }

  /**
   * Get custom configuration for admin UI
   *
   * Returns only the custom overrides, useful for displaying
   * which settings have been customized.
   *
   * @returns {Object} Custom configuration properties only
   *
   * @example
   * const customSettings = configManager.getCustomProperties();
   * console.log('Customized settings:', Object.keys(customSettings));
   */
  getCustomProperties(): Partial<WikiConfig> {
    return { ...this.customConfig } as Partial<WikiConfig>;
  }

  /**
   * Get default configuration for comparison
   *
   * Returns the base default configuration, useful for comparison
   * with current settings or resetting individual properties.
   *
   * @returns {WikiConfig} Default configuration properties
   */
  getDefaultProperties(): WikiConfig {
    return { ...this.defaultConfig } as WikiConfig;
  }

  /**
   * Backup configuration data
   *
   * Backs up the custom configuration (user overrides) which can be restored
   * to recreate the user's configuration settings. We don't backup default or
   * environment configs as those are part of the codebase.
   *
   * @returns {Promise<BackupData>} Backup data containing custom configuration
   */
  async backup(): Promise<ConfigManagerBackupData> {
    logger.info('[ConfigurationManager] Starting backup...');

    try {
      // Count total properties in each config layer
      const defaultPropsCount = this.defaultConfig ? Object.keys(this.defaultConfig).length : 0;
      const customPropsCount = this.customConfig ? Object.keys(this.customConfig).length : 0;
      const mergedPropsCount = this.mergedConfig ? Object.keys(this.mergedConfig).length : 0;

      const backupData = {
        managerName: 'ConfigurationManager',
        timestamp: new Date().toISOString(),
        environment: this.environment,

        // Backup all config layers for reference
        defaultConfig: this.defaultConfig ? { ...this.defaultConfig } : null,
        customConfig: this.customConfig ? { ...this.customConfig } : null,
        mergedConfig: this.mergedConfig ? { ...this.mergedConfig } : null,

        // Config file paths for reference
        paths: {
          defaultConfigPath: this.defaultConfigPath,
          customConfigPath: this.customConfigPath
        },

        // Statistics
        statistics: {
          defaultPropertiesCount: defaultPropsCount,
          customPropertiesCount: customPropsCount,
          mergedPropertiesCount: mergedPropsCount
        }
      };

      logger.info(`[ConfigurationManager] Backed up ${customPropsCount} custom properties`);
      logger.info(`[ConfigurationManager] Total merged properties: ${mergedPropsCount}`);

      return backupData;
    } catch (error) {
      logger.error('[ConfigurationManager] Backup failed:', error);
      throw error;
    }
  }

  /**
   * Restore configuration from backup data
   *
   * Restores the custom configuration (user overrides) from backup data.
   * This will overwrite the current custom configuration file and reload
   * all configurations to rebuild the merged config.
   *
   * @param {BackupData} backupData - Backup data from backup() method
   * @returns {Promise<void>}
   */
  async restore(backupData: ConfigManagerBackupData): Promise<void> {
    logger.info('[ConfigurationManager] Starting restore...');

    if (!backupData) {
      throw new Error('ConfigurationManager: No backup data provided for restore');
    }

    try {
      // Ensure instance config directory exists
      const instanceConfigDir = path.join(this.getInstanceDataFolder(), 'config');
      await fs.ensureDir(instanceConfigDir);

      // Restore custom configuration (user overrides)
      if (backupData.customConfig) {
        this.customConfig = { ...backupData.customConfig };

        // Save custom config to disk
        await this.saveCustomConfiguration();

        logger.info(`[ConfigurationManager] Restored ${Object.keys(this.customConfig ?? {}).length} custom properties`);
      } else {
        logger.warn('[ConfigurationManager] No custom config in backup, resetting to empty');
        this.customConfig = {};
        await this.saveCustomConfiguration();
      }

      // Reload all configurations to rebuild merged config
      await this.loadConfigurations();

      logger.info('[ConfigurationManager] Restore completed successfully');
      logger.info(`[ConfigurationManager] Total merged properties: ${this.mergedConfig ? Object.keys(this.mergedConfig).length : 0}`);
    } catch (error) {
      logger.error('[ConfigurationManager] Restore failed:', error);
      throw error;
    }
  }
}

export default ConfigurationManager;

