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
import { systemPrincipalOf } from '../context/bootActions.js';
import type { ActorContext } from '../context/ActorContext.js';
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
   *
   * __Since #1234 the first argument is the caller's context, not a name.__
   * `ctx` is the request's subject (`PermissionSubject`: `username`, `roles`,
   * `isAuthenticated`, `ipAddress`, `viaToken` / `viaShare` when delegated)
   * — forward it to whatever you write (`userManager.updateUser(ctx.username,
   * updates, ctx)`), never rebuild one from `ctx.username`. An addon still
   * written against the old `(username, body)` shape gets a warning at load
   * naming it; its saves then fail per call and are logged.
   */
  saveProfileSection?(ctx: ActorContext, body: Record<string, unknown>): Promise<void> | void;

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

    // Runs after loading so every enabled addon's pages/ dir is known. Cheap —
    // walks only addon source pages, never the whole page tree — and makes
    // orphan detection work on instances seeded before `addon` was indexed.
    try {
      await this.backfillIndexAddonStamps();
    } catch (err) {
      // Never let a back-fill failure block startup; detection simply stays
      // as blind as it was before.
      logger.warn('[AddonsManager] Could not back-fill addon index stamps:', err);
    }

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
      this.warnOldProfileHook(canonicalId, addonModule);

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

    for (const key of Object.keys(allProps)) {
      if (key.startsWith(prefix)) {
        // Read back through getProperty rather than using the raw merged value,
        // so `$VAR` / `${VAR}` env-refs (#775) resolve for addon config the same
        // way they do everywhere else. getAllProperties() returns mergedConfig
        // verbatim, so taking the value from there handed addons the literal
        // placeholder: the shipped `ngdpbase.addons.forms.dataPath` of
        // "${FAST_STORAGE}/forms" reached the forms addon unexpanded and it
        // created a directory named `${FAST_STORAGE}` on disk. Without this,
        // an operator putting an addon secret in .env gets the literal string
        // "$MY_VAR" as the value — silently, which is worse than unsupported.
        // Per-key tolerance: a bare `$VAR` ref naming an unset variable throws.
        // One such key must not take the whole addon down — an addon whose
        // optional API token is unconfigured should still load its pages and
        // routes. Warn loudly and omit the key so the addon's own default or
        // its "not configured" branch takes over.
        try {
          setDeep(config, key.slice(prefix.length), configManager.getProperty(key));
        } catch (error) {
          logger.warn(
            `[AddonsManager] ${addonName}: config key '${key}' could not be resolved and was omitted — ` +
            (error instanceof Error ? error.message : String(error))
          );
        }
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
  /**
   * Default edit-protection for a seeded addon page (#971, addons.md §3).
   *
   * §3 settled the mechanism: the seeder stamps frontmatter `access`, which
   * Tier 1 of the evaluator honours directly, needs no `PolicyEvaluator`
   * change, and is hash-neutral (`pageSourceHash` covers the body only, so
   * adding metadata cannot disturb the #920 reseed comparison).
   *
   * §9 settled *who owns what*, and the two must be read together. A blanket
   * admin lock would contradict the operator's decision that domain content
   * pages "should be normal pages, purely seeded by the addon" — the addon
   * provides a starting corpus and then lets go. So the default follows §9's
   * ownership column rather than locking everything:
   *
   * | Category | Purpose | Default |
   * |---|---|---|
   * | `system` | Feature UI, site chrome — infrastructure | admin-only edit |
   * | `documentation` | Help / docs — addon-owned | admin-only edit |
   * | `general` | Domain content, demo — **instance-owned** | no stamp |
   * | anything else | unclassified, treated as addon-owned | admin-only edit |
   *
   * An addon can always override by declaring its own `access`, which is the
   * documented escape hatch in §3 and the reason the default is a default.
   *
   * @param category - The page's resolved `system-category`
   * @returns The access object to stamp, or undefined to leave the page unprotected
   */
  private defaultAddonPageAccess(category: unknown): { edit: string[] } | undefined {
    // Instance-owned per §9 — seeded as a starting point, then editable by
    // whoever normally edits pages on this site.
    if (category === 'general') return undefined;
    return { edit: ['admin'] };
  }

  /**
   * Surface a page-level seed failure beyond the boot log (#951).
   *
   * A boot-time log line is invisible ten minutes later, which is how a page
   * that never seeded stays missing for weeks. Raising an operator
   * notification makes the failure outlive the boot it happened on.
   *
   * Deliberately NOT fail-fast. Refusing to start because a third-party addon
   * shipped one malformed page turns an authoring typo into an outage, and the
   * #672 precedent does not transfer — that was the operator's own config
   * naming a nonexistent addon, which the operator can fix. A vendor's
   * malformed file is not in the operator's control. Skip the page, report
   * loudly, surface it after boot.
   *
   * Best-effort: notification failure must never break seeding.
   */
  private recordSeedFailure(
    addonName: string,
    file: string,
    reason: 'missing-or-invalid-uuid' | 'duplicate-uuid' | 'missing-slug',
    isDomain: boolean
  ): void {
    try {
      const notificationManager = this.engine.getManager<{
        createNotification?: (n: Record<string, unknown>) => Promise<unknown>;
          }>('NotificationManager');

      void notificationManager?.createNotification?.({
        type: 'system',
        level: isDomain ? 'error' : 'warning',
        title: `Add-on page not seeded (${addonName})`,
        message:
          `${addonName}/pages/${file} was skipped: ${reason}. The page will not appear on this site.` +
          (isDomain ? ' This is a domain add-on, so the site may be incomplete.' : '')
      })?.catch?.(() => { /* non-fatal */ });
    } catch {
      // non-fatal
    }
  }

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

    // #951: a domain addon's page failing to seed is a broken site; the same
    // failure in an additive addon is a missing help page. Line ~535 already
    // draws exactly this distinction for identity mismatch — page seeding now
    // follows it instead of flattening both to `warn`.
    const isDomain = this.addons.get(addonName)?.manifest?.type === 'domain';
    const reportSkip = (message: string): void => {
      if (isDomain) logger.error(message);
      else logger.warn(message);
    };

    // #951: guard against two source pages sharing a uuid — the obvious
    // copy-paste mistake when creating a page from an existing one. Without
    // this the second file matches the first's already-seeded page and is
    // silently skipped, so ONE PAGE SIMPLY NEVER APPEARS and the only trace is
    // a debug line phrased as normal operation. With reseed enabled it is
    // worse: the two files fight over one page and the winner depends on
    // filesystem ordering.
    const seenUuids = new Map<string, string>();

    for (const file of files) {
      const src = path.join(addonPagesDir, file);
      try {
        const raw = await fs.promises.readFile(src, 'utf8');
        const parsed = matter(raw);
        const uuid = parsed.data.uuid as string | undefined;
        const slug = parsed.data.slug as string | undefined;

        if (!uuid || !uuidPattern.test(uuid)) {
          reportSkip(
            `[AddonsManager] Skipping ${addonName}/pages/${file} — missing or invalid uuid in ` +
            'frontmatter. The addon owns page uuids and they are mandatory; this page will not appear.'
          );
          this.recordSeedFailure(addonName, file, 'missing-or-invalid-uuid', isDomain);
          continue;
        }

        const duplicateOf = seenUuids.get(uuid.toLowerCase());
        if (duplicateOf) {
          reportSkip(
            `[AddonsManager] Skipping ${addonName}/pages/${file} — uuid ${uuid} is already used by ` +
            `${duplicateOf}. Two source pages cannot share a uuid: one of them would never appear, ` +
            'and with reseed enabled they fight over the same page. Give this page its own uuid.'
          );
          this.recordSeedFailure(addonName, file, 'duplicate-uuid', isDomain);
          continue;
        }
        seenUuids.set(uuid.toLowerCase(), file);

        if (!slug) {
          reportSkip(
            `[AddonsManager] Skipping ${addonName}/pages/${file} — missing slug in frontmatter`
          );
          this.recordSeedFailure(addonName, file, 'missing-slug', isDomain);
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

          // #971 backfill: pages seeded before `access` stamping existed carry
          // none, so §3's admin-only editing simply does not apply to them —
          // they are silently unprotected while looking identical to pages that
          // are. §2 called for exactly this: a one-time pass keyed on uuid match
          // against addon sources, which is what resolving `existing` above
          // already did.
          //
          // Runs regardless of the reseed setting. Reseed governs whether the
          // addon may overwrite page CONTENT — a different and much riskier
          // question than attaching the protection the page should have shipped
          // with. Gating the backfill behind an opt-in that defaults to false
          // would leave every existing deployment permanently unprotected.
          //
          // Metadata-only: the body is passed through untouched, and
          // pageSourceHash covers the body alone, so this cannot disturb the
          // #920 reseed comparison or mark the page locally-modified.
          //
          // Fires once. After the stamp lands the condition is false forever.
          // The exception is an operator who DELETES `access` outright — that
          // gets re-added on the next boot. Setting `access` to something else
          // (a wider principal list) is preserved, and is the supported way to
          // open a page up.
          // #1003: `system-category` drift. A category-only edit in an addon
          // source never reached an already-seeded page — `evaluateSeededAddonPage`
          // compares BODY content, so a metadata-only change never flips a page
          // to `outdated` and the reseed branch below never runs. Categories set
          // at first seed were therefore frozen forever, which is how all 16
          // geohazardwatch pages stayed on the flattened `addon` default after
          // their source was corrected per addons.md §9.
          //
          // Corrected here, independent of the body-hash comparison and of
          // `reseedEnabled` — reseed governs overwriting CONTENT, and a category
          // is metadata, the same argument #971 made for `access`.
          //
          // `addon-source-category` records the source value last propagated —
          // the category analogue of `addon-source-hash`. It makes this
          // one-time-PER-DRIFT rather than every-boot: once the source value has
          // been applied, an operator who re-categorizes the page keeps their
          // choice, and the addon only speaks again when ITS value changes.
          // Without that marker this would revert an operator's category on
          // every restart.
          const sourceCategoryRaw = (parsed.data as Record<string, unknown>)['system-category'];
          const sourceCategory = typeof sourceCategoryRaw === 'string' ? sourceCategoryRaw : undefined;
          const liveCategory = existingMeta['system-category'];
          const appliedCategory = existingMeta['addon-source-category'];
          const categoryDrifted = sourceCategory !== undefined
            && sourceCategory !== liveCategory
            && appliedCategory !== sourceCategory;

          // Source first, then whatever the page already carries — matching the
          // reseed path below. The original order here was existing-first, so a
          // corrected source category was ignored in favour of the stale live
          // one even though the right value was sitting in `parsed.data` (#1003).
          // Narrow rather than String()-coerce: a non-string category is
          // malformed frontmatter, and coercing an object would both log
          // "[object Object]" and silently classify it as unclassified
          // without saying so. Treat it as unclassified explicitly.
          const rawCategory = sourceCategoryRaw ?? liveCategory ?? 'addon';
          const backfillCategory = typeof rawCategory === 'string' ? rawCategory : 'addon';

          // Both corrections go through ONE savePage so a page needing each does
          // not get two versions for what is a single reconciliation.
          const metaPatch: Record<string, unknown> = {};
          const reasons: string[] = [];
          // Removal, not an assignment — carried separately because spreading
          // `access: undefined` would leave the key present for the YAML
          // serializer to render, which is not the same as deleting it.
          let clearAccess = false;

          if (categoryDrifted) {
            metaPatch['system-category'] = sourceCategory;
            metaPatch['addon-source-category'] = sourceCategory;
            reasons.push(`system-category ${JSON.stringify(liveCategory ?? null)} → '${sourceCategory}' (#1003)`);

            // #1003 remediation: undo an `access` stamp that only exists because
            // Bug 1 resolved the category from the stale live value.
            //
            // The 12 geohazardwatch pages §9 designates instance-owned were
            // stamped admin-only because they still read `addon` when the #971
            // backfill ran. Correcting the category alone does not release them:
            // that backfill fires only on `access === undefined`, so it never
            // revisits a page it already stamped.
            //
            // Loosening a permission, so the conditions are deliberately narrow —
            // ALL must hold:
            //   * the category drifted (⇒ this is a page the bug operated on)
            //   * the CORRECTED category maps to no stamp at all (`general`)
            //   * the source does not declare its own `access` — an addon's
            //     explicit value is authoritative and is never removed
            //   * the live `access` is byte-identical to what the STALE category
            //     would have produced ⇒ it is the machine's output
            //
            // The last is the honest limit of this: frontmatter cannot prove
            // authorship, so an operator who independently set exactly
            // `{edit:['admin']}` on a page whose category also drifted is
            // indistinguishable from the bug's output and would be cleared. That
            // is the narrowest rule available, not a perfect one.
            //
            // Self-limiting: once cleared, the next boot sees `access` undefined
            // with category `general`, and defaultAddonPageAccess returns nothing
            // for `general` — so it stays cleared rather than oscillating.
            const correctedDefault = this.defaultAddonPageAccess(sourceCategory);
            const staleDefault = this.defaultAddonPageAccess(
              typeof liveCategory === 'string' ? liveCategory : 'addon'
            );
            const sourceDeclaresAccess = (parsed.data as Record<string, unknown>)['access'] !== undefined;
            const looksMachineStamped = staleDefault !== undefined
              && JSON.stringify(existingMeta.access) === JSON.stringify(staleDefault);

            if (correctedDefault === undefined && !sourceDeclaresAccess && looksMachineStamped) {
              clearAccess = true;
              reasons.push(
                `cleared access edit=[${staleDefault.edit.join(', ')}] stamped from the stale ` +
                `category '${String(liveCategory)}' — '${sourceCategory}' is instance-owned (#1003)`
              );
            }
          }

          // #971 backfill: pages seeded before `access` stamping existed carry
          // none, so §3's admin-only editing simply does not apply to them —
          // they are silently unprotected while looking identical to pages that
          // are.
          //
          // Fires once. After the stamp lands the condition is false forever.
          // The exception is an operator who DELETES `access` outright — that
          // gets re-added on the next boot. Setting `access` to something else
          // (a wider principal list) is preserved, and is the supported way to
          // open a page up.
          if (existingMeta.access === undefined) {
            const backfillAccess = this.defaultAddonPageAccess(backfillCategory);
            if (backfillAccess) {
              metaPatch.access = backfillAccess;
              reasons.push(`access edit=[${backfillAccess.edit.join(', ')}] for category='${backfillCategory}' (#971)`);
            }
          }

          if (Object.keys(metaPatch).length > 0 || clearAccess) {
            // Metadata-only: the body is passed through untouched, and
            // pageSourceHash covers the body alone, so this cannot disturb the
            // #920 reseed comparison or mark the page locally-modified.
            const reconciled: Record<string, unknown> = { ...existingMeta, ...metaPatch };
            if (clearAccess) delete reconciled.access;

            await pageManager.savePage(existingSlug, existing.content, reconciled, { skipValidation: true });
            // Keep the in-memory copy consistent — the reseed branch below reads
            // existingMeta again, and would otherwise re-apply a stale category
            // or resurrect the access we just cleared.
            Object.assign(existingMeta, metaPatch);
            if (clearAccess) delete existingMeta.access;
            logger.info(
              `[AddonsManager] Reconciled '${existingSlug}' (${addonName}): ${reasons.join('; ')}`
            );
          }

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
            const reseedCategory = (parsed.data as Record<string, unknown>)['system-category']
              ?? existingMeta['system-category'] ?? 'addon';
            // #971: source first, then whatever the page already carries — an
            // operator who deliberately opened a page up must not have that
            // reverted by a routine reseed. Only a page with no `access` at all
            // (seeded before this existed) picks up the default.
            const reseedAccess = (parsed.data as Record<string, unknown>)['access']
              ?? existingMeta['access']
              ?? this.defaultAddonPageAccess(reseedCategory);

            const reseedMetadata: Record<string, unknown> = {
              ...existingMeta,
              ...(parsed.data as Record<string, unknown>),
              addon: addonName,
              'system-category': reseedCategory,
              // #1003: keep the marker truthful — it must always name the source
              // category most recently applied, whichever path applied it.
              ...(typeof reseedCategory === 'string' ? { 'addon-source-category': reseedCategory } : {}),
              ...(reseedAccess ? { access: reseedAccess } : {}),
              'addon-source-hash': srcHash
            };
            // #1197: savePage records page-edit under `metadata.editor`; the
            // system principal, not a literal, is who reseeded it.
            reseedMetadata.editor = systemPrincipalOf(this.engine);
            await pageManager.savePage(existingSlug, parsed.content, reseedMetadata, { skipValidation: true });
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
                metadata: refreshed.metadata
              });
            }
          }
          continue;
        }

        // Seed through PageManager so all page providers (including VersioningFileProvider)
        // update their index correctly. `addon-source-hash` stamps the seeded
        // content so a later reseed can tell an unmodified page from an edited one.
        const seedCategory = (parsed.data as Record<string, unknown>)['system-category'] ?? 'addon';
        // #971: stamp `access` only when the source is silent, so an addon can
        // ship a deliberately community-editable page.
        const seedAccess = (parsed.data as Record<string, unknown>)['access']
          ?? this.defaultAddonPageAccess(seedCategory);

        const metadata: Record<string, unknown> = {
          ...(parsed.data as Record<string, unknown>),
          addon: addonName,
          'system-category': seedCategory,
          // #1003: record the source category applied at seed time. Without
          // this a freshly seeded page has no marker, so the first time an
          // operator re-categorized it the drift check on the next boot would
          // read that as "the addon's value has not been applied yet" and
          // revert them.
          'addon-source-category': seedCategory,
          ...(seedAccess ? { access: seedAccess } : {}),
          'addon-source-hash': pageSourceHash(parsed.content)
        };

        // skipValidation: this is content the addon SHIPS, not user input.
        // Seeding runs during startup, so a content rule aimed at page authors
        // must never be able to stop the instance booting (#1037).
        // #1197: savePage records page-create under `metadata.editor`; the
        // system principal, not a literal, is who seeded it.
        (metadata).editor = systemPrincipalOf(this.engine);
        await pageManager.savePage(slug, parsed.content, metadata, { skipValidation: true });

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

      // #1220: an addon's config/default-config.json is a layer of the
      // configuration merge, folded in by ConfigurationManager at load, so it
      // is already visible here — and to the managers that copied the
      // catalogs at boot, which the old runtime injection never reached.

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
   * #1234: say at load when an addon still implements the pre-#1234 hook.
   *
   * The two shapes have the same arity, so the only tell is the name the
   * addon gave its first parameter — a heuristic, and stated as one. A false
   * negative costs nothing new: the save still fails per call and is logged
   * by `saveProfileSections`. A hit turns that silent stop into a boot line
   * naming the addon and the migration.
   */
  private warnOldProfileHook(addonName: string, module: AddonModule): void {
    // Read the source text only — the hook is never called or detached here.
    const hook = (module as { saveProfileSection?: unknown }).saveProfileSection;
    if (typeof hook !== 'function') return;
    const source = Function.prototype.toString.call(hook);
    const first = /^(?:async\s*)?(?:function\s*[\w$]*\s*)?\(?\s*([A-Za-z_$][\w$]*)/.exec(source)?.[1];
    if (first && /^(username|user|userName|name|login|by)$/.test(first)) {
      logger.warn(
        `[AddonsManager] Add-on '${addonName}' implements saveProfileSection(${first}, body) — since #1234 the first argument is the caller's context ` +
        '(a PermissionSubject: username, roles, isAuthenticated, ipAddress, viaToken/viaShare). Its profile-section saves will fail until it is updated to (ctx, body).'
      );
    }
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
  async saveProfileSections(ctx: ActorContext, body: Record<string, unknown>): Promise<void> {
    const flatBody = flattenDottedKeys(body);

    for (const [name, addon] of this.addons) {
      if (!addon.loaded || typeof addon.module.saveProfileSection !== 'function') continue;

      try {
        // #1234: the caller's context, forwarded — the addon writes on its behalf.
        await addon.module.saveProfileSection(ctx, flatBody);
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
   * #930: addon-seeded instance pages whose source file the addon **no longer
   * ships** ("source removed"). Leave-and-flag — this only *detects*; nothing is
   * deleted here. The admin surface surfaces these and offers an opt-in,
   * versioned removal.
   *
   * Enumeration uses the indexed `system-category: addon` (via the search index)
   * to narrow to addon pages — a small candidate set — instead of scanning the
   * whole page store. Each candidate is attributed to its addon via the `addon`
   * frontmatter stamp and diffed against that addon's CURRENT source UUID set.
   * If search is unavailable, returns `[]` (detection is best-effort, never a
   * source of deletions).
   */
  async findOrphanedAddonPages(): Promise<Array<{
    addonName: string;
    uuid: string;
    slug: string;
    title: string;
    userModified: boolean;
  }>> {
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    if (!pageManager) return [];
    // Deliberately no SearchManager dependency — see the candidate-selection
    // comment below.

    // Current source UUID set for each enabled addon that ships pages.
    const sourceUuidsByAddon = new Map<string, Set<string>>();
    for (const { name, pagesDir } of this.getEnabledAddonPagesDirectories()) {
      const set = new Set<string>();
      try {
        for (const f of await fs.promises.readdir(pagesDir)) {
          if (!f.endsWith('.md')) continue;
          try {
            const u = (matter(await fs.promises.readFile(path.join(pagesDir, f), 'utf8')).data.uuid) as string | undefined;
            if (u) set.add(u);
          } catch { /* skip unreadable/invalid source file */ }
        }
      } catch { /* addon ships no pages/ dir */ }
      sourceUuidsByAddon.set(name, set);
    }
    if (sourceUuidsByAddon.size === 0) return [];

    // Candidates come from the page index's `addon` stamp, not from
    // `searchByCategory('addon')`.
    //
    // The category route had two holes: a seeded page declaring any other
    // `system-category` (the `forms` page declares `documentation`) was never a
    // candidate, and when SearchManager was unavailable detection silently
    // returned nothing. The §9 re-categorisation would have widened the first
    // hole further. `addon` is stamped unconditionally by the seeder, so it is
    // the reliable discriminator.
    const indexed = pageManager.getAddonSeededIndexEntries();

    const orphans: Array<{ addonName: string; uuid: string; slug: string; title: string; userModified: boolean }> = [];
    const seen = new Set<string>();
    for (const entry of indexed) {
      if (seen.has(entry.uuid)) continue;
      seen.add(entry.uuid);
      const sourceSet = sourceUuidsByAddon.get(entry.addon);
      if (!sourceSet) continue; // not an enabled addon (or ships no pages) — don't flag
      if (sourceSet.has(entry.uuid)) continue; // still shipped upstream

      // Only read the page for the few that are actually orphaned, to pick up
      // `user-modified` — the index does not carry it.
      let userModified = false;
      try {
        const page = await pageManager.getPage(entry.slug || entry.title);
        const meta = (page?.metadata as Record<string, unknown> | undefined) ?? {};
        userModified = meta['user-modified'] === true;
      } catch { /* page unreadable — still report it as orphaned */ }

      orphans.push({
        addonName: entry.addon,
        uuid: entry.uuid,
        slug: entry.slug || entry.title,
        title: entry.title,
        userModified
      });
    }
    return orphans;
  }

  /**
   * Back-fill the page index's `addon` stamp for pages seeded before the field
   * was indexed.
   *
   * Without this, orphan detection is blind on any existing instance: the field
   * is written on save, and seeded pages are deliberately not re-saved once
   * they exist. Cheap — it walks only each addon's own source pages (tens of
   * files), never the whole page tree.
   */
  private async backfillIndexAddonStamps(): Promise<void> {
    const pageManager = this.engine.getManager<PageManager>('PageManager');
    if (!pageManager?.setIndexAddon) return;

    let stamped = 0;
    for (const { name, pagesDir } of this.getEnabledAddonPagesDirectories()) {
      let files: string[];
      try {
        files = (await fs.promises.readdir(pagesDir)).filter(f => f.endsWith('.md'));
      } catch { continue; }
      for (const f of files) {
        try {
          const uuid = matter(await fs.promises.readFile(path.join(pagesDir, f), 'utf8')).data.uuid as string | undefined;
          if (!uuid) continue;
          if (await pageManager.setIndexAddon(uuid, name)) stamped++;
        } catch { /* skip unreadable source file */ }
      }
    }
    if (stamped > 0) {
      logger.info(`[AddonsManager] Back-filled 'addon' index stamp on ${stamped} seeded page(s)`);
    }
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

