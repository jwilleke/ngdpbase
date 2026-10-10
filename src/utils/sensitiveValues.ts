/**
 * Which configuration values may be shown, and to whom (#1750).
 *
 * One declaration, `ngdpbase.config.sensitive-values` (renamed from
 * `ngdpbase.config.secret-keys`, still read as an alias), maps a key to a level:
 *
 *   - `secret`    — never shown except to a holder of `secret-reveal` (which
 *                   asks for a fresh sign-in), never written to the audit log
 *                   or a log line;
 *   - `sensitive` — shown only to a holder of `admin-read`: how the instance is
 *                   run (the access policies, storage paths, outside services).
 *
 * A key that isn't listed but whose name looks like a secret is treated as
 * `secret` — a backstop, so a forgotten entry fails closed. The same backstop
 * hides secret-looking fields nested inside an object value (an OIDC client's
 * `client_secret` inside `oidc-auth-server.clients`).
 *
 * Hidden values are replaced on the server, before any HTML is built: they
 * never reach a page, its source or the parse cache.
 *
 * @module utils/sensitiveValues
 */

import { enabledEntries } from './configFiles.js';

export const SENSITIVE_VALUES_KEY = 'ngdpbase.config.sensitive-values';
/** The list's name before #1750; still read, with a boot warning to rename it. */
export const LEGACY_SECRET_KEYS_KEY = 'ngdpbase.config.secret-keys';

export type ValueLevel = 'secret' | 'sensitive';

/** What a viewer may see: sensitive values (`admin-read`), secret values (`secret-reveal`). */
export interface ValueViewer {
  sensitive: boolean;
  secret: boolean;
}

/** Names that look like a secret, for keys and for fields inside object values. */
const SECRET_NAME_PATTERN = /secret|passw(or)?d|token|credential|api[-_]?key|private[-_]?key/i;

/** What a hidden value is shown as. */
export const HIDDEN = '(hidden)';

type Read = (key: string, fallback: unknown) => unknown;

/**
 * The declared levels: the legacy list's keys as `secret`, then the new map
 * (`"secret"`, `"sensitive"`, `true` = secret; `false` / `null` removes an
 * entry, so an instance can override a shipped one).
 */
export function valueLevels(read: Read): Map<string, ValueLevel> {
  const levels = new Map<string, ValueLevel>();
  for (const key of enabledEntries(read(LEGACY_SECRET_KEYS_KEY, {}))) levels.set(key, 'secret');
  const declared = read(SENSITIVE_VALUES_KEY, {});
  if (declared && typeof declared === 'object' && !Array.isArray(declared)) {
    for (const [key, level] of Object.entries(declared as Record<string, unknown>)) {
      if (level === 'secret' || level === true) levels.set(key, 'secret');
      else if (level === 'sensitive') levels.set(key, 'sensitive');
      else levels.delete(key);
    }
  } else {
    for (const key of enabledEntries(declared)) levels.set(key, 'secret');
  }
  return levels;
}

/** The keys declared `secret`: what logs, the audit log and the admin screen never print. */
export function secretKeys(read: Read): string[] {
  return [...valueLevels(read)].filter(([, level]) => level === 'secret').map(([key]) => key);
}

/**
 * A value's level: as declared, else `secret` when the key's name looks like
 * one and the value is a string. A boolean or number can't be a secret, so
 * `ngdpbase.auth.password.enabled` stays visible; only a declared entry hides
 * whatever its type.
 */
export function levelOf(key: string, levels: Map<string, ValueLevel>, value?: unknown): ValueLevel | null {
  const declared = levels.get(key);
  if (declared) return declared;
  return SECRET_NAME_PATTERN.test(key) && typeof value === 'string' ? 'secret' : null;
}

/** Whether the legacy list is still set (to warn at boot). */
export function usesLegacyName(read: Read): boolean {
  return enabledEntries(read(LEGACY_SECRET_KEYS_KEY, {})).length > 0;
}

/** Secret-looking fields inside an object value, hidden; the rest kept. */
function hideNestedSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hideNestedSecrets);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_NAME_PATTERN.test(k) && typeof v === 'string' && v !== '' ? HIDDEN : hideNestedSecrets(v);
    }
    return out;
  }
  return value;
}

/**
 * The value a viewer may see for a key: itself, or `HIDDEN`. An empty value
 * is shown as it is — "not set" reveals nothing.
 */
export function shownValue(key: string, value: unknown, levels: Map<string, ValueLevel>, viewer: ValueViewer): unknown {
  const empty = value === undefined || value === null || value === '';
  const level = levelOf(key, levels, value);
  if (level === 'secret' && !viewer.secret) return empty ? value : HIDDEN;
  if (level === 'sensitive' && !viewer.sensitive) return empty ? value : HIDDEN;
  return viewer.secret ? value : hideNestedSecrets(value);
}
