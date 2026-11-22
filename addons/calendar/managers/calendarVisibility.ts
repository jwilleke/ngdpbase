import type { CalendarConfig } from './CalendarConfig.js';

/**
 * Who may see a calendar's events: one rule for the API, the .ics feed and the
 * marquee text, so they never disagree.
 *
 * The permission each non-public `visibility` asks, so policy decides and no role
 * name does (security-posture.md P2): `authenticated` asks `calendar-read`, which
 * the add-on grants to every signed-in account, and `private` asks
 * `calendar-manage`.
 */
export const READ_PERMISSION = 'calendar-read';
export const MANAGE_PERMISSION = 'calendar-manage';

/** Asks whether the viewer holds a permission. */
export type HoldsPermission = (permission: string) => Promise<boolean>;

/** Asks whether the viewer may see a calendar's events. */
export type CalendarGate = (calendarId: string) => Promise<boolean>;

/** What the add-on's configuration holds for `calendarId`, when it is an object. */
export function entryOf(config: Record<string, unknown>, calendarId: string): Record<string, unknown> | undefined {
  const calendars = config['calendars'];
  // Own names only: `__proto__` or `constructor` is a calendar the configuration does not name.
  const entry = calendars && typeof calendars === 'object' && Object.hasOwn(calendars, calendarId)
    ? (calendars as Record<string, unknown>)[calendarId]
    : undefined;
  return entry && typeof entry === 'object' ? entry as Record<string, unknown> : undefined;
}

/**
 * A calendar's `visibility` setting. A configured calendar with no setting is
 * `public`; a setting that is not one of the three is read as `private`, and so
 * is a calendar the configuration does not name, so a typo or a missing entry
 * never opens a calendar.
 */
export function visibilityOf(config: Record<string, unknown>, calendarId: string): CalendarConfig['visibility'] {
  const entry = entryOf(config, calendarId);
  if (!entry) return 'private';
  const setting = entry['visibility'];
  if (setting === undefined || setting === 'public') return 'public';
  return setting === 'authenticated' ? 'authenticated' : 'private';
}

/**
 * A calendar is enabled only when its `enabled` setting is missing or `true`;
 * any other value leaves it out everywhere.
 */
export function isDisabled(config: Record<string, unknown>, calendarId: string): boolean {
  const enabled = entryOf(config, calendarId)?.['enabled'];
  return enabled !== undefined && enabled !== true;
}

/**
 * Whether a viewer may see a calendar's events, under that calendar's
 * `visibility`. Each permission is asked at most once. A disabled calendar is
 * never shown.
 */
export function calendarGate(holds: HoldsPermission, config: Record<string, unknown>): CalendarGate {
  const asked = new Map<string, Promise<boolean>>();
  const ask = (permission: string): Promise<boolean> => {
    let answer = asked.get(permission);
    if (!answer) { answer = holds(permission); asked.set(permission, answer); }
    return answer;
  };
  return async (calendarId: string): Promise<boolean> => {
    if (isDisabled(config, calendarId)) return false;
    const visibility = visibilityOf(config, calendarId);
    if (visibility === 'public') return true;
    return ask(visibility === 'authenticated' ? READ_PERMISSION : MANAGE_PERMISSION);
  };
}

/** The part of AddonsManager that reads an add-on's configuration as it is now. */
interface AddonConfigReader {
  getAddonConfig?(addonName: string): Record<string, unknown>;
}

/**
 * The add-on's configuration as it is now, so a changed `visibility` or
 * `enabled` applies on the next request with no restart. `fallback` (the
 * configuration register() was given) stands in only when the reader is absent.
 */
export function currentCalendarConfig(
  engine: { getManager(name: string): unknown },
  fallback: Record<string, unknown>
): Record<string, unknown> {
  const reader = engine.getManager('AddonsManager') as AddonConfigReader | null | undefined;
  return typeof reader?.getAddonConfig === 'function' ? reader.getAddonConfig('calendar') : fallback;
}
