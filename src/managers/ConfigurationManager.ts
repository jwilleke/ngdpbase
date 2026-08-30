import fs from 'fs-extra';
import path from 'path';
import {
  coerceToTypeOf,
  describePropertySource,
  ENV_KEYS_CONFIG_KEY,
  type EnvKeyMap,
  type PropertyDescription
} from '../utils/configEnvKeys.js';
import { WikiConfig } from '../types/Config.js';
import logger from '../utils/logger.js';
import BaseManager, { BackupData } from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import {
  NPM_ADDON_PREFIX,
  splitAddonsPath,
  findNodeModulesDir,
  matchNpmPackageDirs,
  resolveAddonSlug
} from '../utils/addonsPathResolver.js';

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
      this.assertContactPageNotLoop();
      this.assertContactRecipientWellFormed();
      this.assertConfiguredAddonsExist();
      logger.info(`ConfigurationManager initialized for environment: ${this.environment}`);
      logger.info(`Loaded configs: default + ${this.customConfig && Object.keys(this.customConfig).length > 0 ? 'custom' : 'no custom'}`);
    } catch (error) {
      logger.error('Failed to initialize ConfigurationManager:', error);
      throw error;
    }
  }

  /**
   * #642: returns true if `ngdpbase.application.base-url` was explicitly
   * configured (in customConfig or via the NGDPBASE_BASE_URL env var), as
   * opposed to falling through to the default. Consumers that need to emit
   * absolute URLs to outside parties (magic-link auth, schema.org @ids,
   * email templates) read this to decide whether the configured base URL
   * is trustworthy or whether they should bail out / disable themselves.
   *
   * The migration shim in `migrateLegacyBaseUrl()` writes the canonical key
   * into customConfig before this is called, so legacy `ngdpbase.base-url`
   * and `ngdpbase.baseURL` configs return true here too.
   */
  isBaseUrlExplicit(): boolean {
    const explicitlySetInCustom = !!this.customConfig
      && 'ngdpbase.application.base-url' in this.customConfig;
    const explicitlySetInEnv = !!process.env.NGDPBASE_BASE_URL;
    return explicitlySetInCustom || explicitlySetInEnv;
  }

  /**
   * #642: post-install startup invariant. Once `.install-complete` exists,
   * the operator must have explicitly configured `ngdpbase.application.base-url`.
   * Falling back to the default localhost URL silently emits broken
   * absolute URLs (template variables, magic-link emails, org @ids), so we
   * refuse to start instead.
   *
   * Pre-install (`.install-complete` absent), the default is fine — the
   * install flow will set the value before completing.
   */
  private async assertBaseUrlConfigured(): Promise<void> {
    const installCompletePath = path.join(this.getInstanceDataFolder(), '.install-complete');
    const installComplete = await fs.pathExists(installCompletePath);
    if (!installComplete) return;

    if (this.isBaseUrlExplicit()) return;

    throw new Error(
      `[ConfigurationManager] Refusing to start: install is complete (${installCompletePath} exists) ` +
      'but \'ngdpbase.application.base-url\' is not explicitly configured. ' +
      `Set it in ${this.customConfigPath} or export NGDPBASE_BASE_URL. ` +
      'Falling back to the default \'http://localhost:3000\' would silently emit broken ' +
      'absolute URLs (template variables, magic-link emails, organization @ids). (#642)'
    );
  }

  /**
   * #658: refuse to start if `ngdpbase.application.contact.page` is set to
   * `"contact"` — that would make /contact 302-redirect to /view/contact,
   * which (because /view/contact does not exist) ends as a 404 anyway, but
   * earlier intermediate routing or future renames could turn it into an
   * actual redirect loop. Reject explicitly so operators see a clear error
   * instead of a runtime surprise.
   */
  private assertContactPageNotLoop(): void {
    const raw = this.getProperty('ngdpbase.application.contact.page', '') as string;
    const trimmed = (raw ?? '').trim();
    if (trimmed === 'contact') {
      throw new Error(
        '[ConfigurationManager] Refusing to start: ' +
        '\'ngdpbase.application.contact.page\' is set to "contact" — that would ' +
        'make /contact redirect to itself. Set it to a different page slug, or ' +
        'leave it empty to use the built-in /contact form. (#658)'
      );
    }
  }

  /**
   * #670 Phase D: refuse to start if `ngdpbase.application.contact.recipient`
   * contains a malformed address. The string accepts two patterns:
   *
   *   inline CSV         "alice@example.com, bob@example.com"
   *   distribution list  "admins@example.com"
   *
   * The single-address form is just a degenerate CSV. We split on `,`, trim
   * each segment, regex-check the shape, and throw if any segment fails. The
   * regex is the same pragmatic shape check the form uses post-validation —
   * not RFC-perfect; SMTP verifies the rest on send.
   *
   * Empty config is fine (recipient resolves at request time from the admin
   * list — see UserManager.getContactRecipient). Whitespace-only segments
   * (e.g., trailing comma "a@b, ") are treated as malformed because they
   * usually indicate a typo.
   */
  private assertContactRecipientWellFormed(): void {
    const raw = this.getProperty('ngdpbase.application.contact.recipient', '') as string;
    const trimmed = (raw ?? '').trim();
    if (trimmed === '') return;

    // Same pragmatic shape check as src/routes/WikiRoutes.ts processContact validation.
    const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const segments = trimmed.split(',').map(s => s.trim());
    const malformed = segments.filter(s => s === '' || !emailShape.test(s));

    if (malformed.length > 0) {
      throw new Error(
        '[ConfigurationManager] Refusing to start: ' +
        '\'ngdpbase.application.contact.recipient\' contains malformed address(es): ' +
        malformed.map(s => JSON.stringify(s)).join(', ') + '. ' +
        'Use a single address ("admins@example.com"), an inline CSV ' +
        '("alice@example.com, bob@example.com"), or leave the key empty to ' +
        'auto-resolve to the first admin user with a non-default email. ' +
        '(#670 Phase D)'
      );
    }
  }

  /**
   * #672: refuse to start if any `ngdpbase.addons.<id>.enabled = true` key
   * references an `<id>` that has no matching addon in any configured
   * `addons-path` entry — either a directory (bundled/drop-in) or, per
   * #673/#924, an npm package matched by a `node_modules:<glob>` entry.
   * The discovery logic mirrors what `AddonsManager` does at runtime —
   * directory/package present with `index.js` or `index.ts` — but without
   * importing the modules (boot-time speed; `ConfigurationManager.initialize()`
   * runs before any managers). The directory-vs-npm-pattern split, npm glob
   * matching, AND the canonical-identity resolution are all shared with
   * `AddonsManager` via `utils/addonsPathResolver.ts` so the two can no
   * longer drift out of sync (#924: they had, and packaged addons could
   * never boot as a result).
   *
   * Catches the failure mode that caused the 2026-05-10 geohazardwatch.com
   * outage: the deploy configmap had `ngdpbase.addons.ve-geology.enabled =
   * true` but the on-disk addon was renamed to `geohazardwatch`, so
   * `AddonsManager` silently treated the addon as disabled and registered
   * none of its plugins/managers.
   *
   * #927: identity here is the canonical slug — `package.json`
   * `ngdpbase.slug`, else the folder name minus a conventional trailing
   * `-addon` (`resolvePackagedAddonSlug`). This is the EXACT same import-free
   * resolution `AddonsManager.registerAddonFromDir()` uses as its registry
   * key and `isEnabled` lookup, so this check is now precise rather than a
   * guess: an enabled `<id>` is known iff the runtime would register under
   * that same `<id>`. The only residual imprecision is a module whose
   * exported `name` disagrees with its slug — but since #927 makes the slug
   * (not `name`) the runtime identity too, that disagreement no longer
   * affects either layer's `<id>`; it only earns a load-time warning.
   */
  private assertConfiguredAddonsExist(): void {
    if (!this.mergedConfig) return;

    // 1. Find all enabled-true addon keys.
    const enabledIds: string[] = [];
    for (const [key, value] of Object.entries(this.mergedConfig as Record<string, unknown>)) {
      const m = /^ngdpbase\.addons\.([^.]+)\.enabled$/.exec(key);
      if (m && value === true) enabledIds.push(m[1]);
    }
    if (enabledIds.length === 0) return;

    // 2. Resolve addons-path (string or string[]; default './addons') into
    // filesystem directories vs. `node_modules:<glob>` npm patterns —
    // matching AddonsManager.initialize().
    const raw = this.getProperty('ngdpbase.managers.addons-manager.addons-path', './addons');
    const { directories, npmPatterns } = splitAddonsPath(raw);
    const resolvedPaths = directories.map(p => path.resolve(p));

    // 3. Enumerate addon directories. Directory name + index.{js,ts} must
    // be present, matching AddonsManager.scanAddonsDirectory(). No module
    // loading at this stage.
    const knownAddons = new Set<string>();
    for (const dirPath of resolvedPaths) {
      if (!fs.existsSync(dirPath)) continue;
      let stat;
      try { stat = fs.statSync(dirPath); } catch { continue; }
      if (!stat.isDirectory()) continue;
      let entries;
      try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'shared') continue;
        const addonDir = path.join(dirPath, entry.name);
        const indexJs = path.join(addonDir, 'index.js');
        const indexTs = path.join(addonDir, 'index.ts');
        if (fs.existsSync(indexJs) || fs.existsSync(indexTs)) {
          // #927: resolve identity the same import-free way AddonsManager
          // registers it — package.json ngdpbase.slug, else the folder name
          // verbatim (directory addons are not stripped).
          knownAddons.add(resolveAddonSlug(addonDir, 'directory'));
        }
      }
    }

    // 3b. #673/#924: enumerate npm-packaged addons matching each
    // `node_modules:<glob>` pattern, mirroring AddonsManager.scanNpmAddons().
    // No module import here either (see false-positive note above).
    if (npmPatterns.length > 0) {
      const nmRoot = findNodeModulesDir();
      if (nmRoot) {
        for (const pattern of npmPatterns) {
          for (const pkgDir of matchNpmPackageDirs(nmRoot, pattern)) {
            const indexJs = path.join(pkgDir, 'index.js');
            const indexTs = path.join(pkgDir, 'index.ts');
            if (!fs.existsSync(indexJs) && !fs.existsSync(indexTs)) continue;
            // #927: identity is the statically-declared slug, resolved the
            // exact same import-free way AddonsManager registers it — so this
            // is now an exact match, not the folder-name-derived guess #925
            // had to fall back to.
            knownAddons.add(resolveAddonSlug(pkgDir, 'npm'));
          }
        }
      }
    }

    // 4. Diff. Any enabled id without a matching directory/package is a misconfig.
    const unknown = enabledIds.filter(id => !knownAddons.has(id));
    if (unknown.length === 0) return;

    // 5. Build error with did-you-mean suggestions for likely typos.
    const known = Array.from(knownAddons).sort();
    const suggestions = unknown.map(id => {
      const guess = this.findClosestAddonName(id, known);
      return guess ? `"${id}" (did you mean "${guess}"?)` : `"${id}"`;
    });

    const searchedIn = [...resolvedPaths, ...npmPatterns.map(p => `${NPM_ADDON_PREFIX}${p}`)];
    throw new Error(
      '[ConfigurationManager] Refusing to start: ' +
      `'ngdpbase.addons.<id>.enabled = true' references unknown addon(s): ${suggestions.join(', ')}. ` +
      `Available addons in [${searchedIn.map(p => `"${p}"`).join(', ')}]: ` +
      `${known.length ? known.join(', ') : '(none discovered)'}. ` +
      'Either rename the config key to match a discovered addon, or remove the enabled key. (#672)'
    );
  }

  /**
   * Levenshtein-distance-based suggestion. Returns the closest candidate
   * within edit distance 2, or null if no candidate is close enough.
   * Used by `assertConfiguredAddonsExist` for did-you-mean error hints
   * on typo-class misconfigs (rename-class misconfigs like
   * "ve-geology" → "geohazardwatch" are too far apart and will return
   * null, which is fine — the error message still lists every available
   * addon so the operator can pick the right one).
   */
  private findClosestAddonName(input: string, candidates: string[]): string | null {
    const dist = (a: string, b: string): number => {
      if (a === b) return 0;
      if (!a.length) return b.length;
      if (!b.length) return a.length;
      const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
      for (let i = 0; i <= a.length; i++) dp[i][0] = i;
      for (let j = 0; j <= b.length; j++) dp[0][j] = j;
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
      }
      return dp[a.length][b.length];
    };
    let best: string | null = null;
    let bestDist = 3;
    for (const c of candidates) {
      const d = dist(input, c);
      if (d < bestDist) { best = c; bestDist = d; }
    }
    return best;
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

    // #1117: migrate legacy ngdpbase.markup.filters.* keys onto the
    // ngdpbase.filters.* namespace, same shape and for the same reason.
    this.migrateLegacyFilterNamespace();

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
   * #1117 slice 2: migration shim for the filter namespace. The old
   * `ngdpbase.markup.filters.*` prefix described one consumer (markup
   * rendering) of a capability that also gates saves —
   * `…security.block-on-save` refuses content at the door, and an operator
   * disabling "markup filters" to fix a rendering glitch would not expect to
   * change what the system accepts. Keys now live under `ngdpbase.filters.*`.
   *
   * Every legacy key found in the CUSTOM config is copied to its new name
   * (unless the new name is itself set explicitly — an explicit new key
   * wins), then dropped, with one deprecation warning naming the count.
   * Operating on customConfig before the merge means an operator's explicit
   * legacy setting still overrides the shipped default under the new name —
   * the case that must not silently break is a custom
   * `…security.enabled=true` on an open-registration instance.
   */
  private migrateLegacyFilterNamespace(): void {
    if (!this.customConfig) return;

    const LEGACY_PREFIX = 'ngdpbase.markup.filters.';
    const NEW_PREFIX = 'ngdpbase.filters.';

    const legacyKeys = Object.keys(this.customConfig).filter((k) => k.startsWith(LEGACY_PREFIX));
    if (legacyKeys.length === 0) return;

    for (const legacyKey of legacyKeys) {
      const newKey = NEW_PREFIX + legacyKey.slice(LEGACY_PREFIX.length);
      if (!(newKey in this.customConfig)) {
        this.customConfig[newKey] = this.customConfig[legacyKey];
      }
      delete this.customConfig[legacyKey];
    }

    logger.warn(
      `[ConfigurationManager] DEPRECATED: ${legacyKeys.length} 'ngdpbase.markup.filters.*' key(s) in custom config ` +
      `migrated to 'ngdpbase.filters.*' (e.g. '${legacyKeys[0]}'). ` +
      `Update ${this.customConfigPath} to the new names. (#1117)`
    );
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
    const result = { ...defaultConfig };

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
    // #1089: environment-owned keys are DECLARED in `ngdpbase.config.env-keys`
    // rather than hardcoded here, so the admin configuration screen can see
    // which keys it must render read-only. This used to be a six-entry object
    // literal that nothing outside this method knew about — which is how the UI
    // came to accept and persist edits that could never take effect.
    //
    // Ownership is not conditional on the variable being set: a declared key is
    // env-owned either way, and the shipped value is a boot fallback rather
    // than a setting. See src/utils/configEnvKeys.ts.
    const raw = this.mergedConfig?.[key] ?? defaultValue;

    const envVar = this.getEnvKeyMap()[key];
    if (envVar) {
      const fromEnv = process.env[envVar];
      if (fromEnv !== undefined && fromEnv !== '') {
        return coerceToTypeOf(fromEnv, raw);
      }
    }

    return this.resolveEnvRef(raw, key);
  }

  /**
   * #896: read a property from the SHIPPED defaults only, ignoring instance
   * custom-config overrides. Used by vocabulary providers whose seed must not
   * be shadowed by legacy whole-catalog snapshots in instance config (the
   * #895 propagation bug). No env-override or env-ref resolution — defaults
   * are repo-shipped literals.
   */
  getDefaultProperty(key: string, defaultValue: unknown = null): unknown {
    return this.defaultConfig?.[key] ?? defaultValue;
  }

  /**
   * Resolve environment-variable references in a string config value.
   *
   * Two forms supported (#775):
   *
   * **`${VAR}` brace form** — embedded references, suitable for path templates
   * like `"${FAST_STORAGE}/sessions"`. Silent on missing: leaves the
   * unresolved placeholder intact (the value flows through to the caller,
   * which typically fails later at point-of-use). Multiple embedded refs in
   * one string work; partial-string refs work. **Use for paths and
   * prefix-based templates.**
   *
   * **`$VAR` bare-whole-value form** — the ENTIRE config value is a single
   * env-var reference. Strict on missing: throws with a clear message so
   * the operator notices immediately at startup or first read. **Use for
   * secrets** (API keys, SMTP passwords, etc.). Operators set these in
   * `.env` alongside `FAST_STORAGE` / `SLOW_STORAGE` / `PORT`.
   *
   * **`$$literal` escape** — for the rare config value that genuinely
   * starts with `$`. `"$$abc"` resolves to `"$abc"`.
   *
   * Non-string values pass through unchanged. Resolution happens at lookup
   * time (per-`getProperty()` call), not at config load — so tests that
   * mutate `process.env` mid-run see the new value on the next read.
   *
   * @param value - The raw config value (any type; only strings are processed)
   * @param key   - The config key being looked up; included in error messages
   *                so operators can find the offending entry.
   * @returns The resolved value, or the input unchanged for non-strings /
   *          non-refs.
   * @throws  When the bare `$VAR` form references an unset env var.
   */
  private resolveEnvRef(value: unknown, key: string): unknown {
    if (typeof value !== 'string') return value;

    // Escape hatch — `$$literal` → `$literal`. Must come before the bare-form
    // check so `$$VAR` isn't mistaken for a malformed bare ref.
    if (value.startsWith('$$')) {
      return value.slice(1);
    }

    // Bare whole-value form `$VAR`. Strict: must match the WHOLE string and
    // throw on missing. The regex enforces a valid POSIX-shell-style env var
    // name (uppercase letters, digits, underscores; not starting with digit).
    const bareMatch = /^\$([A-Z_][A-Z0-9_]*)$/.exec(value);
    if (bareMatch) {
      const varName = bareMatch[1];
      if (varName in process.env) {
        this._envRefHitCount++;
        return process.env[varName];
      }
      this._envRefMissCount++;
      throw new Error(
        `Config secret \`${varName}\` referenced by \`${key}\` but env var is unset. ` +
        `Add \`${varName}=...\` to your .env (or k8s Secret) and restart.`
      );
    }

    // Brace embedded form `${VAR}`. Legacy behavior preserved from
    // pre-#775: leaves unresolved placeholders intact when the var is
    // unset (silent — appropriate for path templates where the missing
    // value surfaces at filesystem use-time).
    if (value.includes('${')) {
      return value.replace(/\$\{([^}]+)\}/g, (match: string, varName: string) => {
        if (varName in process.env) {
          this._envRefHitCount++;
          return process.env[varName] as string;
        }
        // Stay silent on miss — this is the back-compat behavior. The
        // unresolved placeholder propagates to the caller; expected to
        // fail loudly at point-of-use (e.g. filesystem operations on
        // `"${UNSET_VAR}/sessions"` will throw ENOENT).
        this._envRefBraceMissCount++;
        return match;
      });
    }

    return value;
  }

  /** Audit counters for the boot-time env-ref summary log (#775). */
  private _envRefHitCount = 0;
  private _envRefMissCount = 0;
  private _envRefBraceMissCount = 0;

  /**
   * Get a config property with secrets masked to `"***"` for safe logging
   * (#775). Returns the unmasked value for plain literals and brace-form
   * resolved values; only the bare-form `$VAR` secrets return the mask.
   *
   * Use this on any log path that may print a config value. Boot banners,
   * admin /config endpoint listings, debug-level config dumps.
   *
   * @param key          - Config key
   * @param defaultValue - Default when key absent
   * @returns The unmasked value, OR `"***"` if the raw config value was a
   *          bare-form `$VAR` reference (indicating it carries a secret).
   */
  getMaskedProperty(key: string, defaultValue: unknown = null): unknown {
    const raw = this.mergedConfig?.[key] ?? defaultValue;
    // A raw value of `$VAR` indicates this entry is a secret reference.
    // Resolve it (to validate the env var is set — same throw semantics)
    // but return `"***"` to the caller for log-safety.
    if (typeof raw === 'string' && /^\$[A-Z_][A-Z0-9_]*$/.test(raw)) {
      // Force the resolution to fire (so it throws if the env var is
      // missing — operators want loud failure, not a silent `"***"`).
      this.resolveEnvRef(raw, key);
      return '***';
    }
    // Everything else (literals, brace-form templates) is non-secret;
    // return the resolved value.
    return this.resolveEnvRef(raw, key);
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
  /**
   * The declared map of environment-owned config keys (#1089).
   *
   * Read straight from `mergedConfig` rather than through `getProperty`, which
   * would recurse — `getProperty` calls this to decide whether the key it was
   * asked for is env-owned.
   */
  private getEnvKeyMap(): EnvKeyMap {
    const raw = this.mergedConfig?.[ENV_KEYS_CONFIG_KEY];
    return (raw && typeof raw === 'object' && !Array.isArray(raw))
      ? (raw as EnvKeyMap)
      : {};
  }

  /**
   * Which keys the environment owns, and the variable that supplies each (#1089).
   *
   * Exposed so the admin configuration screen can render those keys read-only
   * instead of accepting a write that cannot take effect.
   */
  getEnvControlledKeys(): EnvKeyMap {
    return { ...this.getEnvKeyMap() };
  }

  /**
   * Describe where a key's value actually comes from (#1089).
   *
   * The admin screen needs three separate facts that `getProperty` alone cannot
   * express: the effective value, whether the environment owns the key, and
   * which variable does. Without this it displayed `mergedConfig` — the raw JSON
   * — while `getProperty` returned something else entirely, so the *read* side
   * was wrong before anyone edited anything.
   */
  describeProperty(key: string): PropertyDescription {
    const configValue = this.mergedConfig?.[key] ?? null;
    const described = describePropertySource(key, this.getEnvKeyMap(), process.env, configValue);

    // A config-sourced value may still be a `${VAR}` template or a `$VAR`
    // secret ref, so run it through the same resolver getProperty uses.
    if (described.source === 'config') {
      try {
        return { ...described, effective: this.resolveEnvRef(described.effective, key) };
      } catch {
        // A bare ref to an unset variable throws by design. The screen should
        // show that the value is unresolvable, not fail to render.
        return { ...described, effective: null };
      }
    }

    return described;
  }

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
   * Get session secure flag.
   *
   * #1043: these two compared against the STRING `'true'` while the config
   * values are real booleans, so `getSessionSecure()` returned false even when
   * the key was set to `true`. Nothing called either one — the session cookie
   * is configured in `app.ts`, which reads the keys directly — so the bug was
   * invisible until someone tried to use the accessor the config key advertises.
   *
   * Kept (public API, an embedder may call them) and made boolean-aware, so the
   * next caller gets the answer the config actually holds.
   *
   * @returns {boolean} Session secure flag
   */
  getSessionSecure(): boolean {
    return this.getProperty('ngdpbase.session.secure', false) === true;
  }

  /**
   * Get session httpOnly flag. Defaults to true — the safe direction.
   * @returns {boolean} Session httpOnly flag
   */
  getSessionHttpOnly(): boolean {
    return this.getProperty('ngdpbase.session.http-only', true) !== false;
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
    return { ...this.customConfig };
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

