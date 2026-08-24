/**
 * Environment-owned configuration keys (#1089).
 *
 * Six keys used to be owned by two layers at once: the environment, via a
 * hardcoded map inside `ConfigurationManager.getProperty()` that nothing
 * outside could see, and the admin configuration screen, which accepted and
 * persisted edits to them that could never take effect — the override was
 * checked *before* the merged config, so the write was inert immediately, not
 * merely on next boot.
 *
 * The rule this restores: **a configuration key is owned by exactly one layer,
 * never both.** Ownership is now declared in `ngdpbase.config.env-keys`,
 * mirroring the `ngdpbase.config.secret-keys` precedent — a map rather than an
 * array, because the UI needs the variable's name to tell an operator where the
 * value actually lives.
 *
 * Two decisions worth keeping straight, both settled deliberately:
 *
 * - **Ownership is not conditional on the variable being set.** A key in the
 *   map is env-owned whether or not anything is currently exporting it. Making
 *   it conditional would hand the UI the source of truth whenever the variable
 *   is absent, which is precisely the ambiguity being removed.
 * - **The shipped value is a boot fallback, not a setting.** It exists so a
 *   fresh install comes up. `describePropertySource` still reports it as the
 *   *effective* value when nothing overrides it, because the screen must show
 *   what is actually in force — but the field stays read-only either way.
 */

/** Config key holding the declared map of env-owned keys. */
export const ENV_KEYS_CONFIG_KEY = 'ngdpbase.config.env-keys';

/** key → environment variable that supplies it. */
export type EnvKeyMap = Record<string, string>;

export interface PropertyDescription {
  /** Whether this key is declared env-owned. Independent of whether the variable is set. */
  envControlled: boolean;
  /** The variable that owns it, or null when not env-owned. */
  envVar: string | null;
  /** The value actually in force right now. */
  effective: unknown;
  /** Where `effective` came from. */
  source: 'env' | 'config';
}

/**
 * Coerce an environment value to the type of the shipped default.
 *
 * Environment values are always strings, but the rest of the code expects the
 * declared type — `ngdpbase.server.port` is `number` in `src/types/Config.ts`
 * and ships as `3000`, so `NGDPBASE_PORT=3001` must not arrive as `"3001"` and
 * quietly fail an arithmetic comparison somewhere downstream.
 *
 * Using the default's own type rather than a per-key table means there is one
 * rule and nothing to keep in sync as keys are added.
 *
 * When the value cannot be coerced — a non-numeric string against a numeric
 * default — the raw string is returned. Handing the caller something visibly
 * wrong beats handing them a silent `NaN`.
 */
export function coerceToTypeOf(value: string, defaultValue: unknown): unknown {
  if (typeof defaultValue === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  if (typeof defaultValue === 'boolean') {
    // Only an explicit "true" enables something. Treating "yes" or "1" as true
    // is the sort of guess that surprises an operator months later.
    return value === 'true';
  }

  return value;
}

/**
 * Describe where a config key's value comes from.
 *
 * @param key - The config key.
 * @param envKeys - The declared map, or null when unavailable.
 * @param env - Environment to read, normally `process.env`. Injected so this
 *   stays pure and testable.
 * @param configValue - The merged config value, used both as the fallback and
 *   as the type to coerce an environment value to.
 */
export function describePropertySource(
  key: string,
  envKeys: EnvKeyMap | null | undefined,
  env: Record<string, string | undefined>,
  configValue: unknown
): PropertyDescription {
  const envVar = envKeys?.[key] ?? null;

  if (!envVar) {
    return { envControlled: false, envVar: null, effective: configValue, source: 'config' };
  }

  const raw = env[envVar];

  // An empty value is an operator clearing the variable, not setting it to the
  // empty string — `NGDPBASE_PORT=` in a .env should not blank the port.
  if (raw === undefined || raw === '') {
    return { envControlled: true, envVar, effective: configValue, source: 'config' };
  }

  return {
    envControlled: true,
    envVar,
    effective: coerceToTypeOf(raw, configValue),
    source: 'env'
  };
}
