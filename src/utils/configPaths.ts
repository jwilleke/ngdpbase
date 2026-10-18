/**
 * Paths inside a configuration value (#1889).
 *
 * A configuration key names a value; when the value is a map or a list, each
 * thing inside it has a path below the key: its map keys and list indices, in
 * order. `ngdpbase.addons.accounting.accounts` → `checking` → `account-number`
 * is written `ngdpbase.addons.accounting.accounts.checking.account-number`.
 *
 * Two readers walk these paths, and they walk them here, the same way:
 *
 *   - `ConfigurationManager` resolves a bare `$NAME` environment reference
 *     wherever it sits in a value, naming the full path when the variable is
 *     unset;
 *   - `sensitiveValues` hides what `ngdpbase.config.sensitive-values` names by
 *     a path, where `*` stands for any one map key (or list index).
 *
 * @module utils/configPaths
 */

/** A bare, whole-string environment reference: `$NAME`, upper case, digits and `_`. */
export const ENV_REF_PATTERN = /^\$([A-Z_][A-Z0-9_]*)$/;

/** The variable a bare `$NAME` reference names, or null when the value is not one. */
export function envRefName(value: unknown): string | null {
  return typeof value === 'string' ? (ENV_REF_PATTERN.exec(value)?.[1] ?? null) : null;
}

/** One path segment that stands for any map key or list index. */
export const WILDCARD = '*';

/** A key and the path below it, written as configuration keys are: dot-joined. */
export function pathString(key: string, below: readonly string[]): string {
  return below.length === 0 ? key : `${key}.${below.join('.')}`;
}

/**
 * Visit a value and everything inside it, top first. `visit` returns a
 * replacement for the node, or `undefined` to keep it and go inside. Copy on
 * write: a map or list nothing inside changed is returned as itself, so a read
 * of a value with nothing to replace allocates nothing.
 */
export function mapConfigValue(
  value: unknown,
  visit: (node: unknown, below: readonly string[]) => unknown,
  below: string[] = []
): unknown {
  const replaced = visit(value, below);
  if (replaced !== undefined) return replaced;
  if (Array.isArray(value)) {
    let out: unknown[] | null = null;
    for (let i = 0; i < value.length; i++) {
      below.push(String(i));
      const next = mapConfigValue(value[i], visit, below);
      below.pop();
      if (next !== value[i]) {
        out ??= value.slice();
        out[i] = next;
      }
    }
    return out ?? value;
  }
  if (value !== null && typeof value === 'object') {
    let out: Record<string, unknown> | null = null;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      below.push(k);
      const next = mapConfigValue(v, visit, below);
      below.pop();
      if (next !== v) {
        out ??= { ...(value as Record<string, unknown>) };
        out[k] = next;
      }
    }
    return out ?? value;
  }
  return value;
}

/**
 * The segments of a path entry, or null when it is not a well-formed one: no
 * empty segment, and `*` only as a whole segment with at least two written-out
 * segments before the first one (`ngdpbase.<category>`), since a key is never
 * a wildcard.
 */
export function parsePathEntry(entry: string): string[] | null {
  if (typeof entry !== 'string' || entry === '') return null;
  const segments = entry.split('.');
  if (segments.some((s) => s === '' || (s.includes(WILDCARD) && s !== WILDCARD))) return null;
  const wild = segments.indexOf(WILDCARD);
  if (wild !== -1 && wild < 2) return null;
  return segments;
}

/**
 * Whether `entry` names something inside `key`'s value, and the path pattern
 * below the key if so. The key is matched literally: a `*` stands only for a
 * segment below it.
 */
export function patternBelow(entry: string, key: string): string[] | null {
  if (!entry.startsWith(`${key}.`)) return null;
  const segments = parsePathEntry(entry);
  return segments ? segments.slice(key.split('.').length) : null;
}

/** Whether a path below a key matches a pattern below it: same length, `*` any one segment. */
export function pathMatches(pattern: readonly string[], below: readonly string[]): boolean {
  if (pattern.length !== below.length) return false;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== WILDCARD && pattern[i] !== below[i]) return false;
  }
  return true;
}

/** What sits at a path below a value, or undefined. */
export function valueAt(value: unknown, below: readonly string[]): unknown {
  let node = value;
  for (const segment of below) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/**
 * The configuration key a path entry lies inside: the longest prefix, ending
 * before the first `*`, for which `has` is true. Null when none is set.
 */
export function keyOfEntry(entry: string, has: (key: string) => boolean): string | null {
  const segments = parsePathEntry(entry);
  if (!segments) return null;
  const wild = segments.indexOf(WILDCARD);
  const longest = wild === -1 ? segments.length - 1 : wild;
  for (let n = longest; n >= 2; n--) {
    const key = segments.slice(0, n).join('.');
    if (has(key)) return key;
  }
  return null;
}
