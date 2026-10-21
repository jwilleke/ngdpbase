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
 * An entry may also name something inside a key's value by its path (#1889):
 * `ngdpbase.addons.accounting.accounts.*.account-number`, where `*` stands for
 * any one map key (or list index). It hides what sits there, at the entry's
 * level, wherever a value is shown, except a bare `$NAME` reference, which is
 * a pointer to the environment, not the secret. The paths are walked by
 * `utils/configPaths.ts`, the same walk that resolves `$NAME` inside a value.
 *
 * Hidden values are replaced on the server, before any HTML is built: they
 * never reach a page, its source or the parse cache.
 *
 * @module utils/sensitiveValues
 */

import { enabledEntries } from './configFiles.js';
import { envRefName, mapConfigValue, parsePathEntry, pathMatches, pathString, patternBelow, valueAt } from './configPaths.js';

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

/** Whether a key or field name looks like a secret (the backstop's test; also `npm run lint:sensitive`). */
export function looksSecret(name: string): boolean {
  return SECRET_NAME_PATTERN.test(name);
}

/**
 * What an administrator's screen, a log line and an audit record may hold:
 * sensitive values, never secrets. Secrets there are revealed one key at a
 * time, on demand (`secret-reveal`).
 */
export const NO_SECRETS: ValueViewer = Object.freeze({ sensitive: true, secret: false });

/** What a hidden value is shown as. */
export const HIDDEN = '(hidden)';

type Read = (key: string, fallback: unknown) => unknown;

/**
 * The declared levels: the legacy list's keys as `secret`, then the new map
 * (`"secret"`, `"sensitive"`, `true` = secret; `false` / `null` removes an
 * entry, so an instance can override a shipped one). An entry that is not a
 * well-formed key or path (#1889: an empty segment, a `*` inside a segment, or
 * a `*` before `ngdpbase.<category>`) is no entry, as a level that is none of
 * these is no entry; {@link sensitiveValueProblems} names both.
 */
export function valueLevels(read: Read): Map<string, ValueLevel> {
  const levels = new Map<string, ValueLevel>();
  const entry = (key: string): string | null => (parsePathEntry(key.trim()) ? key.trim() : null);
  for (const key of enabledEntries(read(LEGACY_SECRET_KEYS_KEY, {}))) {
    const k = entry(key);
    if (k) levels.set(k, 'secret');
  }
  const declared = read(SENSITIVE_VALUES_KEY, {});
  if (declared && typeof declared === 'object' && !Array.isArray(declared)) {
    for (const [key, level] of Object.entries(declared as Record<string, unknown>)) {
      const k = entry(key);
      if (!k) continue;
      if (level === 'secret' || level === true) levels.set(k, 'secret');
      else if (level === 'sensitive') levels.set(k, 'sensitive');
      else levels.delete(k);
    }
  } else {
    for (const key of enabledEntries(declared)) {
      const k = entry(key);
      if (k) levels.set(k, 'secret');
    }
  }
  return levels;
}

/**
 * What is wrong with the declared entries, one line each (#1889): an entry
 * that is not a well-formed key or path, or a level that is none of
 * `"secret"`, `"sensitive"`, `true`, `false`, `null`. {@link valueLevels}
 * drops each such entry; the engine warns at boot.
 */
export function sensitiveValueProblems(read: Read): string[] {
  const problems: string[] = [];
  const named = (list: string, key: string): void => {
    if (!parsePathEntry(key.trim())) {
      problems.push(`${list}: '${key}' is not a configuration key or path (an empty segment, or a * that is not a whole segment after ngdpbase.<category>); it is ignored`);
    }
  };
  for (const key of enabledEntries(read(LEGACY_SECRET_KEYS_KEY, {}))) named(LEGACY_SECRET_KEYS_KEY, key);
  const declared = read(SENSITIVE_VALUES_KEY, {});
  if (declared && typeof declared === 'object' && !Array.isArray(declared)) {
    for (const [key, level] of Object.entries(declared as Record<string, unknown>)) {
      named(SENSITIVE_VALUES_KEY, key);
      if (!(level === 'secret' || level === 'sensitive' || level === true || level === false || level === null)) {
        problems.push(`${SENSITIVE_VALUES_KEY}: '${key}' has level ${JSON.stringify(level)}, which is not "secret" or "sensitive"; the entry is ignored`);
      }
    }
  } else {
    for (const key of enabledEntries(declared)) named(SENSITIVE_VALUES_KEY, key);
  }
  return problems;
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
  return looksSecret(key) && typeof value === 'string' ? 'secret' : null;
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
      out[k] = looksSecret(k) && typeof v === 'string' && v !== '' ? HIDDEN : hideNestedSecrets(v);
    }
    return out;
  }
  return value;
}

/** The path entries inside a key's value, as patterns below the key, with their levels. */
function entriesBelow(key: string, levels: Map<string, ValueLevel>): Array<[string[], ValueLevel]> {
  const out: Array<[string[], ValueLevel]> = [];
  for (const [entry, level] of levels) {
    const pattern = patternBelow(entry, key);
    if (pattern && pattern.length > 0) out.push([pattern, level]);
  }
  return out;
}

/** Whether a viewer may see a value at this level. */
function maySee(level: ValueLevel, viewer: ValueViewer): boolean {
  return level === 'secret' ? viewer.secret : viewer.sensitive;
}

/**
 * A key's value with what its path entries name hidden from this viewer
 * (#1889). An empty value, and a bare `$NAME` reference, are kept: neither is
 * the secret. The key's own level is {@link shownValue}'s business.
 */
export function hideDeclaredPaths(key: string, value: unknown, levels: Map<string, ValueLevel>, viewer: ValueViewer): unknown {
  const hidden = entriesBelow(key, levels).filter(([, level]) => !maySee(level, viewer)).map(([pattern]) => pattern);
  if (hidden.length === 0) return value;
  return mapConfigValue(value, (node, below) => {
    if (below.length === 0 || !hidden.some((pattern) => pathMatches(pattern, below))) return undefined;
    return node === undefined || node === null || node === '' || envRefName(node) ? node : HIDDEN;
  });
}

/**
 * The strings (and numbers, as text) a key's secret path entries name inside
 * its value, each with its full path (#1889): what log redaction strikes.
 * Everything under a named map or list counts.
 */
export function secretValuesBelow(key: string, value: unknown, levels: Map<string, ValueLevel>): Array<{ path: string; value: string }> {
  const secret = entriesBelow(key, levels).filter(([, level]) => level === 'secret').map(([pattern]) => pattern);
  const found: Array<{ path: string; value: string }> = [];
  if (secret.length === 0) return found;
  mapConfigValue(value, (node, below) => {
    if (below.length === 0 || !secret.some((pattern) => pathMatches(pattern, below))) return undefined;
    const at = [...below];
    mapConfigValue(node, (leaf, under) => {
      if (typeof leaf === 'string' || typeof leaf === 'number') found.push({ path: pathString(key, [...at, ...under]), value: String(leaf) });
      return undefined;
    });
    return node;
  });
  return found;
}

/**
 * A value submitted from a screen that showed it with paths hidden, with each
 * `HIDDEN` placeholder at a declared path put back to the stored value there
 * (#1889). Without this, saving an edit to an accounts map would write the
 * placeholder over every account number.
 */
export function keepHiddenValues(key: string, submitted: unknown, stored: unknown, levels: Map<string, ValueLevel>): unknown {
  const patterns = entriesBelow(key, levels).map(([pattern]) => pattern);
  if (patterns.length === 0) return submitted;
  return mapConfigValue(submitted, (node, below) => {
    if (node !== HIDDEN || !patterns.some((pattern) => pathMatches(pattern, below))) return undefined;
    const kept = valueAt(stored, below);
    return kept === undefined ? node : kept;
  });
}

/**
 * The value a viewer may see for a key: itself, or `HIDDEN`; inside it, what
 * its path entries name is hidden as well (#1889). An empty value is shown as
 * it is: "not set" reveals nothing.
 */
export function shownValue(key: string, value: unknown, levels: Map<string, ValueLevel>, viewer: ValueViewer): unknown {
  const empty = value === undefined || value === null || value === '';
  const level = levelOf(key, levels, value);
  if (level === 'secret' && !viewer.secret) return empty ? value : HIDDEN;
  if (level === 'sensitive' && !viewer.sensitive) return empty ? value : HIDDEN;
  const shown = hideDeclaredPaths(key, value, levels, viewer);
  return viewer.secret ? shown : hideNestedSecrets(shown);
}
