/**
 * The configuration files: where they are, how they are read, and how the
 * custom file merges over the shipped one (#1214).
 *
 * One implementation, used by `ConfigurationManager` after the engine exists
 * and by `app.ts` before it does (the listen port, TLS at bind time, and the
 * base-URL explicitness check all run before `engine.initialize()`). Until
 * #1214 `app.ts` had its own copy: a shallow spread that replaced a whole map
 * on override, kept `_comment` keys, and computed the paths a second and third
 * time. It happened to agree with the manager only because the keys it read
 * were scalars.
 *
 * What stays in the manager: the legacy-key migrations (#642, #1117). They
 * log, and they run between reading and merging. A pre-engine read therefore
 * does not see a base URL set under a legacy key; that is a known limit named
 * in the issue, not a second rule.
 */

import fs from 'fs';
import path from 'path';

export const DEFAULT_CONFIG_FILE = 'app-default-config.json';
export const DEFAULT_CUSTOM_CONFIG_FILE = 'app-custom-config.json';

type Env = Record<string, string | undefined>;

/**
 * The marker the setup wizard (or a headless install) writes when a site is
 * installed. Its presence alone says the site is installed (#1410).
 */
export function installCompletePath(dataFolder: string): string {
  return path.join(dataFolder, '.install-complete');
}

/** Fast-storage data folder: FAST_STORAGE, then the legacy INSTANCE_DATA_FOLDER, then ./data. */
export function instanceDataFolder(env: Env = process.env): string {
  return env.FAST_STORAGE || env.INSTANCE_DATA_FOLDER || './data';
}

export interface ConfigFilePaths {
  instanceDataFolder: string;
  /** The shipped defaults, in the code checkout: ./config/app-default-config.json */
  defaultConfigPath: string;
  /** The instance's overrides: <instanceDataFolder>/config/<INSTANCE_CONFIG_FILE or app-custom-config.json> */
  customConfigPath: string;
}

/** The one derivation of both paths. */
export function configFilePaths(env: Env = process.env, cwd: string = process.cwd()): ConfigFilePaths {
  const dataFolder = instanceDataFolder(env);
  return {
    instanceDataFolder: dataFolder,
    defaultConfigPath: path.join(cwd, 'config', DEFAULT_CONFIG_FILE),
    customConfigPath: path.join(dataFolder, 'config', env.INSTANCE_CONFIG_FILE || DEFAULT_CUSTOM_CONFIG_FILE)
  };
}

export interface ConfigFiles {
  /** Null when the shipped file is missing — the caller decides whether that is fatal. */
  defaultConfig: Record<string, unknown> | null;
  /** The custom file with `_`-prefixed comment keys dropped; empty when the file is absent. */
  customConfig: Record<string, unknown>;
  /** The keys the operator set themselves, for "explicit or inherited?" questions (#1163). */
  customKeys: Set<string>;
  customConfigFound: boolean;
}

/** Read both files. Synchronous: both callers run at boot, before anything is served. */
export function readConfigFilesSync(paths: ConfigFilePaths): ConfigFiles {
  const defaultConfig = fs.existsSync(paths.defaultConfigPath)
    ? (JSON.parse(fs.readFileSync(paths.defaultConfigPath, 'utf8')) as Record<string, unknown>)
    : null;

  const customConfig: Record<string, unknown> = {};
  const customConfigFound = fs.existsSync(paths.customConfigPath);
  if (customConfigFound) {
    const raw = JSON.parse(fs.readFileSync(paths.customConfigPath, 'utf8')) as Record<string, unknown>;
    for (const [key, value] of Object.entries(raw)) {
      if (!key.startsWith('_')) customConfig[key] = value;
    }
  }
  return { defaultConfig, customConfig, customKeys: new Set(Object.keys(customConfig)), customConfigFound };
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The fields that identify an entry in a list of objects: `id`, or
 * `authproviderid` for `ngdpbase.auth.factors` (#1523, #1612).
 */
const IDENTITY_FIELDS = ['id', 'authproviderid'] as const;

function identityField(arr: unknown[]): string | null {
  if (arr.length === 0) return null;
  for (const field of IDENTITY_FIELDS) {
    if (arr.every((e) => isPlainObject(e) && typeof e[field] === 'string')) return field;
  }
  return null;
}

/**
 * Merge two arrays.
 *
 * If both hold objects that share an identity field (`id`, `authproviderid`),
 * merge by it: a later entry overrides the same one and adds new ones.
 * Otherwise the custom array replaces the default entirely — which is why a set
 * an operator or an add-on may extend one entry at a time is a map, never an
 * array (#1612).
 */
export function mergeArrays(defaultArray: unknown[], customArray: unknown[]): unknown[] {
  const field = identityField(defaultArray);
  if (field && identityField(customArray) === field) {
    const merged = new Map<string, unknown>();
    for (const item of defaultArray) merged.set((item as Record<string, string>)[field], item);
    for (const item of customArray) merged.set((item as Record<string, string>)[field], item);
    return Array.from(merged.values());
  }
  return customArray;
}

/**
 * A set kept as a map of entry → `true` (#1612): any layer — an add-on, the
 * operator — adds an entry without restating the rest, and `false` removes one
 * on the record. An array merged onto such a map adds its entries rather than
 * replacing the map, so a layer written as a list (an older custom config, an
 * add-on) still extends the set.
 */
function isEntryMap(value: unknown): value is Record<string, boolean | null> {
  return isPlainObject(value)
    && Object.keys(value).length > 0
    && Object.values(value).every((v) => typeof v === 'boolean' || v === null);
}

/** The entries of a set: a map's `true` keys, in order; a legacy array's strings. Anything else is empty. */
export function enabledEntries(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (isPlainObject(value)) return Object.entries(value).filter(([, v]) => v === true).map(([k]) => k);
  return [];
}

/**
 * Deep merge, custom over default.
 *
 * - plain objects: recursively, key by key
 * - arrays: {@link mergeArrays}
 * - an array of names onto a set map: the names are added (#1612)
 * - `null`: an explicit removal — the custom file cannot express a deletion any other way
 * - `undefined`: skipped
 * - anything else: custom wins
 */
export function deepMergeObjects(
  defaultObj: Record<string, unknown>,
  customObj: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...defaultObj };
  for (const key of Object.keys(customObj)) {
    const customValue = customObj[key];
    const defaultValue = result[key];
    if (customValue === undefined) continue;
    else if (customValue === null) result[key] = customValue;
    else if (Array.isArray(customValue) && Array.isArray(defaultValue)) result[key] = mergeArrays(defaultValue, customValue);
    else if (Array.isArray(customValue) && isEntryMap(defaultValue) && customValue.every((e) => typeof e === 'string')) {
      result[key] = { ...defaultValue, ...Object.fromEntries(customValue.map((e) => [e, true])) };
    }
    else if (isPlainObject(customValue) && isPlainObject(defaultValue)) result[key] = deepMergeObjects(defaultValue, customValue);
    else result[key] = customValue;
  }
  return result;
}

/** The top-level merge is the same rule; the name records what the two inputs are. */
export function deepMergeConfigs<T extends Record<string, unknown>>(defaultConfig: T, customConfig: Partial<T>): T {
  return deepMergeObjects(defaultConfig, customConfig) as T;
}
