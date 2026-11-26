import { MANAGE_PERMISSION, entryOf } from './calendarVisibility.js';

/**
 * Who may add, edit or delete a calendar's events: each calendar names the
 * permission in its `manage-permission` setting, and the event routes ask
 * policy for that one. A calendar that names none asks `calendar-manage`, so a
 * site that sets nothing sees no change.
 *
 * Cancelling a reservation and seeing private reservation details are not
 * governed by this setting: they stay on `calendar-manage` for every calendar,
 * and so does every change to a calendar whose `workflow` is `reservation`.
 */

/**
 * Permissions that are held by many accounts, so naming one as a calendar's
 * manager would let nearly everyone change its events. A calendar that names one
 * is treated as naming none.
 */
const BROADLY_GRANTED: ReadonlySet<string> = new Set(['calendar-read', 'calendar-reserve', 'page-read']);

/**
 * The permission names the site declares that someone can hold and that change
 * things (not `read-only`, not `grantable: false`), or null when they cannot be
 * read. Never throws: a write route must not answer with the error's text.
 */
export function declaredPermissionNames(engine: { getManager(name: string): unknown }): ReadonlySet<string> | null {
  try {
    const settings = engine.getManager('ConfigurationManager') as
      { getProperty?: (key: string, fallback: unknown) => unknown } | null | undefined;
    const definitions = typeof settings?.getProperty === 'function'
      ? settings.getProperty('ngdpbase.permissions.definitions', null)
      : null;
    if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) return null;
    const names = Object.entries(definitions as Record<string, unknown>)
      .filter(([, def]) => {
        const d = def && typeof def === 'object' ? def as Record<string, unknown> : {};
        return d['read-only'] !== true && d['grantable'] !== false;
      })
      .map(([name]) => name);
    return new Set(names);
  } catch {
    return null;
  }
}

/**
 * A calendar's `manage-permission` as written: `calendar-manage` when the
 * calendar names none (or the configuration does not name the calendar), the
 * name when it is text, and null for any other value, which nobody holds.
 */
export function managePermissionOf(config: Record<string, unknown>, calendarId: string): string | null {
  const entry = entryOf(config, calendarId);
  if (entry === undefined || entry['manage-permission'] === undefined) return MANAGE_PERMISSION;
  const named = entry['manage-permission'];
  return typeof named === 'string' && named !== '' ? named : null;
}

/**
 * The permission to ask before changing an event of `calendarId`, or null when
 * nobody may: a reservation calendar always asks `calendar-manage`; otherwise the setting is not a name, or the site has not declared the name
 * (a mistyped one would otherwise be granted by a policy that matches anything,
 * or by none). `calendar-manage` is the add-on's own permission and needs no
 * vouching.
 */
export function resolveManagePermission(
  config: Record<string, unknown>,
  calendarId: string,
  declared: ReadonlySet<string> | null
): string | null {
  // A reservation calendar holds other people's bookings: only calendar-manage changes it.
  if (entryOf(config, calendarId)?.['workflow'] === 'reservation') return MANAGE_PERMISSION;
  const named = managePermissionOf(config, calendarId);
  if (named === null || named === MANAGE_PERMISSION) return named;
  // A name everyone holds is not a manager: read as if the calendar named none.
  if (BROADLY_GRANTED.has(named)) return MANAGE_PERMISSION;
  return declared?.has(named) ? named : null;
}
