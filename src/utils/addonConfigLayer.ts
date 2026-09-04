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
 */

import fs from 'fs';
import path from 'path';
import { configFilePaths, deepMergeConfigs, deepMergeObjects, isPlainObject, readConfigFilesSync } from './configFiles.js';
import { findNodeModulesDir, matchNpmPackageDirs, resolveAddonSlug, splitAddonsPath } from './addonsPathResolver.js';

export const ADDONS_PATH_KEY = 'ngdpbase.managers.addons-manager.addons-path';
export const ADDONS_MANAGER_ENABLED_KEY = 'ngdpbase.managers.addons-manager.enabled';

export interface AddonDefaults {
  slug: string;
  dir: string;
  source: 'directory' | 'npm';
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
 * The defaults of every ENABLED addon, in discovery order. An addon with no
 * default-config.json is omitted; one whose file cannot be parsed is returned
 * with `error` set so the caller can say so rather than silently skip it.
 */
export function discoverAddonDefaults(base: Record<string, unknown>, cwd: string = process.cwd()): AddonDefaults[] {
  const out: AddonDefaults[] = [];
  for (const { dir, source } of discoverAddonDirs(base, cwd)) {
    const slug = resolveAddonSlug(dir, source);
    if (!isAddonEnabled(base, slug)) continue;
    const file = path.join(dir, 'config', 'default-config.json');
    if (!fs.existsSync(file)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
      if (!isPlainObject(raw)) throw new Error('not a JSON object');
      const defaults: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(raw)) if (!key.startsWith('_')) defaults[key] = value;
      out.push({ slug, dir, source, defaults });
    } catch (err) {
      out.push({ slug, dir, source, defaults: {}, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

/** shipped ⊕ addons ⊕ custom, in that order of precedence (custom wins). */
export function mergeWithAddonLayer<T extends Record<string, unknown>>(
  shipped: T,
  addons: readonly AddonDefaults[],
  custom: Partial<T>
): T {
  const layer = addons.reduce<Record<string, unknown>>((acc, a) => deepMergeObjects(acc, a.defaults), {});
  return deepMergeConfigs(deepMergeConfigs(shipped, layer as Partial<T>), custom);
}

/**
 * The full merge for a caller with the two files already read (the manager,
 * and the pre-engine reader): discover addons against the shipped+custom view,
 * then fold them in beneath custom.
 */
export function mergeConfigWithAddons<T extends Record<string, unknown>>(
  shipped: T,
  custom: Partial<T>,
  cwd: string = process.cwd()
): { merged: T; addons: AddonDefaults[] } {
  const base = deepMergeConfigs(shipped, custom);
  const addons = discoverAddonDefaults(base, cwd);
  return { merged: mergeWithAddonLayer(shipped, addons, custom), addons };
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
