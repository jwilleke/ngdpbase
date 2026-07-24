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
import { pageSourceHash, evaluateSeededAddonPage } from '../utils/addonPageSync.js';
import matter from 'gray-matter';
import {
  splitAddonsPath,
  findNodeModulesDir,
  matchNpmPackageDirs,
  resolveAddonSlug
} from '../utils/addonsPathResolver.js';
import BaseManager from './BaseManager.js';
import type { BackupData } from './BaseManager.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type PageManager from './PageManager.js';
import type SearchManager from './SearchManager.js';
import logger from '../utils/logger.js';
import type { User } from '../types/User.js';

/**
 * Type passed to `AddonModule.profileSection()` (#534). Matches what
 * `UserManager.getUser()` returns at runtime — `User` minus the password
 * hash — so addons can read preferences/roles/email without coupling
 * to whether the host happened to fetch the full User record.
 */
export type AddonProfileUser = Omit<User, 'password'>;

/**
 * Flatten nested plain-object values into dotted-key form (#534 defensive).
 *
 * `express.urlencoded({ extended: true })` keeps dotted form-field names FLAT
 * by default — `<input name="journal.x">` → `body['journal.x']` directly,
 * NOT `body.journal.x`. (Verified: qs's `allowDots` defaults to false, and
 * body-parser doesn't override that.) But the WikiRoutes core code defends
 * against a future config change with its own `getBodyValue` walker, and
 * `AddonsManager.saveProfileSections` normalizes addon-bound body shape so
 * addon authors can rely on flat lookups regardless of host config.
 *
 * Rules:
 *   - Non-object values (string, number, boolean, null, undefined) pass
 *     through as-is at the current dotted key.
 *   - Arrays pass through as-is (not flattened element-wise — qs already
 *     produces sensible array shapes for `name="x[]"` inputs).
 *   - Plain objects are recursively flattened.
 *   - Flat dotted keys present on the input pass through unchanged.
 *   - If both flat (`'a.b': X`) and nested (`a: { b: Y }`) shapes are
 *     present, the LAST seen during iteration wins — typically the nested
 *     value, since flat dotted keys are inserted before nested objects in
 *     qs output. This is intentional: nested is the more-specific shape.
 */
export function flattenDottedKeys(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (
      v !== null
      && typeof v === 'object'
      && !Array.isArray(v)
      && Object.getPrototypeOf(v) === Object.prototype
    ) {
      Object.assign(out, flattenDottedKeys(v as Record<string, unknown>, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

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
   * Optional `/profile` page extension hook (#534).
   *
   * When implemented, the addon contributes a section to the core profile
   * page rather than maintaining a standalone settings route. The returned
   * `html` is inserted **inside** the core preferences form, so the form
   * fields it carries are submitted with the existing `POST /preferences`
   * and surfaced to `saveProfileSection()` for persistence.
   *
   * Return `null` to opt out per-user (e.g. when the addon's feature is
   * disabled for this user's roles).
   *
   * ⚠️ SECURITY — the returned `html` is rendered with EJS `<%- %>` (RAW,
   * NOT escaped) inside the user's `/profile` form. **The addon is fully
   * responsible for escaping any user-controlled data it interpolates.**
   * Use `<%= %>` in your own EJS templates, or an explicit escape helper.
   * A buggy `profileSection()` that string-concatenates user input becomes
   * stored-XSS against every user who views their profile.
   *
   * Two specific things to avoid:
   *   - Do NOT emit `<input name="_csrf" …>` — that would override the
   *     host form's CSRF token and corrupt the user's save.
   *   - Do NOT emit a wrapping `<form>` — your fields submit with the host
   *     preferences form. A nested `<form>` is invalid HTML and browsers
   *     will hoist your inputs unpredictably.
   *
   * RECOMMENDED — include a hidden marker so your paired `saveProfileSection`
   * can distinguish "section was rendered but checkboxes unchecked" from
   * "section was not rendered at all" (addon disabled mid-session, cached
   * form). Without it, absent checkbox fields look identical to "user
   * submitted no such field" and you may silently clobber stored values.
   */
  profileSection?(user: AddonProfileUser): Promise<AddonProfileSection | null> | AddonProfileSection | null;

  /**
   * Optional save handler paired with `profileSection()` (#534).
   *
   * Receives a shallow-cloned `req.body` from `POST /preferences`; the addon
   * extracts whichever fields its `profileSection()` form rendered and
   * persists them. Errors are caught by AddonsManager and logged — they
   * do NOT block the core-preferences save or other addons' saves.
   *
   * Two pitfalls the implementation must guard against (the host cannot
   * do this for you):
   *
   *   1. ABSENT-FIELD CLOBBER. HTML checkboxes only submit when checked, so
   *      an absent key is ambiguous between "user unchecked it" and "the
   *      field was never rendered". Without a presence signal (see the
   *      recommended hidden marker on `profileSection()`), writing
   *      `body['x'] === 'on'` unconditionally turns every save where the
   *      section was hidden into a stealth reset to `false`.
   *
   *   2. CONFIG-GATED FIELDS. If your partial gates a field behind an admin
   *      config flag (`<% if (enabled) %>`), your save handler MUST re-check
   *      the same flag server-side before writing — otherwise a crafted
   *      POST can bypass the admin's gate.
   */
  saveProfileSection?(username: string, body: Record<string, unknown>): Promise<void> | void;

  /**
   * Optional cleanup on app shutdown.
   */
  shutdown?(): Promise<void> | void;
}

/**
 * Returned from `AddonModule.profileSection()` — a single section rendered as
 * a card inside the `/profile` preferences form. `html` is inserted with `<%-`
 * (raw); the addon is responsible for any escaping of its own data.
 */
export interface AddonProfileSection {
  /** Heading shown in the card header (e.g. "Journal"). */
  title: string;
  /** Raw HTML rendered inside the card body; should contain form input fields. */
  html: string;
}

/**
 * One entry per addon that contributed a profile section, returned by
 * `AddonsManager.getProfileSections()`. `addonName` is the registry key —
 * useful for debug logging and CSS scoping.
 */
export interface AddonProfileSectionEntry extends AddonProfileSection {
  addonName: string;
}

/**
 * Shape of the `ngdpbase` key in an add-on's package.json.
 * All fields are optional — omitting the key entirely is valid.
 */
export interface AddonManifest {
  /**
   * Canonical addon identity (#927). Authoritative id used as the registry
   * key, the `ngdpbase.addons.<slug>.enabled` config key, dependency
   * references, and the boot-time validator's match — read statically from
   * `package.json` with no module import. When absent, identity falls back
   * to the package/folder name (minus a conventional trailing `-addon`).
   * The module's exported `name` is a display label and must equal this.
   */
  slug?: string;
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
  /** #673: npm package globs (from `node_modules:` addons-path entries) to discover from node_modules. */
  private npmAddonPatterns: string[] = [];

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

    // Split entries into filesystem directories and npm-package references
    // (#673 packaged model). An entry prefixed `node_modules:` is a glob of
    // npm packages to discover from node_modules (e.g. `node_modules:@jwilleke/*-addon`);
    // everything else is a directory path resolved to absolute (bundled/drop-in).
    // Shared with ConfigurationManager's boot-time addon-exists check (#924)
    // so the two can no longer drift.
    const { directories, npmPatterns } = splitAddonsPath(this.addonsPaths);
    this.resolvedAddonsPaths = directories.map(p => path.resolve(p));
    this.npmAddonPatterns = npmPatterns;

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
    for (const dirPath of this.resolvedAddonsPaths) {
      await this.scanAddonsDirectory(dirPath);
    }
    // #673: packaged (npm) discovery — runs after directory scans, so a
    // bundled/drop-in addon of the same name wins the duplicate-skip.
    for (const pattern of this.npmAddonPatterns) {
      await this.scanNpmAddons(pattern);
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

    // Scan for add-on directories; each subdir is one addon.
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (entry.name === 'shared') continue; // reserved for shared utilities
      await this.registerAddonFromDir(path.join(dirPath, entry.name), dirPath, 'directory');
    }
  }

  /**
   * #673 (packaged model): discover addons published as npm packages, matching a
   * `node_modules:<glob>` addons-path entry (e.g. `node_modules:@jwilleke/*-addon`).
   * Each matching package is loaded through the same slug/module/register()
   * contract as bundled and drop-in addons — only discovery differs.
   */
  private async scanNpmAddons(pattern: string): Promise<void> {
    const nmRoot = this.findNodeModules();
    if (!nmRoot) {
      logger.debug(`[AddonsManager] npm addon discovery: no node_modules found for '${pattern}'`);
      return;
    }
    for (const pkgDir of this.resolveNpmAddonDirs(nmRoot, pattern)) {
      await this.registerAddonFromDir(pkgDir, `npm:${pattern}`, 'npm');
    }
  }

  /** Locate the node_modules directory (app root / cwd). */
  private findNodeModules(): string | null {
    return findNodeModulesDir();
  }

  /** Expand a `@scope/glob` (or bare `glob`) pattern to package directories. */
  private resolveNpmAddonDirs(nmRoot: string, pattern: string): string[] {
    return matchNpmPackageDirs(nmRoot, pattern);
  }

  /**
   * Load a single addon from its directory (index.js/ts + optional package.json
   * `ngdpbase` manifest) and register it. Shared by directory scans and npm
   * (#673) discovery; `sourceLabel` is for logging only. `source` selects the
   * no-slug identity fallback (#927): a directory addon's folder name is its
   * identity verbatim, while an npm package strips the conventional `-addon`
   * suffix. Duplicate ids are skipped — since npm discovery runs last, a
   * bundled/drop-in addon wins.
   */
  private async registerAddonFromDir(
    addonPath: string,
    sourceLabel: string,
    source: 'directory' | 'npm'
  ): Promise<void> {
    const folderName = path.basename(addonPath);
    const indexPath = path.join(addonPath, 'index.js');
    const indexTsPath = path.join(addonPath, 'index.ts');

    if (!(fs.existsSync(indexPath) || fs.existsSync(indexTsPath))) {
      logger.warn(`Add-on ${folderName} missing index.js/index.ts, skipping`);
      return;
    }

    try {
      const modulePath = fs.existsSync(indexPath) ? indexPath : indexTsPath;
      const rawModule = (await import(modulePath)) as AddonModule | { default: AddonModule };
      const addonModule: AddonModule = 'default' in rawModule ? rawModule.default : rawModule;

      if (!addonModule.name) {
        logger.warn(`Add-on in ${folderName} missing 'name' field, using folder name`);
        addonModule.name = folderName;
      }
      if (typeof addonModule.register !== 'function') {
        logger.error(`Add-on ${addonModule.name} missing required register() function, skipping`);
        return;
      }

      let manifest: AddonManifest | null = null;
      const pkgPath = path.join(addonPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
          manifest = (pkg.ngdpbase as AddonManifest) ?? null;
        } catch {
          logger.warn(`[AddonsManager] Could not parse package.json for ${folderName}`);
        }
      }

      // #927: canonical identity is the statically-declared slug (resolved the
      // SAME import-free way the boot validator uses), NOT the imported
      // module.name. The registry key, isEnabled config lookup, dedup and
      // dependency references all key off this. module.name is a display
      // label validated against it below.
      const canonicalId = resolveAddonSlug(addonPath, source);
      if (addonModule.name !== canonicalId) {
        const msg =
          `[AddonsManager] Add-on identity mismatch in ${folderName}: module name ` +
          `'${addonModule.name}' != canonical slug '${canonicalId}' (from package.json ` +
          `ngdpbase.slug or folder name). Using '${canonicalId}' as identity; config key is ` +
          `ngdpbase.addons.${canonicalId}.enabled. Align the module's name with the slug.`;
        // A domain addon's identity IS the site identity — a mismatch there is
        // far more dangerous, so surface it at error level.
        if (manifest?.type === 'domain') logger.error(msg);
        else logger.warn(msg);
      }

      if (this.addons.has(canonicalId)) {
        logger.warn(`[AddonsManager] Duplicate add-on '${canonicalId}' from ${sourceLabel} — skipping (already loaded)`);
        return;
      }

      const enabled = this.isEnabled(canonicalId);

      this.addons.set(canonicalId, {
        path: addonPath,
        module: addonModule,
        enabled,
        loaded: false,
        error: null,
        manifest
      });

      const label = addonModule.name === canonicalId ? canonicalId : `${canonicalId} (name: ${addonModule.name})`;
      logger.info(
        `📦 Discovered add-on: ${label} v${addonModule.version || 'unknown'} ` +
          `[${enabled ? 'enabled' : 'disabled'}] (${sourceLabel})`
      );
    } catch (err) {
      logger.error(`Failed to load add-on from ${folderName} (${sourceLabel}):`, err);
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
    let reseeded = 0;

    // #920: content-aware, edit-preserving reseed of already-seeded pages.
    // Opt-in (default false) so existing deployments' boot behavior is
    // unchanged; when enabled, a page is refreshed from the addon source only
    // when the source changed AND the instance copy is byte-identical to what
    // was last seeded (i.e. never operator-edited).
    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    const reseedEnabled = configManager?.getProperty('ngdpbase.addons.page-reseed', false) === true;

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

        // Resolve an existing instance page for this seed. Prefer UUID (survives
        // a slug rename — #908 B1), else fall back to slug. A match means the
        // page is already seeded; by default it is left untouched (operator edits
        // are never clobbered), with an optional edit-preserving reseed (#920).
        const existing = (await pageManager.getPageByUUID(uuid))
          ?? (pageManager.pageExists(slug) ? await pageManager.getPage(slug) : null);

        if (existing) {
          const existingMeta = (existing.metadata as Record<string, unknown> | undefined) ?? {};
          const existingSlug = (existingMeta.slug as string) || slug;
          const srcHash = pageSourceHash(parsed.content);
          const storedHash = existingMeta['addon-source-hash'];
          const hasHash = typeof storedHash === 'string' && storedHash.length > 0;
          // A legacy page (seeded before the #920 hash existed) has no stamp —
          // treated as reseedable since the previous body is kept as a
          // revertable version. Used only to pick the log message below.
          const legacy = !hasHash;
          // #931: single shared evaluator — the Required Pages Sync admin
          // surface computes status the identical way, so boot + UI cannot
          // disagree. `outdated` = source changed and the live body is
          // unmodified-since-seed (or legacy); `locally-modified` = edited, skip.
          const status = evaluateSeededAddonPage({
            sourceContent: parsed.content,
            liveContent: existing.content,
            storedHash: typeof storedHash === 'string' ? storedHash : undefined
          });

          if (reseedEnabled && status === 'outdated') {
            // Source is the authority. Merge existing metadata (preserve operator
            // /pipeline extras + original `created`) with the source's declared
            // fields, adopt the source body, keep the UUID, stamp the hash. Goes
            // through savePage so the versioning provider records a revertable
            // version.
            const reseedMetadata: Record<string, unknown> = {
              ...existingMeta,
              ...(parsed.data as Record<string, unknown>),
              addon: addonName,
              'system-category': (parsed.data as Record<string, unknown>)['system-category'] ?? existingMeta['system-category'] ?? 'addon',
              'addon-source-hash': srcHash
            };
            await pageManager.savePage(existingSlug, parsed.content, reseedMetadata);
            reseeded++;
            logger.info(legacy
              ? `[AddonsManager] Reseeded legacy '${existingSlug}' from ${addonName} (no prior source-hash; previous content kept in version history)`
              : `[AddonsManager] Reseeded '${existingSlug}' from ${addonName} (source changed, page unmodified)`);
          } else if (reseedEnabled && status === 'locally-modified') {
            logger.info(`[AddonsManager] Update available for '${existingSlug}' from ${addonName} but the page was locally modified — skipped`);
          } else {
            logger.debug(`[AddonsManager] Page '${existingSlug}' already seeded — skipping (${addonName})`);
          }

          // Keep the search index fresh regardless (page may predate a rebuild).
          const searchManager = this.engine.getManager<SearchManager>('SearchManager');
          if (searchManager) {
            const refreshed = await pageManager.getPage(existingSlug);
            if (refreshed) {
              await searchManager.updatePageInIndex(existingSlug, {
                name: existingSlug,
                content: refreshed.content,
                metadata: refreshed.metadata as Record<string, unknown>
              });
            }
          }
          continue;
        }

        // Seed through PageManager so all page providers (including VersioningFileProvider)
        // update their index correctly. `addon-source-hash` stamps the seeded
        // content so a later reseed can tell an unmodified page from an edited one.
        const metadata: Record<string, unknown> = {
          ...(parsed.data as Record<string, unknown>),
          addon: addonName,
          'system-category': (parsed.data as Record<string, unknown>)['system-category'] ?? 'addon',
          'addon-source-hash': pageSourceHash(parsed.content)
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

    if (seeded > 0 || reseeded > 0) {
      logger.info(`[AddonsManager] Seeded ${seeded} new + reseeded ${reseeded} page(s) from ${addonName}/pages/`);
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
   * Collect profile-page sections contributed by loaded addons (#534).
   *
   * Iterates every loaded addon that implements `profileSection()`, fans
   * out IN PARALLEL via `Promise.allSettled`, then packages results for
   * `profile.ejs`. Errors and `null` returns are skipped (malformed shapes
   * are logged so addon authors get a diagnostic instead of an invisibly-
   * missing card). One failing addon must not break the profile page.
   *
   * Mirrors the `getStatus()` pattern but runs in parallel so page-render
   * latency is bounded by the slowest addon, not the sum.
   *
   * Result order follows registration order of the addons map so the
   * displayed section order is stable across renders.
   */
  async getProfileSections(user: AddonProfileUser): Promise<AddonProfileSectionEntry[]> {
    const candidates = [...this.addons.entries()].filter(
      ([, addon]) => addon.loaded && typeof addon.module.profileSection === 'function'
    );

    // async IIFE per addon so a SYNCHRONOUS throw inside profileSection()
    // becomes a rejected promise, not an escaped throw out of the .map().
    // (Promise.resolve(fn()) would not catch the sync throw.)
    const settled = await Promise.allSettled(
      candidates.map(([, addon]) => (async () => addon.module.profileSection!(user))())
    );

    const sections: AddonProfileSectionEntry[] = [];
    for (let i = 0; i < settled.length; i++) {
      const entry = settled[i];
      const [name] = candidates[i];
      if (entry.status === 'rejected') {
        const err: unknown = entry.reason;
        logger.warn(
          `[AddonsManager] profileSection() failed for addon '${name}': ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }
      const result = entry.value;
      if (result === null) continue; // explicit opt-out — normal, no warn
      if (!result || typeof result.title !== 'string' || typeof result.html !== 'string') {
        logger.warn(
          `[AddonsManager] profileSection() for addon '${name}' returned malformed shape; expected {title:string, html:string} or null`
        );
        continue;
      }
      sections.push({ addonName: name, title: result.title, html: result.html });
    }
    return sections;
  }

  /**
   * Fan out `POST /preferences` body to every loaded addon that registered a
   * `saveProfileSection()` handler (#534).
   *
   * Runs SEQUENTIALLY — each addon's read-modify-write of user preferences
   * (typical implementation: `getUser → merge → updateUser`) must see the
   * previous addon's writes. Parallel execution would create a same-snapshot
   * race where two addons read identical preferences, each merge their own
   * keys, and the second writer clobbers the first writer's changes.
   * Self-inflicted by the original #534 PR; reverted to sequential here.
   *
   * (`getProfileSections()` above stays parallel — it's a read path with no
   * cross-addon write contention.)
   *
   * Body shape: the host normalizes whatever shape qs produced into FLAT
   * dotted keys before fan-out, so addons always see `body['journal.X']`
   * regardless of whether body-parser was configured with `allowDots: true`
   * (which would have produced `body.journal.X` instead). This is a
   * defensive contract — today's `express.urlencoded({ extended: true })`
   * leaves dotted form-field names flat by default, but a future config
   * change shouldn't silently break addons. See `flattenDottedKeys`.
   *
   * Errors are caught per-addon and logged so one bad addon cannot block
   * other addons' saves or the core-preferences save.
   */
  async saveProfileSections(username: string, body: Record<string, unknown>): Promise<void> {
    const flatBody = flattenDottedKeys(body);

    for (const [name, addon] of this.addons) {
      if (!addon.loaded || typeof addon.module.saveProfileSection !== 'function') continue;

      try {
        await addon.module.saveProfileSection(username, flatBody);
      } catch (err) {
        logger.warn(
          `[AddonsManager] saveProfileSection() failed for addon '${name}': ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
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

