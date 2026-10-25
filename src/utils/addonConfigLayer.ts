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
 * value of the wrong type is refused, with a problem line naming it, and its
 * addon is then not loaded at all (operator, 2026-10-16): none of its other
 * keys apply, and its sound entries are kept as a turned-off addon's are.
 *
 * A second, `ngdpbase.addons.<slug>.database` (#1860): an addon's database
 * declaration is read the same way, from every installed addon, so a
 * turned-off addon's database stays known (and is backed up, #1723). It is
 * never merged into the configuration: DatabaseManager reads the declarations
 * from here, so the operator's file cannot change one. An invalid declaration
 * stops its addon loading, as a refused system-category does.
 *
 * A third, `ngdpbase.addons.<slug>.site-critical` (#1883): whether a failure of
 * the addon to load puts the whole site in maintenance mode. Read from the
 * addon's own file and from the operator's, which wins either way, and kept
 * apart from the merge so a refused addon's value is still known. A value that
 * is not exactly `true` or `false` refuses the addon and counts as `true`.
 *
 * A fourth, `ngdpbase.config.sensitive-values` (#1889): an enabled addon may
 * classify only its own keys, `ngdpbase.addons.<slug>` and what is under it
 * (paths inside its values included). An entry for any other key refuses the
 * addon, since it could unhide core's or another addon's secret.
 *
 * A fifth, `ngdpbase.access.policies` job subjects (#1999): an enabled addon's
 * policy may name only its own scheduled jobs, `{ "type": "job", "value":
 * "<slug>.<job>" }`. A policy naming core's job or another addon's refuses
 * the addon, since it would grant that job permissions its owner never chose.
 */

import fs from 'fs';
import path from 'path';
import { isDeepStrictEqual } from 'util';
import { configFilePaths, deepMergeConfigs, deepMergeObjects, instanceDataFolder, isPlainObject, readConfigFilesSync } from './configFiles.js';
import { configuredInstallSlugs, findNodeModulesDir, installedAddonsDir, matchNpmPackageDirs, resolveAddonSlug, splitAddonsPath } from './addonsPathResolver.js';
import { lockedAddonDirsSync } from './addonLock.js';
import { LEGACY_SECRET_KEYS_KEY, SENSITIVE_VALUES_KEY } from './sensitiveValues.js';
import { parsePrivatestore } from './privateStorePath.js';
import { OWNER_DECIDED_FIELDS, SYSTEM_CATEGORY_KEY, systemCategoryValueProblems } from './systemCategoryRules.js';
import { addonDatabaseKey, addonDatabaseKeySlug, addonDatabaseProblems, type AddonDatabaseDeclaration, type DatabaseEncrypt } from './addonDatabaseRules.js';

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

/**
 * Every addon directory the configured path names, plus the installed add-ons
 * in `<data>/addons` (#1830: only those the lock file names for a slug in the
 * install map), whether or not it is enabled.
 */
export function discoverAddonDirs(
  base: Record<string, unknown>,
  cwd: string = process.cwd(),
  dataFolder: string = instanceDataFolder()
): Array<{ dir: string; source: 'directory' | 'npm' }> {
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
  const installed = installedAddonsDir(dataFolder, cwd);
  if (!found.some((f) => path.dirname(f.dir) === installed)) {
    for (const dir of lockedAddonDirsSync(installed, configuredInstallSlugs(base))) found.push({ dir, source: 'directory' });
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
export function discoverAddonDefaults(base: Record<string, unknown>, cwd: string = process.cwd(), dataFolder: string = instanceDataFolder()): AddonDefaults[] {
  const out: AddonDefaults[] = [];
  for (const { dir, source } of discoverAddonDirs(base, cwd, dataFolder)) {
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

/** How a problem line names an addon; AddonsManager matches it to fold a refusal into its load-failure notice (#1883). */
export function addonProblemSubject(slug: string, enabled: boolean): string {
  return `add-on '${slug}'${enabled ? '' : ' (turned off)'}`;
}

interface AddonCategoryLayer {
  /** The accepted entries, by key, each stamped with its `owner`. */
  entries: Record<string, Record<string, unknown>>;
  /** Keys whose addon is turned off or refused: never offered, whatever the operator's file says. */
  turnedOff: Set<string>;
  /** Addons with a refused entry, by slug, with why: never loaded, none of their other keys apply. */
  refused: Map<string, string>;
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

  const layer: AddonCategoryLayer = { entries: {}, turnedOff: new Set(), refused: new Map(), problems: [] };
  const declaredBy = new Map<string, string>();
  for (const addon of addons) {
    const declared = addon.defaults[SYSTEM_CATEGORY_KEY];
    if (declared === undefined) continue;
    const who = addonProblemSubject(addon.slug, addon.enabled);
    if (!isPlainObject(declared)) {
      const reason = `${SYSTEM_CATEGORY_KEY} must be a map of entries`;
      layer.problems.push(`${who}: ${reason}; it is refused and the add-on is not loaded`);
      layer.refused.set(addon.slug, `its system-category declaration was refused: ${reason}`);
      continue;
    }
    const refusedHere: string[] = [];
    const acceptedHere: string[] = [];
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
        reasons.push(...systemCategoryValueProblems(key, entry).map((p) => p.message));
      }
      if (reasons.length > 0) {
        layer.problems.push(`${who}: system-category '${key}' is refused (${reasons.join('; ')}); the add-on is not loaded`);
        refusedHere.push(`'${key}' (${reasons.join('; ')})`);
        continue;
      }
      layer.entries[key] = { ...(entry as Record<string, unknown>), owner: addon.slug };
      acceptedHere.push(key);
      declaredBy.set(key, addon.slug);
      const vaultId = vaultIdOf(entry);
      if (vaultId) vaultKey.set(vaultId, key);
    }
    // An add-on with a refused entry is not loaded (operator, 2026-10-16), so
    // its sound entries are kept as a turned-off add-on's are: readable, never
    // offered.
    if (refusedHere.length > 0) layer.refused.set(addon.slug, `its system-category declaration was refused: ${refusedHere.join('; ')}`);
    if (!addon.enabled || refusedHere.length > 0) {
      for (const key of acceptedHere) {
        layer.entries[key].enabled = false;
        layer.turnedOff.add(key);
      }
    }
  }
  return layer;
}

export interface AddonDatabaseLayer {
  /** Every sound declaration, of every installed addon, `enabled` as its addon is. */
  declarations: AddonDatabaseDeclaration[];
  /** Addons whose declaration was refused, by slug, with why: never loaded. */
  refused: Map<string, string>;
  problems: string[];
}

/**
 * The databases the addons declare (#1860), from every addon's file whether
 * or not it is enabled. An addon declares only under its own slug; a second
 * declaration of one owner's ledger is refused. `custom` is the operator's
 * file: a value there for a declaration's key is ignored, and said so.
 */
export function addonDatabaseLayer(addons: readonly AddonDefaults[], custom: Record<string, unknown>): AddonDatabaseLayer {
  const layer: AddonDatabaseLayer = { declarations: [], refused: new Map(), problems: [] };
  const ledgerBy = new Map<string, string>();
  for (const addon of addons) {
    const reasons: string[] = [];
    let declared: unknown;
    for (const [key, value] of Object.entries(addon.defaults)) {
      const slug = addonDatabaseKeySlug(key);
      if (slug === null) continue;
      if (slug === addon.slug) declared = value;
      else reasons.push(`it declares ${key}; an add-on declares only its own, ${addonDatabaseKey(addon.slug)}`);
    }
    if (declared !== undefined) {
      const valueProblems = addonDatabaseProblems(declared);
      reasons.push(...valueProblems);
      if (valueProblems.length === 0) {
        const { owner, ledgerTable } = declared as { owner: string; ledgerTable: string };
        const by = ledgerBy.get(`${owner}/${ledgerTable}`);
        if (by) reasons.push(`add-on '${by}' already declares ledger '${ledgerTable}' of database '${owner}'`);
      }
    }
    if (reasons.length > 0) {
      const who = addonProblemSubject(addon.slug, addon.enabled);
      layer.problems.push(`${who}: its database declaration is refused (${reasons.join('; ')}); the add-on is not loaded`);
      layer.refused.set(addon.slug, `its database declaration was refused: ${reasons.join('; ')}`);
      continue;
    }
    if (declared === undefined) continue;
    const { owner, ledgerTable, encrypt } = declared as { owner: string; ledgerTable: string; encrypt: DatabaseEncrypt };
    ledgerBy.set(`${owner}/${ledgerTable}`, addon.slug);
    layer.declarations.push({ owner, ledgerTable, encrypt, declaredBy: addon.slug, enabled: addon.enabled });
    if (custom[addonDatabaseKey(addon.slug)] !== undefined) {
      layer.problems.push(`app-custom-config.json sets ${addonDatabaseKey(addon.slug)}, which is the declaration of add-on '${addon.slug}'; the site's value is ignored`);
    }
  }
  return layer;
}

export interface AddonSensitiveValuesLayer {
  /** Addons with an entry for a key that is not their own, by slug, with why: never loaded. */
  refused: Map<string, string>;
  problems: string[];
}

/** Every entry an addon's file names in a sensitive-values map or the legacy list, whatever its level. */
function sensitiveEntriesOf(defaults: Record<string, unknown>): string[] {
  const names: string[] = [];
  for (const listKey of [SENSITIVE_VALUES_KEY, LEGACY_SECRET_KEYS_KEY]) {
    const declared = defaults[listKey];
    if (Array.isArray(declared)) names.push(...declared.filter((v): v is string => typeof v === 'string'));
    else if (isPlainObject(declared)) names.push(...Object.keys(declared));
  }
  return names;
}

/**
 * Which values an addon may classify (#1889): its own, `ngdpbase.addons.<slug>`
 * and anything under it, top-level keys and paths alike. An entry for core's
 * keys or another addon's could unhide them (`false`, or `sensitive` for a
 * `secret`), so it refuses the addon, as a database declaration under another
 * slug does (#1860): it is not loaded and none of its keys apply. Only an
 * enabled addon's entries reach the merge, so only an enabled addon is checked.
 */
export function addonSensitiveValuesLayer(addons: readonly AddonDefaults[]): AddonSensitiveValuesLayer {
  const layer: AddonSensitiveValuesLayer = { refused: new Map(), problems: [] };
  for (const addon of addons) {
    if (!addon.enabled) continue;
    const own = `ngdpbase.addons.${addon.slug}`;
    const foreign = sensitiveEntriesOf(addon.defaults).filter((entry) => entry.trim() !== own && !entry.trim().startsWith(`${own}.`));
    if (foreign.length === 0) continue;
    const reason = `its sensitive-values entries ${foreign.map((e) => `'${e}'`).join(', ')} are not its own; an add-on classifies only ${own} and what is under it`;
    layer.refused.set(addon.slug, reason);
    layer.problems.push(`${addonProblemSubject(addon.slug, addon.enabled)}: ${reason}; the add-on is not loaded`);
  }
  return layer;
}

export interface AddonJobPolicyLayer {
  /** Addons whose policies name a job that is not their own, by slug, with why: never loaded. */
  refused: Map<string, string>;
  problems: string[];
}

/**
 * Which jobs an addon's policies may name (#1999): its own, ids starting
 * `<slug>.`, the prefix its job ids carry. Only an enabled addon's policies
 * reach the merge, so only an enabled addon is checked.
 */
export function addonJobPolicyLayer(addons: readonly AddonDefaults[]): AddonJobPolicyLayer {
  const layer: AddonJobPolicyLayer = { refused: new Map(), problems: [] };
  for (const addon of addons) {
    if (!addon.enabled) continue;
    const policies = addon.defaults['ngdpbase.access.policies'];
    if (!Array.isArray(policies)) continue;
    const foreign: string[] = [];
    for (const policy of policies) {
      const subjects = isPlainObject(policy) && Array.isArray(policy.subjects) ? policy.subjects : [];
      for (const subject of subjects) {
        if (!isPlainObject(subject) || subject.type !== 'job') continue;
        if (typeof subject.value !== 'string' || !subject.value.startsWith(`${addon.slug}.`)) foreign.push(`'${String(subject.value)}' (policy '${String((policy as { id?: unknown }).id)}')`);
      }
    }
    if (foreign.length === 0) continue;
    const reason = `its policies name the job(s) ${foreign.join(', ')}, which are not its own; an add-on's policy names only its own jobs, ${addon.slug}.<job>`;
    layer.refused.set(addon.slug, reason);
    layer.problems.push(`${addonProblemSubject(addon.slug, addon.enabled)}: ${reason}; the add-on is not loaded`);
  }
  return layer;
}

/** The configuration key that makes an addon site-critical (#1883). */
export function addonSiteCriticalKey(slug: string): string {
  return `ngdpbase.addons.${slug}.site-critical`;
}

export interface AddonSiteCriticalLayer {
  /** Each addon with a value, by slug: true when its failure to load puts the site in maintenance mode. */
  siteCritical: Map<string, boolean>;
  /** Addons whose value is not exactly `true` or `false`, by slug, with why: never loaded. */
  refused: Map<string, string>;
  problems: string[];
}

/**
 * Which addons are site-critical (#1883): the operator's value if the
 * operator's file sets one, else the addon's own (only under its own slug),
 * else not. The operator's file wins in both directions, as for every addon
 * key. The value is exactly `true` or `false`; anything else (the string
 * `"true"` included) refuses the addon and counts as site-critical, so a
 * mistyped value fails closed. `custom` keys for an addon with no file, or
 * one that is not installed, count too.
 */
export function addonSiteCriticalLayer(addons: readonly AddonDefaults[], custom: Record<string, unknown>): AddonSiteCriticalLayer {
  const layer: AddonSiteCriticalLayer = { siteCritical: new Map(), refused: new Map(), problems: [] };
  const take = (slug: string, enabled: boolean, own: unknown): void => {
    const key = addonSiteCriticalKey(slug);
    const fromSite = custom[key] !== undefined;
    const value = fromSite ? custom[key] : own;
    if (value === undefined) return;
    if (typeof value === 'boolean') {
      layer.siteCritical.set(slug, value);
      return;
    }
    const reason = `${key} must be true or false, got ${JSON.stringify(value)} in ${fromSite ? 'app-custom-config.json' : 'its config/default-config.json'}; it is treated as true`;
    layer.siteCritical.set(slug, true);
    layer.refused.set(slug, reason);
    layer.problems.push(`${addonProblemSubject(slug, enabled)}: ${reason}; the add-on is not loaded`);
  };
  for (const addon of addons) take(addon.slug, addon.enabled, addon.defaults[addonSiteCriticalKey(addon.slug)]);
  for (const key of Object.keys(custom)) {
    const slug = /^ngdpbase\.addons\.([^.]+)\.site-critical$/.exec(key)?.[1];
    if (slug && !layer.siteCritical.has(slug)) take(slug, custom[`ngdpbase.addons.${slug}.enabled`] === true, undefined);
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
): { merged: T; problems: string[]; refused: Map<string, string>; databases: AddonDatabaseDeclaration[]; siteCritical: Map<string, boolean> } {
  const customCategories = (custom as Record<string, unknown>)[SYSTEM_CATEGORY_KEY];
  const layer = addonCategoryLayer(shipped[SYSTEM_CATEGORY_KEY], customCategories, addons);
  const databaseLayer = addonDatabaseLayer(addons, custom);
  const criticalLayer = addonSiteCriticalLayer(addons, custom);
  const sensitiveLayer = addonSensitiveValuesLayer(addons);
  const jobPolicyLayer = addonJobPolicyLayer(addons);
  const siteCritical = criticalLayer.siteCritical;
  const refused = new Map(layer.refused);
  for (const [slug, reason] of [...databaseLayer.refused, ...criticalLayer.refused, ...sensitiveLayer.refused, ...jobPolicyLayer.refused]) refused.set(slug, refused.has(slug) ? `${refused.get(slug)}; ${reason}` : reason);
  const databases = databaseLayer.declarations.map((d) => ({ ...d, enabled: d.enabled && !refused.has(d.declaredBy) }));
  const withAddons = addons
    .filter((a) => a.enabled && !refused.has(a.slug))
    .reduce<Record<string, unknown>>((acc, a) => {
      const rest = { ...a.defaults };
      delete rest[SYSTEM_CATEGORY_KEY];
      for (const key of Object.keys(rest)) if (addonDatabaseKeySlug(key) !== null) delete rest[key];
      return deepMergeObjects(acc, rest);
    }, shipped);
  if (Object.keys(layer.entries).length === 0) {
    return { merged: deepMergeConfigs(withAddons as T, custom), problems: [...layer.problems, ...databaseLayer.problems, ...criticalLayer.problems, ...sensitiveLayer.problems, ...jobPolicyLayer.problems], refused, databases, siteCritical };
  }
  const shippedCategories = isPlainObject(withAddons[SYSTEM_CATEGORY_KEY]) ? withAddons[SYSTEM_CATEGORY_KEY] : {};
  const layered = { ...withAddons, [SYSTEM_CATEGORY_KEY]: deepMergeObjects(shippedCategories, layer.entries) };
  const merged = deepMergeObjects(layered, custom);
  const stood = ownerDeclarationsStand(merged[SYSTEM_CATEGORY_KEY], layer, customCategories);
  merged[SYSTEM_CATEGORY_KEY] = stood.categories;
  return { merged: merged as T, problems: [...layer.problems, ...stood.problems, ...databaseLayer.problems, ...criticalLayer.problems, ...sensitiveLayer.problems, ...jobPolicyLayer.problems], refused, databases, siteCritical };
}

/**
 * The full merge for a caller with the two files already read (the manager,
 * and the pre-engine reader): discover addons against the shipped+custom view,
 * then fold them in beneath custom. `declared` is the same merge without
 * custom (#1638); `addons` lists the enabled addons whose keys apply;
 * `problems` names every addon system-category refused, every operator value
 * an owner's declaration overrode, and every turned-off addon whose file
 * could not be read; `refused` names, by slug, each addon that must not load
 * because an entry it declares was refused, and why (#1559), or because its
 * database declaration was (#1860); `databases` is every sound database
 * declaration of every installed addon, on or off (#1860); `siteCritical`
 * says, by slug, which addons put the site in maintenance mode when they fail
 * to load (#1883).
 */
export function mergeConfigWithAddons<T extends Record<string, unknown>>(
  shipped: T,
  custom: Partial<T>,
  cwd: string = process.cwd(),
  dataFolder: string = instanceDataFolder()
): { merged: T; declared: T; addons: AddonDefaults[]; problems: string[]; refused: Map<string, string>; databases: AddonDatabaseDeclaration[]; siteCritical: Map<string, boolean> } {
  const base = deepMergeConfigs(shipped, custom);
  const all = discoverAddonDefaults(base, cwd, dataFolder);
  const { merged, problems, refused, databases, siteCritical } = mergeWithAddonLayer(shipped, all, custom);
  const unreadable = all
    .filter((a) => !a.enabled && a.error)
    .map((a) => `add-on '${a.slug}' (turned off): config/default-config.json could not be read (${a.error}); its system-categories and database are not known`);
  return {
    merged,
    declared: mergeWithAddonLayer(shipped, all, {}).merged,
    addons: all.filter((a) => a.enabled && !refused.has(a.slug)),
    problems: [...unreadable, ...problems],
    refused,
    databases,
    siteCritical
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
    const paths = configFilePaths(env, cwd);
    const files = readConfigFilesSync(paths);
    const { merged, addons } = mergeConfigWithAddons(files.defaultConfig ?? {}, files.customConfig, cwd, paths.instanceDataFolder);
    return { merged, customKeys: files.customKeys, addons };
  } catch {
    return null;
  }
}
