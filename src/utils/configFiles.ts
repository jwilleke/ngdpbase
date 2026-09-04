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
 * Merge two arrays.
 *
 * If both hold objects with an `id`, merge by id (custom overrides default with
 * the same id and adds new ones). Otherwise the custom array replaces the
 * default entirely — which is why a catalog that an operator may extend one
 * entry at a time is a map, never an array.
 */
export function mergeArrays(defaultArray: unknown[], customArray: unknown[]): unknown[] {
  const hasIds = (arr: unknown[]): boolean =>
    arr.length > 0 && isPlainObject(arr[0]) && 'id' in arr[0];
  if (hasIds(defaultArray) && hasIds(customArray)) {
    const merged = new Map<string, unknown>();
    for (const item of defaultArray) merged.set((item as Record<string, unknown>).id as string, item);
    for (const item of customArray) merged.set((item as Record<string, unknown>).id as string, item);
    return Array.from(merged.values());
  }
  return customArray;
}

/**
 * Deep merge, custom over default.
 *
 * - plain objects: recursively, key by key
 * - arrays: {@link mergeArrays}
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
    else if (isPlainObject(customValue) && isPlainObject(defaultValue)) result[key] = deepMergeObjects(defaultValue, customValue);
    else result[key] = customValue;
  }
  return result;
}

/** The top-level merge is the same rule; the name records what the two inputs are. */
export function deepMergeConfigs<T extends Record<string, unknown>>(defaultConfig: T, customConfig: Partial<T>): T {
  return deepMergeObjects(defaultConfig, customConfig) as T;
}
