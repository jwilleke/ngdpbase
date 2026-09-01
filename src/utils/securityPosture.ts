/**
 * The security posture — a view over the settings that determine what an
 * instance guarantees (#1145).
 *
 * An operator cannot otherwise see what their instance's security settings
 * are: they sit in `config/app-default-config.json` among some five hundred
 * other keys, with nothing presenting them as one subject. Two of them are
 * actively misleading as they ship — `ngdpbase.filters.security.enabled` is
 * `false` while every sub-flag beneath it is `true`, and
 * `ngdpbase.auth.required-factors` is `["password"]`, which is where the
 * absence of MFA becomes a visible fact rather than tribal knowledge.
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

/** The shape of `ConfigurationManager.getProperty`. */
export type ConfigReader = (key: string, fallback?: unknown) => unknown;

export const POSTURE_KEY = 'ngdpbase.security.posture';
const SECRET_KEYS_KEY = 'ngdpbase.config.secret-keys';

/** Where an ingredient with no declared group is shown. */
const UNGROUPED = 'Other';

export interface PostureItem {
  key: string;
  /** The current value. Absent when the key is a declared secret. */
  value?: unknown;
  /** Whether a change takes effect only after a restart (D6). */
  restart: boolean;
  /**
   * True when the key is named in `ngdpbase.config.secret-keys`.
   *
   * Reported as present but masked rather than dropped: an operator who added
   * it deserves to know it is set, and silently omitting it would make the
   * section quietly incomplete.
   */
  secret: boolean;
}

export interface PostureGroup {
  group: string;
  items: PostureItem[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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

  const secretKeys = read(SECRET_KEYS_KEY, []);
  const secrets = new Set(
    Array.isArray(secretKeys) ? secretKeys.filter((k): k is string => typeof k === 'string') : []
  );

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
    // ngdpbase.config.secret-keys exists to prevent (D15).
    if (!secret) item.value = read(key, undefined);

    const existing = byGroup.get(group);
    if (existing) existing.push(item);
    else byGroup.set(group, [item]);
  }

  return [...byGroup.entries()]
    .map(([group, items]) => ({ group, items: [...items].sort((a, b) => a.key.localeCompare(b.key)) }))
    .sort((a, b) => a.group.localeCompare(b.group));
}
