/**
 * AddonsManager - Core Add-on Management System
 *
 * Handles discovery, registration, lifecycle management, and dependencies
 * for optional ngdpbase add-ons. This enables optional business modules
 * (person-contacts, financial-ledger, etc.) without modifying ngdpbase core.
 *
 * @class AddonsManager
 * @extends BaseManager
 *
 * @see {@link https://github.com/jwilleke/ngdpbase/issues/158}
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import BaseManager from './BaseManager.js';
import type { BackupData } from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type PageManager from './PageManager.js';
import type SearchManager from './SearchManager.js';
import logger from '../utils/logger.js';

/**
 * Standard interface that all add-ons must implement
 */
export interface AddonModule {
  /** Unique identifier for the add-on */
  name: string;

  /** Semantic version string */
  version: string;

  /** Human-readable description */
  description?: string;

  /** Author name or organization */
  author?: string;

  /** List of add-on names this add-on depends on */
  dependencies?: string[];

  /**
   * Called during app startup if add-on is enabled.
   * Use this to register routes, initialize databases, etc.
   */
  register(
    engine: WikiEngine,
    config: Record<string, unknown>
  ): Promise<void> | void;

  /**
   * Optional health check returning add-on status details.
   */
  status?(): Promise<AddonStatusDetails> | AddonStatusDetails;

  /**
   * Optional cleanup on app shutdown.
   */
  shutdown?(): Promise<void> | void;
}

/**
 * Shape of the `ngdpbase` key in an add-on's package.json.
 * All fields are optional — omitting the key entirely is valid.
 */
export interface AddonManifest {
  /** 'domain' = this addon IS the site identity; 'additive' = augments an existing wiki */
  type?: 'domain' | 'additive';
  /**
   * Config keys this addon wants applied by default at load time.
   * Each key is only set if the operator has not already explicitly
   * set it in custom config. Values are ephemeral (merged config only,
   * not persisted to app-custom-config.json).
   */
  domainDefaults?: Record<string, unknown>;
  /** Capability flags this addon advertises */
  capabilities?: string[];
}

/**
 * Details returned by add-on's status() method
 */
export interface AddonStatusDetails {
  healthy: boolean;
  database?: string;
  records?: number;
  message?: string;
  [key: string]: unknown;
}

/**
 * Internal tracking for each discovered add-on
 */
interface AddonEntry {
  /** Filesystem path to the add-on */
  path: string;

  /** Loaded add-on module */
  module: AddonModule;

  /** Whether add-on is enabled in configuration */
  enabled: boolean;

  /** Whether add-on has been successfully loaded */
  loaded: boolean;

  /** Error message if loading failed */
  error: string | null;

  /** Parsed ngdpbase key from the add-on's package.json, or null if absent */
  manifest: AddonManifest | null;
}

/**
 * Card registered by an add-on for display on the admin dashboard.
 * The card's live stats are sourced from the add-on's existing status() method.
 */
export interface AddonDashboardCard {
  /** Must match the add-on's registered name */
  addonName: string;
  /** Card heading */
  title: string;
  /** Font Awesome class, e.g. 'fas fa-wpforms' */
  icon: string;
  /** URL of the add-on's admin page */
  adminUrl: string;
}

/**
 * Status information returned by getStatus()
 */
export interface AddonStatus {
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  loaded: boolean;
  dependencies: string[];
  error: string | null;
  /** 'domain' | 'additive' | undefined (unset addons behave as additive) */
  type?: 'domain' | 'additive';
  details?: AddonStatusDetails;
  statusError?: string;
  /** #443: add-on ships a deployable theme/ (theme.json sentinel present) */
  hasTheme?: boolean;
  /** #443: themes/<name>/ already exists in the instance */
  themeDeployed?: boolean;
}

/**
 * AddonsManager - Manages optional add-on modules
 */
class AddonsManager extends BaseManager {
  /** Map of discovered add-ons by name */
  private addons: Map<string, AddonEntry>;

  /** Configured paths to addons directories (one or more) */
  private addonsPaths: string[];

  /** Resolved absolute paths to addons directories */
  private resolvedAddonsPaths: string[];

  /** Stylesheets registered by add-ons via registerStylesheet() */
  private registeredStylesheets: Array<{ url: string; addonName: string }>;

  /** Dashboard cards registered by add-ons via registerDashboardCard() */
  private dashboardCards: Map<string, AddonDashboardCard>;

  /** Name of the first domain addon loaded — only one is permitted */
  private domainAddonName: string | null;

  constructor(engine: WikiEngine) {
    super(engine);
    this.addons = new Map();
    this.addonsPaths = ['./addons'];
    this.resolvedAddonsPaths = [];
    this.registeredStylesheets = [];
    this.dashboardCards = new Map();
    this.domainAddonName = null;
  }

  /**
   * Initialize the AddonsManager
   *
   * Reads configuration, discovers add-ons, and loads enabled ones
   * in dependency order.
   */
  async initialize(config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(config);

    const configManager = this.engine.getManager<ConfigurationManager>(
      'ConfigurationManager'
    );

    if (!configManager) {
      logger.warn('ConfigurationManager not available, using defaults');
    } else {
      // Check if AddonsManager is enabled
      const enabled = configManager.getProperty(
        'ngdpbase.managers.addons-manager.enabled',
        true
      ) as boolean;

      if (!enabled) {
        logger.info('AddonsManager disabled in configuration');
        return;
      }

      // Get configured addons path(s) — accepts a string or array of strings
      const raw = configManager.getProperty(
        'ngdpbase.managers.addons-manager.addons-path',
        './addons'
      );
      this.addonsPaths = Array.isArray(raw)
        ? (raw as string[]).map(String)
        : [String(raw)];
    }

    // Resolve every entry to an absolute path
    this.resolvedAddonsPaths = this.addonsPaths.map(p => path.resolve(p));

    // Discover and load add-ons
    await this.discoverAddons();
    await this.loadAddons();

    logger.info(
      `Initialized with ${this.addons.size} add-on(s) discovered, ` +
        `${this.getLoadedCount()} loaded`
    );
  }

  /**
   * Discover available add-ons by scanning all configured addons directories.
   */
  async discoverAddons(): Promise<void> {
    if (this.resolvedAddonsPaths.length === 0) {
      return;
    }
    for (const dirPath of this.resolvedAddonsPaths) {
      await this.scanAddonsDirectory(dirPath);
    }
  }

  /**
   * Scan a single addons directory and register any add-ons found.
   */
  private async scanAddonsDirectory(dirPath: string): Promise<void> {
    // Check if addons directory exists
    if (!fs.existsSync(dirPath)) {
      logger.debug(
        `Addons directory not found: ${dirPath} (this is normal if no add-ons installed)`
      );
      return;
    }

    // Verify it's a directory
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      logger.warn(`Addons path is not a directory: ${dirPath}`);
      return;
    }

    // Scan for add-on directories
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files/folders and non-directories
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue;
      }

      // Skip 'shared' folder (reserved for shared utilities)
      if (entry.name === 'shared') {
        continue;
      }

      const addonPath = path.join(dirPath, entry.name);
      const indexPath = path.join(addonPath, 'index.js');
      const indexTsPath = path.join(addonPath, 'index.ts');

      // Check for index file
      const hasIndex = fs.existsSync(indexPath) || fs.existsSync(indexTsPath);
      if (!hasIndex) {
        logger.warn(
          `Add-on ${entry.name} missing index.js/index.ts, skipping`
        );
        continue;
      }

      try {
        // Load the add-on module using dynamic import
        const modulePath = fs.existsSync(indexPath) ? indexPath : indexTsPath;
        const rawModule = (await import(modulePath)) as
          | AddonModule
          | { default: AddonModule };
        const addonModule: AddonModule =
          'default' in rawModule ? rawModule.default : rawModule;

        // Validate required fields
        if (!addonModule.name) {
          logger.warn(
            `Add-on in ${entry.name} missing 'name' field, using folder name`
          );
          addonModule.name = entry.name;
        }

        if (typeof addonModule.register !== 'function') {
          logger.error(
            `Add-on ${addonModule.name} missing required register() function, skipping`
          );
          continue;
        }

        // Warn if a later path tries to register a name already discovered
        if (this.addons.has(addonModule.name)) {
          logger.warn(
            `[AddonsManager] Duplicate add-on name '${addonModule.name}' found in ${dirPath} — skipping (already loaded from another path)`
          );
          continue;
        }

        // Check if enabled in configuration
        const enabled = this.isEnabled(addonModule.name);

        // Read ngdpbase manifest from package.json (if present)
        let manifest: AddonManifest | null = null;
        const pkgPath = path.join(addonPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
            manifest = (pkg.ngdpbase as AddonManifest) ?? null;
          } catch {
            logger.warn(`[AddonsManager] Could not parse package.json for ${entry.name}`);
          }
        }

        // Store the add-on entry
        this.addons.set(addonModule.name, {
          path: addonPath,
          module: addonModule,
          enabled,
          loaded: false,
          error: null,
          manifest
        });

        logger.info(
          `📦 Discovered add-on: ${addonModule.name} v${addonModule.version || 'unknown'} ` +
            `[${enabled ? 'enabled' : 'disabled'}] (${dirPath})`
        );
      } catch (err) {
        logger.error(`Failed to load add-on from ${entry.name}:`, err);
      }
    }
  }

  /**
   * Check if an add-on is enabled in configuration
   */
  isEnabled(addonName: string): boolean {
    const configManager = this.engine.getManager<ConfigurationManager>(
      'ConfigurationManager'
    );

    if (!configManager) {
      return false; // Default to disabled if no config
    }

    return configManager.getProperty(
      `ngdpbase.addons.${addonName}.enabled`,
      false
    ) as boolean;
  }

  /**
   * Validate that an add-on can be safely disabled (#617).
   *
   * Mirrors the enable-time topological-sort dep check at `resolveLoadOrder()`:
   * if any *enabled* add-on declares `dependencies: ['<addonName>']`, the
   * disable is blocked and the dependent's name is returned. Callers should
   * surface the blocker to the operator and refuse the disable.
   *
   * @param addonName  The add-on the operator wants to disable.
   * @returns          `{ ok: true }` if safe to disable. Otherwise
   *                   `{ ok: false, blockedBy: ['dep1', 'dep2', ...] }` with
   *                   the names of every enabled addon that depends on it.
   */
  canDisable(addonName: string): { ok: true } | { ok: false; blockedBy: string[] } {
    const blockers: string[] = [];
    for (const [otherName, otherEntry] of this.addons) {
      if (otherName === addonName) continue;
      if (!otherEntry.enabled) continue;
      const deps = otherEntry.module?.dependencies ?? [];
      if (deps.includes(addonName)) {
        blockers.push(otherName);
      }
    }
    if (blockers.length === 0) {
      return { ok: true };
    }
    return { ok: false, blockedBy: blockers };
  }

  /**
   * Get add-on specific configuration
   */
  getAddonConfig(addonName: string): Record<string, unknown> {
    const configManager = this.engine.getManager<ConfigurationManager>(
      'ConfigurationManager'
    );

    if (!configManager) {
      return {};
    }

    // Get addon-specific properties from config.
    // Config is stored as flat dot-notation keys, e.g.:
    //   "ngdpbase.addons.my-addon.dataPath": "./data/my-addon"
    //   "ngdpbase.addons.calendar.calendars.clubhouse.enabled": true
    // Strip the addon prefix, then deep-nest the remaining dot-segments so
    // single-segment keys stay flat (`config.dataPath`) and multi-segment
    // keys become a nested object tree (`config.calendars.clubhouse.enabled`).
    // The flat form alone would force every addon to reimplement key-walking;
    // the nested form lets addons read structured config naturally (#718).
    const config: Record<string, unknown> = {};
    const prefix = `ngdpbase.addons.${addonName}.`;
    const allProps = configManager.getAllProperties();

    const setDeep = (target: Record<string, unknown>, path: string, value: unknown): void => {
      const segments = path.split('.');
      let cursor: Record<string, unknown> = target;
      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i];
        const next = cursor[seg];
        if (typeof next !== 'object' || next === null || Array.isArray(next)) {
          cursor[seg] = {};
        }
        cursor = cursor[seg] as Record<string, unknown>;
      }
      cursor[segments[segments.length - 1]] = value;
    };

    for (const [key, value] of Object.entries(allProps)) {
      if (key.startsWith(prefix)) {
        setDeep(config, key.slice(prefix.length), value);
      }
    }

    return config;
  }

  /**
   * Seed wiki pages shipped with an add-on.
   *
   * If the add-on directory contains a `pages/` subdirectory, any `.md` files
   * found there are copied to the instance pages directory — but only if a file
   * with the same name does not already exist (user edits are never overwritten).
   *
   * This mirrors how `required-pages/` seeds core pages at install time.
   *
   * @param addonName  Name of the add-on (for logging)
   * @param addonPath  Filesystem path to the add-on directory
   */
  private async seedAddonPages(addonName: string, addonPath: string): Promise<void> {
    const addonPagesDir = path.join(addonPath, 'pages');

    try {
      await fs.promises.access(addonPagesDir);
    } catch {
      return; // No pages/ directory — nothing to seed
    }

    const pageManager = this.engine.getManager<PageManager>('PageManager');
    if (!pageManager) {
      logger.warn(`[AddonsManager] PageManager not available — cannot seed pages for ${addonName}`);
      return;
    }

    const files = (await fs.promises.readdir(addonPagesDir)).filter(f => f.endsWith('.md'));
    let seeded = 0;

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (const file of files) {
      const src = path.join(addonPagesDir, file);
      try {
        const raw = await fs.promises.readFile(src, 'utf8');
        const parsed = matter(raw);
        const uuid = parsed.data.uuid as string | undefined;
        const slug = parsed.data.slug as string | undefined;

        if (!uuid || !uuidPattern.test(uuid)) {
          logger.warn(`[AddonsManager] Skipping ${addonName}/pages/${file} — missing or invalid uuid in frontmatter`);
          continue;
        }

        if (!slug) {
          logger.warn(`[AddonsManager] Skipping ${addonName}/pages/${file} — missing slug in frontmatter`);
          continue;
        }

        // Skip save if a page with this slug already exists (user edits are never overwritten),
        // but still ensure the page is present in the search index (index may not have been
        // rebuilt since the page was seeded).
        if (pageManager.pageExists(slug)) {
          const searchManager = this.engine.getManager<SearchManager>('SearchManager');
          if (searchManager) {
            const existingPage = await pageManager.getPage(slug);
            if (existingPage) {
              await searchManager.updatePageInIndex(slug, {
                name: slug,
                content: existingPage.content,
                metadata: existingPage.metadata as Record<string, unknown>
              });
            }
          }
          logger.debug(`[AddonsManager] Page '${slug}' already exists — skipping seed for ${addonName}`);
          continue;
        }

        // Seed through PageManager so all page providers (including VersioningFileProvider)
        // update their index correctly
        const metadata: Record<string, unknown> = {
          ...(parsed.data as Record<string, unknown>),
          addon: addonName,
          'system-category': (parsed.data as Record<string, unknown>)['system-category'] ?? 'addon'
        };

        await pageManager.savePage(slug, parsed.content, metadata);

        // Update search index so the page is discoverable via category search
        const searchManager = this.engine.getManager<SearchManager>('SearchManager');
        if (searchManager) {
          await searchManager.updatePageInIndex(slug, {
            name: slug,
            content: parsed.content,
            metadata
          });
        }

        seeded++;
      } catch (err) {
        logger.warn(`[AddonsManager] Could not seed ${addonName}/pages/${file}:`, err);
      }
    }

    if (seeded > 0) {
      logger.info(`[AddonsManager] Seeded ${seeded} page(s) from ${addonName}/pages/`);
    } else {
      logger.debug(`[AddonsManager] No new pages to seed for ${addonName}`);
    }
  }

  /**
   * Instance themes directory — sibling of addons/ under the project root.
   * `projectRoot` is `process.cwd()` (see app.ts) and the static mount is
   * `/themes` → `path.join(projectRoot, 'themes')`, so this resolves to the
   * same place ThemeManager reads from. Matches how the default `./addons`
   * path resolves.
   */
  private getInstanceThemesDir(): string {
    const cm = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const configured = cm?.getProperty?.('ngdpbase.theme.directory', 'themes') as string | undefined;
    return path.resolve(configured || 'themes');
  }

  /**
   * True if the add-on ships a deployable theme. `theme/theme.json` is the
   * presence sentinel (mirrors `pages/` needing at least one `.md`).
   */
  addonShipsTheme(addonPath: string): boolean {
    try {
      return fs.existsSync(path.join(addonPath, 'theme', 'theme.json'));
    } catch {
      return false;
    }
  }

  /**
   * #443: Deploy an add-on's `theme/` into the instance `themes/<name>/`.
   *
   * When an add-on ships a `theme/` subdirectory it should land in the
   * instance themes directory the same way `seedAddonPages()` handles
   * `pages/`. ThemeManager then reads it via `ngdpbase.theme.active` (set by
   * the addon's domainDefaults) — no ThemeManager change needed.
   *
   * @param addonName  Add-on name (also the destination theme folder)
   * @param addonPath  Filesystem path to the add-on directory
   * @param overwrite  false (default) = first-boot copy, never overwrites an
   *                    existing `themes/<name>/` (preserves instance edits);
   *                    true = dashboard-triggered redeploy, replaces it.
   * @returns Result describing what happened (for the admin UI).
   */
  async seedAddonTheme(
    addonName: string,
    addonPath: string,
    overwrite = false
  ): Promise<{ ok: boolean; deployed: boolean; message: string }> {
    const themeSrc = path.join(addonPath, 'theme');

    if (!this.addonShipsTheme(addonPath)) {
      return { ok: true, deployed: false, message: `${addonName} ships no theme/ (no theme.json sentinel)` };
    }

    const dest = path.join(this.getInstanceThemesDir(), addonName);

    try {
      const destExists = fs.existsSync(dest);
      if (destExists && !overwrite) {
        // First-boot semantics: never clobber instance customisations.
        logger.debug(`[AddonsManager] themes/${addonName}/ already exists — skipping theme deploy for ${addonName}`);
        return { ok: true, deployed: false, message: `themes/${addonName}/ already exists — left untouched` };
      }

      await fs.promises.cp(themeSrc, dest, { recursive: true, force: overwrite });

      const verb = destExists ? 'Redeployed' : 'Deployed';
      logger.info(`[AddonsManager] ${verb} theme from ${addonName}/theme/ → themes/${addonName}/`);
      return { ok: true, deployed: true, message: `${verb} theme → themes/${addonName}/` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[AddonsManager] Could not deploy theme for ${addonName}: ${msg}`);
      return { ok: false, deployed: false, message: `Failed to deploy theme: ${msg}` };
    }
  }

  /**
   * #443: Dashboard-triggered theme (re)deploy — always overwrites so theme
   * updates shipped by the add-on can be pulled in without a server restart
   * (theme CSS is served as static files; a page reload suffices).
   *
   * @param addonName  Add-on name
   * @returns Result for the admin UI
   */
  async deployAddonTheme(addonName: string): Promise<{ ok: boolean; deployed: boolean; message: string }> {
    const addon = this.addons.get(addonName);
    if (!addon) {
      return { ok: false, deployed: false, message: `Add-on "${addonName}" not found` };
    }
    return this.seedAddonTheme(addonName, addon.path, true);
  }

  /**
   * Load all enabled add-ons in dependency order
   */
  private async loadAddons(): Promise<void> {
    try {
      const loadOrder = this.resolveLoadOrder();

      if (loadOrder.length === 0) {
        logger.debug('No enabled add-ons to load');
        return;
      }

      logger.info(`📋 Add-on load order: ${loadOrder.join(' → ')}`);

      for (const addonName of loadOrder) {
        await this.loadAddon(addonName);
      }
    } catch (err) {
      logger.error('Failed to resolve add-on load order:', err);
    }
  }

  /**
   * Resolve dependency order using topological sort
   *
   * @returns Array of add-on names in load order
   * @throws Error if circular dependency detected
   */
  resolveLoadOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string): void => {
      if (visited.has(name)) return;

      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected involving: ${name}`);
      }

      const addon = this.addons.get(name);
      if (!addon || !addon.enabled) {
        return;
      }

      visiting.add(name);

      // Visit dependencies first
      const deps = addon.module.dependencies || [];
      for (const dep of deps) {
        if (!this.addons.has(dep)) {
          throw new Error(
            `Add-on ${name} requires ${dep} but it's not installed`
          );
        }
        if (!this.isEnabled(dep)) {
          throw new Error(
            `Add-on ${name} requires ${dep} to be enabled`
          );
        }
        visit(dep);
      }

      order.push(name);
      visiting.delete(name);
      visited.add(name);
    };

    // Visit all enabled add-ons
    for (const [name, addon] of this.addons) {
      if (addon.enabled) {
        visit(name);
      }
    }

    return order;
  }

  /**
   * Load a single add-on
   */
  async loadAddon(addonName: string): Promise<void> {
    const addon = this.addons.get(addonName);

    if (!addon) {
      throw new Error(`Add-on ${addonName} not found`);
    }

    if (!addon.enabled) {
      logger.debug(`Skipping disabled add-on: ${addonName}`);
      return;
    }

    if (addon.loaded) {
      return; // Already loaded
    }

    try {
      // Enforce single domain addon: if a second addon declares type: 'domain',
      // warn and treat it as additive so it does not clobber the first.
      if (addon.manifest?.type === 'domain') {
        if (this.domainAddonName && this.domainAddonName !== addonName) {
          logger.warn(
            `[AddonsManager] ${addonName} declares type: 'domain' but ${this.domainAddonName} is already the domain addon. ` +
            `Loading ${addonName} as additive instead.`
          );
          addon.manifest = { ...addon.manifest, type: 'additive' };
        } else {
          this.domainAddonName = addonName;
          logger.info(`[AddonsManager] Domain addon: ${addonName}`);
        }
      }

      // Inject per-addon file defaults (lowest priority — beaten by both app configs)
      this.applyAddonDefaults(addonName);

      // Inject domainDefaults before register() so the addon can read
      // any applied values from ConfigurationManager during startup
      this.applyDomainDefaults(addonName);

      // Get add-on specific configuration
      const addonConfig = this.getAddonConfig(addonName);

      // Call the add-on's register function
      await addon.module.register(this.engine, addonConfig);

      // Seed any pages shipped with the add-on (pages/ subdir)
      await this.seedAddonPages(addonName, addon.path);

      // #443: Auto-deploy the add-on's theme/ on first boot (never overwrites)
      await this.seedAddonTheme(addonName, addon.path);

      addon.loaded = true;
      addon.error = null;

      logger.info(
        `✅ Add-on loaded: ${addonName} v${addon.module.version || 'unknown'}`
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      addon.error = errorMessage;
      addon.loaded = false;

      logger.error(`Failed to load add-on ${addonName}: ${errorMessage}`);
      // Don't throw - allow other add-ons to load
    }
  }

  /**
   * Inject per-addon file defaults from addons/<name>/config/default-config.json.
   * Keys are only applied when absent from the merged config (i.e. not set in
   * app-default-config.json or app-custom-config.json). This gives operators full
   * override priority while shipping sensible defaults alongside each addon.
   */
  private applyAddonDefaults(addonName: string): void {
    const addon = this.addons.get(addonName);
    if (!addon) return;

    const defaultConfigPath = path.join(addon.path, 'config', 'default-config.json');
    if (!fs.existsSync(defaultConfigPath)) return;

    let defaults: Record<string, unknown>;
    try {
      defaults = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      logger.warn(`[AddonsManager] Failed to parse ${defaultConfigPath}`);
      return;
    }

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) return;

    const existing = configManager.getAllProperties();
    for (const [key, value] of Object.entries(defaults)) {
      if (key.startsWith('_comment')) continue;
      if (!(key in existing)) {
        configManager.setRuntimeProperty(key, value);
        logger.debug(`[AddonsManager] ${addonName}: applied addon default '${key}'`);
      }
    }
  }

  /**
   * Inject domainDefaults from the add-on's package.json ngdpbase key
   * into the merged config, but only for keys not already explicitly
   * set by the operator in custom config.
   */
  private applyDomainDefaults(addonName: string): void {
    const addon = this.addons.get(addonName);
    if (!addon?.manifest?.domainDefaults) return;

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) return;

    for (const [key, value] of Object.entries(addon.manifest.domainDefaults)) {
      if (configManager.getCustomProperty(key) !== null) {
        logger.debug(
          `[AddonsManager] ${addonName}: domainDefault '${key}' skipped — operator has set it`
        );
        continue;
      }
      configManager.setRuntimeProperty(key, value);
      logger.info(
        `[AddonsManager] ${addonName}: applied domainDefault '${key}' = ${JSON.stringify(value)}`
      );
    }
  }

  /**
   * Get status of all discovered add-ons
   */
  async getStatus(): Promise<AddonStatus[]> {
    const status: AddonStatus[] = [];

    for (const [name, addon] of this.addons) {
      const info: AddonStatus = {
        name,
        version: addon.module.version || 'unknown',
        description: addon.module.description || '',
        author: addon.module.author || '',
        enabled: addon.enabled,
        loaded: addon.loaded,
        dependencies: addon.module.dependencies || [],
        error: addon.error,
        type: addon.manifest?.type
      };

      // #443: surface theme-deploy state for the admin dashboard
      info.hasTheme = this.addonShipsTheme(addon.path);
      if (info.hasTheme) {
        info.themeDeployed = fs.existsSync(
          path.join(this.getInstanceThemesDir(), name)
        );
      }

      // Call add-on's status() if available and loaded
      if (addon.loaded && typeof addon.module.status === 'function') {
        try {
          info.details = await addon.module.status();
        } catch (err) {
          info.statusError =
            err instanceof Error ? err.message : String(err);
        }
      }

      status.push(info);
    }

    return status;
  }

  /**
   * Get count of loaded add-ons
   */
  private getLoadedCount(): number {
    let count = 0;
    for (const addon of this.addons.values()) {
      if (addon.loaded) count++;
    }
    return count;
  }

  /**
   * Register a stylesheet URL to be injected into every page's <head>.
   *
   * Call this from your add-on's register() function:
   * ```js
   * const addonsManager = engine.getManager('AddonsManager');
   * addonsManager.registerStylesheet('/addons/my-addon/css/style.css');
   * ```
   *
   * The URL must be publicly accessible (served via Express static or a CDN).
   * Add-on CSS files under `addons/<name>/public/` are automatically served at
   * `/addons/<name>/public/` when the server starts.
   *
   * @param url    Public URL of the stylesheet (e.g. '/addons/my-addon/css/style.css')
   * @param addonName  Optional: name of the registering add-on (for logging)
   */
  registerStylesheet(url: string, addonName: string = 'unknown'): void {
    if (!url || typeof url !== 'string') {
      logger.warn(`[AddonsManager] registerStylesheet called with invalid url by ${addonName}`);
      return;
    }
    this.registeredStylesheets.push({ url, addonName });
    logger.debug(`[AddonsManager] Stylesheet registered by ${addonName}: ${url}`);
  }

  /**
   * Return the ordered list of stylesheet URLs registered by all add-ons.
   * Called by the template layer to inject <link> tags into <head>.
   */
  getRegisteredStylesheets(): string[] {
    return this.registeredStylesheets.map(s => s.url);
  }

  /**
   * Register a dashboard card for this add-on. Called from the add-on's register() function.
   * Live stats shown on the card are sourced from the add-on's existing status() method.
   */
  registerDashboardCard(card: AddonDashboardCard): void {
    this.dashboardCards.set(card.addonName, card);
    logger.debug(`[AddonsManager] Dashboard card registered by ${card.addonName}`);
  }

  /**
   * Return all registered dashboard cards in registration order.
   * Called by the admin dashboard route to populate the addon cards row.
   */
  getDashboardCards(): AddonDashboardCard[] {
    return Array.from(this.dashboardCards.values());
  }

  /**
   * Get list of all discovered add-on names
   */
  getAddonNames(): string[] {
    return Array.from(this.addons.keys());
  }

  /**
   * Return the `pages/` directory path for each enabled addon that has one.
   * Used by Required Pages Sync to surface addon pages alongside required pages.
   */
  getEnabledAddonPagesDirectories(): Array<{ name: string; pagesDir: string }> {
    const result: Array<{ name: string; pagesDir: string }> = [];
    for (const [name, addon] of this.addons) {
      if (addon.enabled) {
        result.push({ name, pagesDir: path.join(addon.path, 'pages') });
      }
    }
    return result;
  }

  /**
   * Check if an add-on exists (discovered)
   */
  hasAddon(addonName: string): boolean {
    return this.addons.has(addonName);
  }

  /**
   * Check if an add-on is loaded
   */
  isLoaded(addonName: string): boolean {
    const addon = this.addons.get(addonName);
    return addon?.loaded ?? false;
  }

  /**
   * Graceful shutdown of all loaded add-ons
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down add-ons...');

    // Shutdown in reverse load order
    const loadedAddons = Array.from(this.addons.entries())
      .filter(([, addon]) => addon.loaded)
      .reverse();

    for (const [name, addon] of loadedAddons) {
      if (typeof addon.module.shutdown === 'function') {
        try {
          await addon.module.shutdown();
          logger.debug(`Shutdown add-on: ${name}`);
        } catch (err) {
          logger.error(`Error shutting down ${name}:`, err);
        }
      }
    }

    await super.shutdown();
  }

  /**
   * Backup add-on manager state
   */
  backup(): Promise<BackupData> {
    const addonStates: Record<string, { enabled: boolean; loaded: boolean }> =
      {};

    for (const [name, addon] of this.addons) {
      addonStates[name] = {
        enabled: addon.enabled,
        loaded: addon.loaded
      };
    }

    return Promise.resolve({
      managerName: 'AddonsManager',
      timestamp: new Date().toISOString(),
      data: {
        addonsPaths: this.addonsPaths,
        addonStates
      }
    });
  }

  /**
   * Restore is not supported for AddonsManager
   * (add-ons are discovered at startup)
   */
  restore(backupData: BackupData): Promise<void> {
    if (!backupData) {
      return Promise.reject(
        new Error('AddonsManager: No backup data provided for restore')
      );
    }
    // Add-on state is determined by configuration and discovery
    // Restore is a no-op
    logger.info('AddonsManager restore called (no-op - state determined by config)');
    return Promise.resolve();
  }
}

export default AddonsManager;

