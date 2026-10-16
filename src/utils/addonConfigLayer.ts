/**
 * Addon defaults as a layer of the configuration merge (#1220).
 *
 * Every addon may ship `config/default-config.json`. Until #1220 those keys
 * were injected at runtime, after the engine had initialised, whole-key and
 * only when absent — so an addon could set its own settings but never add an
 * entry to a catalog map such as `ngdpbase.permissions.definitions` or
 * `ngdpbase.access.policies`, and the managers that copy those catalogs at
 * boot never saw anything an addon said.
 *
 * Now the addon files are a layer between the shipped defaults and the
 * operator's custom file:
 *
 *     merged = deepMerge(deepMerge(shipped, addons…), custom)
 *
 * The deep merge merges maps per entry and `id` arrays by id, so an addon adds
 * a permission definition and its own policy additively and never touches a
 * shipped entry. The operator's file still wins over everything.
 *
 * Discovery follows `ngdpbase.managers.addons-manager.addons-path` exactly as
 * AddonsManager does — directories and `node_modules:` patterns — so bundled
 * and external addons are treated alike. Only an addon whose
 * `ngdpbase.addons.<slug>.enabled` is true in the shipped+custom view
 * contributes; a disabled addon's opinions do not reach the catalog.
 *
 * One exception, `ngdpbase.system-category` (#1559): the system-categories an
 * addon declares are read from every installed addon's file, enabled or not,
 * so turning an addon off never makes its pages and vault unreachable. A
 * turned-off addon's entries are not offered (`enabled: false`); each entry is
 * stamped with its `owner`, the addon's slug, and the owner's declaration of
 * the fields in OWNER_DECIDED_FIELDS stands over the operator's file. An entry
 * that claims another owner, reuses another entry's key or vault, or has a
 * value of the wrong type is refused, with a problem line naming it.
 */

import fs from 'fs';
import path from 'path';
import { isDeepStrictEqual } from 'util';
import { configFilePaths, deepMergeConfigs, deepMergeObjects, isPlainObject, readConfigFilesSync } from './configFiles.js';
import { findNodeModulesDir, matchNpmPackageDirs, resolveAddonSlug, splitAddonsPath } from './addonsPathResolver.js';
import { parsePrivatestore } from './privateStorePath.js';
import { OWNER_DECIDED_FIELDS, SYSTEM_CATEGORY_KEY, systemCategoryValueProblems } from './systemCategoryRules.js';

export const ADDONS_PATH_KEY = 'ngdpbase.managers.addons-manager.addons-path';
export const ADDONS_MANAGER_ENABLED_KEY = 'ngdpbase.managers.addons-manager.enabled';

export interface AddonDefaults {
  slug: string;
  dir: string;
  source: 'directory' | 'npm';
  /**
   * Whether the addon is switched on. A turned-off addon's file is read for its
   * system-categories alone (#1559); none of its other keys reach the merge.
   */
  enabled: boolean;
  /** The addon's default-config.json with `_`-prefixed comment keys dropped. */
  defaults: Record<string, unknown>;
  /** Set when the file exists but could not be parsed; the addon then contributes nothing. */
  error?: string;
}

/** Is this addon switched on in the shipped+custom view? */
export function isAddonEnabled(base: Record<string, unknown>, slug: string): boolean {
  return base[`ngdpbase.addons.${slug}.enabled`] === true;
}

/** Every addon directory the configured path names, whether or not it is enabled. */
export function discoverAddonDirs(base: Record<string, unknown>, cwd: string = process.cwd()): Array<{ dir: string; source: 'directory' | 'npm' }> {
  if (base[ADDONS_MANAGER_ENABLED_KEY] === false) return [];
  const { directories, npmPatterns } = splitAddonsPath(base[ADDONS_PATH_KEY] ?? './addons');
  const found: Array<{ dir: string; source: 'directory' | 'npm' }> = [];

  for (const raw of directories) {
    const root = path.resolve(cwd, raw);
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'shared') continue;
      found.push({ dir: path.join(root, entry.name), source: 'directory' });
    }
  }

  const nmRoot = npmPatterns.length > 0 ? findNodeModulesDir(cwd) : null;
  if (nmRoot) {
    for (const pattern of npmPatterns) {
      for (const dir of matchNpmPackageDirs(nmRoot, pattern)) found.push({ dir, source: 'npm' });
    }
  }
  return found;
}

/**
 * The defaults of every installed addon, enabled or not, in discovery order,
 * each marked with whether it is `enabled`: the merge takes everything from
 * an enabled addon and only the system-categories from a turned-off one
 * (#1559). An addon with no default-config.json is omitted; one whose file
 * cannot be parsed is returned with `error` set so the caller can say so
 * rather than silently skip it.
 */
export function discoverAddonDefaults(base: Record<string, unknown>, cwd: string = process.cwd()): AddonDefaults[] {
  const out: AddonDefaults[] = [];
  for (const { dir, source } of discoverAddonDirs(base, cwd)) {
    const slug = resolveAddonSlug(dir, source);
    const enabled = isAddonEnabled(base, slug);
    const file = path.join(dir, 'config', 'default-config.json');
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
      if (!isPlainObject(raw)) throw new Error('not a JSON object');
      const defaults: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(raw)) if (!key.startsWith('_')) defaults[key] = value;
      out.push({ slug, dir, source, enabled, defaults });
    } catch (err) {
      out.push({ slug, dir, source, enabled, defaults: {}, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

interface AddonCategoryLayer {
  /** The accepted entries, by key, each stamped with its `owner`. */
  entries: Record<string, Record<string, unknown>>;
  /** Keys whose addon is turned off: never offered, whatever the operator's file says. */
  turnedOff: Set<string>;
  problems: string[];
}

function vaultIdOf(entry: unknown): string | undefined {
  return parsePrivatestore((entry as { storageLocation?: { privatestore?: unknown } } | null)?.storageLocation?.privatestore)?.vaultId;
}

/**
 * The system-categories the addons declare (#1559), from every addon's file
 * whether or not it is enabled. `shipped` and `custom` are the site's own
 * category maps: an addon may not take a key the shipped map has, nor a vault
 * another entry names.
 */
function addonCategoryLayer(shipped: unknown, custom: unknown, addons: readonly AddonDefaults[]): AddonCategoryLayer {
  const siteKeys = new Set(isPlainObject(shipped) ? Object.keys(shipped) : []);
  const vaultKey = new Map<string, string>();
  for (const map of [shipped, custom]) {
    if (!isPlainObject(map)) continue;
    for (const [key, entry] of Object.entries(map)) {
      const vaultId = vaultIdOf(entry);
      if (vaultId && !vaultKey.has(vaultId)) vaultKey.set(vaultId, key);
    }
  }

  const layer: AddonCategoryLayer = { entries: {}, turnedOff: new Set(), problems: [] };
  const declaredBy = new Map<string, string>();
  for (const addon of addons) {
    const declared = addon.defaults[SYSTEM_CATEGORY_KEY];
    if (declared === undefined) continue;
    const who = `add-on '${addon.slug}'${addon.enabled ? '' : ' (turned off)'}`;
    if (!isPlainObject(declared)) {
      layer.problems.push(`${who}: ${SYSTEM_CATEGORY_KEY} must be a map of entries; it is refused`);
      continue;
    }
    for (const [key, entry] of Object.entries(declared)) {
      const reasons: string[] = [];
      if (!isPlainObject(entry)) {
        reasons.push('the entry is not an object');
      } else {
        if (entry.owner !== undefined && entry.owner !== addon.slug) {
          reasons.push(`its owner is ${JSON.stringify(entry.owner)}; an add-on declares only its own, owner '${addon.slug}'`);
        }
        if (siteKeys.has(key)) reasons.push(`'${key}' is one of the site's own system-categories`);
        else if (declaredBy.has(key)) reasons.push(`add-on '${declaredBy.get(key)}' already declares '${key}'`);
        if (entry.default === true) reasons.push('default: true belongs to the site\'s default system-category only');
        const privatestore = (entry.storageLocation as { privatestore?: unknown } | undefined)?.privatestore;
        const vaultId = vaultIdOf(entry);
        if (privatestore !== undefined && !vaultId) {
          reasons.push(`storageLocation.privatestore must be pages/<parent>/{user}/<vault id>/, got ${JSON.stringify(privatestore)}`);
        } else if (vaultId && vaultKey.has(vaultId) && vaultKey.get(vaultId) !== key) {
          reasons.push(`its vault '${vaultId}' is already the vault of system-category '${vaultKey.get(vaultId)}'`);
        }
        reasons.push(...systemCategoryValueProblems(key, entry));
      }
      if (reasons.length > 0) {
        layer.problems.push(`${who}: system-category '${key}' is refused (${reasons.join('; ')})`);
        continue;
      }
      const accepted: Record<string, unknown> = { ...(entry as Record<string, unknown>), owner: addon.slug };
      if (!addon.enabled) {
        accepted.enabled = false;
        layer.turnedOff.add(key);
      }
      layer.entries[key] = accepted;
      declaredBy.set(key, addon.slug);
      const vaultId = vaultIdOf(accepted);
      if (vaultId) vaultKey.set(vaultId, key);
    }
  }
  return layer;
}

/**
 * The owner's declaration stands (operator, 2026-09-29): for each entry an
 * addon declared, the fields in OWNER_DECIDED_FIELDS are the addon's, never
 * the operator's file's, and a turned-off addon's entry is never offered.
 * Returns the merged map with that applied, and a line for each value of the
 * operator's that is ignored.
 */
function ownerDeclarationsStand(merged: unknown, layer: AddonCategoryLayer, custom: unknown): { categories: unknown; problems: string[] } {
  if (!isPlainObject(merged)) return { categories: merged, problems: [] };
  const categories: Record<string, unknown> = { ...merged };
  const problems: string[] = [];
  for (const [key, declared] of Object.entries(layer.entries)) {
    const entry = categories[key];
    if (!isPlainObject(entry)) continue;
    const site = isPlainObject(custom) && isPlainObject(custom[key]) ? custom[key] : {};
    const restored: Record<string, unknown> = { ...entry };
    for (const field of OWNER_DECIDED_FIELDS) {
      if (declared[field] === undefined) delete restored[field];
      else restored[field] = declared[field];
      if (site[field] !== undefined && !isDeepStrictEqual(site[field], declared[field])) {
        problems.push(`app-custom-config.json sets ${SYSTEM_CATEGORY_KEY}.${key}.${field}, which is the declaration of its owner '${String(declared.owner)}'; the site's value is ignored`);
      }
    }
    if (layer.turnedOff.has(key)) restored.enabled = false;
    categories[key] = restored;
  }
  return { categories, problems };
}

/**
 * shipped ⊕ addons ⊕ custom, in that order of precedence (custom wins), with
 * the problems found in the addons' system-categories (#1559).
 *
 * Each enabled addon folds onto the shipped defaults in turn, not onto the
 * other addons alone: an addon's list of names for a set map (`secret-keys`)
 * then adds to the shipped set, and a second addon's list adds again rather
 * than replacing the first (#1612). `ngdpbase.system-category` is taken from
 * every addon, enabled or not, through {@link addonCategoryLayer}, and its
 * owner-decided fields stand over custom.
 */
export function mergeWithAddonLayer<T extends Record<string, unknown>>(
  shipped: T,
  addons: readonly AddonDefaults[],
  custom: Partial<T>
): { merged: T; problems: string[] } {
  const customCategories = (custom as Record<string, unknown>)[SYSTEM_CATEGORY_KEY];
  const layer = addonCategoryLayer(shipped[SYSTEM_CATEGORY_KEY], customCategories, addons);
  const withAddons = addons
    .filter((a) => a.enabled)
    .reduce<Record<string, unknown>>((acc, a) => {
      const rest = { ...a.defaults };
      delete rest[SYSTEM_CATEGORY_KEY];
      return deepMergeObjects(acc, rest);
    }, shipped);
  if (Object.keys(layer.entries).length === 0) {
    return { merged: deepMergeConfigs(withAddons as T, custom), problems: layer.problems };
  }
  const shippedCategories = isPlainObject(withAddons[SYSTEM_CATEGORY_KEY]) ? withAddons[SYSTEM_CATEGORY_KEY] : {};
  const layered = { ...withAddons, [SYSTEM_CATEGORY_KEY]: deepMergeObjects(shippedCategories, layer.entries) };
  const merged = deepMergeObjects(layered, custom);
  const stood = ownerDeclarationsStand(merged[SYSTEM_CATEGORY_KEY], layer, customCategories);
  merged[SYSTEM_CATEGORY_KEY] = stood.categories;
  return { merged: merged as T, problems: [...layer.problems, ...stood.problems] };
}

/**
 * The full merge for a caller with the two files already read (the manager,
 * and the pre-engine reader): discover addons against the shipped+custom view,
 * then fold them in beneath custom. `declared` is the same merge without
 * custom (#1638); `addons` lists the enabled addons only; `problems` names
 * every addon system-category refused, every operator value an owner's
 * declaration overrode, and every turned-off addon whose file could not be
 * read (#1559).
 */
export function mergeConfigWithAddons<T extends Record<string, unknown>>(
  shipped: T,
  custom: Partial<T>,
  cwd: string = process.cwd()
): { merged: T; declared: T; addons: AddonDefaults[]; problems: string[] } {
  const base = deepMergeConfigs(shipped, custom);
  const all = discoverAddonDefaults(base, cwd);
  const { merged, problems } = mergeWithAddonLayer(shipped, all, custom);
  const unreadable = all
    .filter((a) => !a.enabled && a.error)
    .map((a) => `add-on '${a.slug}' (turned off): config/default-config.json could not be read (${a.error}); its system-categories are not known`);
  return {
    merged,
    declared: mergeWithAddonLayer(shipped, all, {}).merged,
    addons: all.filter((a) => a.enabled),
    problems: [...unreadable, ...problems]
  };
}

export interface MergedConfigFiles {
  merged: Record<string, unknown>;
  customKeys: Set<string>;
  addons: AddonDefaults[];
}

/**
 * The merged configuration for a caller that runs before the engine exists
 * (#1214): the two files plus the addon layer, the same merge the manager
 * performs. Returns null on any failure: a missing or malformed file must not
 * stop the server binding a socket; the port simply falls back. No `${VAR}`
 * resolution and no env-key overrides — those are `getProperty`'s job.
 */
export function loadMergedConfigSync(env: Record<string, string | undefined> = process.env, cwd: string = process.cwd()): MergedConfigFiles | null {
  try {
    const files = readConfigFilesSync(configFilePaths(env, cwd));
    const { merged, addons } = mergeConfigWithAddons(files.defaultConfig ?? {}, files.customConfig, cwd);
    return { merged, customKeys: files.customKeys, addons };
  } catch {
    return null;
  }
}
