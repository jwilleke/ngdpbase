import { MANAGE_PERMISSION, entryOf } from './calendarVisibility.js';

/**
 * Who may add, edit or delete a calendar's events: each calendar names the
 * permission in its `manage-permission` setting, and the event routes ask
 * policy for that one. A calendar that names none asks `calendar-manage`, so a
 * site that sets nothing sees no change.
 *
 * Cancelling a reservation and seeing private reservation details are not
 * governed by this setting: they stay on `calendar-manage` for every calendar.
 */

/** The permission names the site declares, or null when they cannot be read. */
export function declaredPermissionNames(engine: { getManager(name: string): unknown }): ReadonlySet<string> | null {
  const settings = engine.getManager('ConfigurationManager') as
    { getProperty?: (key: string, fallback: unknown) => unknown } | null | undefined;
  const definitions = typeof settings?.getProperty === 'function'
    ? settings.getProperty('ngdpbase.permissions.definitions', null)
    : null;
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) return null;
  return new Set(Object.keys(definitions));
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
 * nobody may: the setting is not a name, or the site has not declared the name
 * (a mistyped one would otherwise be granted by a policy that matches anything,
 * or by none). `calendar-manage` is the add-on's own permission and needs no
 * vouching.
 */
export function resolveManagePermission(
  config: Record<string, unknown>,
  calendarId: string,
  declared: ReadonlySet<string> | null
): string | null {
  const named = managePermissionOf(config, calendarId);
  if (named === null || named === MANAGE_PERMISSION) return named;
  return declared?.has(named) ? named : null;
}
