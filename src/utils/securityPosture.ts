/**
 * The security posture — a view over the settings that determine what an
 * instance guarantees (#1145).
 *
 * An operator cannot otherwise see what their instance's security settings
 * are: they sit in `config/app-default-config.json` among some five hundred
 * other keys, with nothing presenting them as one subject. One of them is
 * where a gap becomes visible as it ships — `ngdpbase.auth.factors` offers
 * only single factors, which is where the absence of MFA becomes a visible
 * fact rather than tribal knowledge.
 *
 * __This is a view, not a resolution layer (D3).__ Every item is an ordinary
 * key with its own shipped default, read by live code. The posture decides
 * which settings are presented together and shows what each is currently set
 * to. It adds no resolution step and changes no value on its own — which is
 * also why removing an ingredient is safe: the key keeps whatever it is set
 * to and the code keeps reading it, it simply stops being displayed (D4).
 *
 * See docs/security-posture.md.
 */

import { secretKeys } from './sensitiveValues.js';

/** The shape of `ConfigurationManager.getProperty`. */
export type ConfigReader = (key: string, fallback?: unknown) => unknown;

export const POSTURE_KEY = 'ngdpbase.security.posture';

/** Where an ingredient with no declared group is shown. */
const UNGROUPED = 'Other';

export interface PostureItem {
  key: string;
  /** The current value. Absent when the key is a declared secret. */
  value?: unknown;
  /** Whether a change takes effect only after a restart (D6). */
  restart: boolean;
  /**
   * True when the key is named in `ngdpbase.config.sensitive-values` (its `secret` entries).
   *
   * Reported as present but masked rather than dropped: an operator who added
   * it deserves to know it is set, and silently omitting it would make the
   * section quietly incomplete.
   */
  secret: boolean;
  /** A plain-words caution when the value, read with another setting, does not do what it seems to. */
  note?: string;
}

export interface PostureGroup {
  group: string;
  items: PostureItem[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Cautions for settings whose effect depends on another one. Keyed by the
 * posture key; each returns the note, or nothing when the value does what it
 * says.
 */
const NOTES: Record<string, (read: ConfigReader) => string | undefined> = {
  // #1546: the idle limit only ends a session sooner than its absolute lifetime.
  'ngdpbase.session.idle-timeout-minutes': (read) => {
    const minutes = read('ngdpbase.session.idle-timeout-minutes', 0);
    const maxAge = read('ngdpbase.session.max-age', undefined);
    if (typeof minutes !== 'number' || minutes <= 0 || typeof maxAge !== 'number' || maxAge <= 0) return undefined;
    return minutes * 60_000 >= maxAge
      ? `Has no effect: a session already ends after ${Math.round(maxAge / 60_000)} minutes (ngdpbase.session.max-age).`
      : undefined;
  }
};

/**
 * Read the posture and each ingredient's current value.
 *
 * A malformed or absent posture yields nothing rather than throwing. This
 * feeds an admin screen, and an operator who mistyped the object should get an
 * empty section and a chance to fix it, not a page that fails to render.
 */
export function resolvePosture(read: ConfigReader): PostureGroup[] {
  const declared = read(POSTURE_KEY, null);
  if (!isPlainObject(declared)) return [];

  const secrets = new Set(secretKeys(read));

  const byGroup = new Map<string, PostureItem[]>();

  for (const [key, spec] of Object.entries(declared)) {
    // An explicit null is how an operator removes a shipped ingredient:
    // `deepMergeConfigs()` already honours it, and a merge cannot express a
    // deletion any other way.
    if (spec === null || spec === undefined) continue;

    const meta = isPlainObject(spec) ? spec : {};
    const group = typeof meta.group === 'string' && meta.group.trim() !== '' ? meta.group : UNGROUPED;
    const secret = secrets.has(key);

    const item: PostureItem = {
      key,
      restart: meta.restart === true,
      secret
    };
    // Never read a secret's value into the view. The section would otherwise
    // reintroduce, through a different route, the disclosure that
    // ngdpbase.config.sensitive-values exists to prevent (D15).
    if (!secret) item.value = read(key, undefined);
    const note = NOTES[key]?.(read);
    if (note) item.note = note;

    const existing = byGroup.get(group);
    if (existing) existing.push(item);
    else byGroup.set(group, [item]);
  }

  return [...byGroup.entries()]
    .map(([group, items]) => ({ group, items: [...items].sort((a, b) => a.key.localeCompare(b.key)) }))
    .sort((a, b) => a.group.localeCompare(b.group));
}
