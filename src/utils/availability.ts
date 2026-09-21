'use strict';

/**
 * Is the instance open to ordinary traffic, and if not, why (#1432)?
 *
 * "Is the site open" is not "may this identity do this". The second is the
 * permission door; this is the first, and it has several reasons — maintenance,
 * a schedule such as business hours, and a holiday. They shared one property:
 * the configuration shipped switches for all of them and only maintenance was
 * ever enforced, so an operator could turn business hours on and nothing
 * happened. `PolicyInformationPoint` carried the unreachable implementations
 * (`checkBusinessHours`, `checkHolidayRestrictions`, `checkEnhancedTimeRestrictions`),
 * which is also the wrong manager for the question.
 *
 * One resolver, one gate, one dialog, different messages. This returns the
 * FIRST reason that closes the instance, with the operator's own wording for
 * it, and the gate middleware renders it.
 *
 * Read per request, never cached at boot, so an admin toggle takes effect
 * without a restart — the reason {@link resolveMaintenanceState} gives.
 */

import {
  resolveMaintenanceState,
  type ReadProperty as ReadPropertyWithFallback,
  type MaintenanceState
} from './maintenanceState.js';

/**
 * Read one configuration value. No fallback parameter, deliberately.
 *
 * A fallback in the call is a second place the value can come from, and it is
 * invisible to the operator: the shipped `config/app-default-config.json` can
 * lose a key and nothing says so, because the caller quietly supplied one.
 * Every key this module reads IS declared there, so absence means a broken
 * configuration, not a value to invent.
 *
 * What this module does with an absent value:
 *
 * - __a switch__ (`…enabled`) reads as OFF, and says so in the log. A missing
 *   switch must never CLOSE the instance — that would lock everyone out over a
 *   typo — but it is still reported rather than assumed.
 * - __a window, schedule or holiday map__ absent means nothing to enforce.
 * - __a message__ falls back to a constant, because something has to render on
 *   the page. That is the only fallback here, and it is display text.
 */
export type ReadProperty = (key: string) => unknown;

/** Which reason closed the instance. */
export type AvailabilityKind = 'maintenance' | 'schedule' | 'holiday' | 'misconfigured';

export interface AvailabilityState {
  /** Whether ordinary traffic is refused. */
  blocked: boolean;
  /** Which reason closed it; null when open. */
  kind: AvailabilityKind | null;
  /** Shown on the page. Never empty when blocked. */
  message: string;
  /** Whether an administrator may still reach the instance. */
  allowAdmins: boolean;
  /** Operator-supplied estimate, maintenance only. */
  estimatedDuration: string | null;
}

export const BUSINESS_HOURS_ENABLED_KEY = 'ngdpbase.access-control.business-hours.enabled';
export const BUSINESS_HOURS_MESSAGE_KEY = 'ngdpbase.access-control.business-hours.message';
export const CUSTOM_SCHEDULES_ENABLED_KEY = 'ngdpbase.access-control.custom-schedules.enabled';
export const CUSTOM_SCHEDULES_FILE_KEY = 'ngdpbase.access-control.custom-schedules.schedules';
export const SCHEDULES_KEY = 'ngdpbase.schedules';
export const HOLIDAYS_ENABLED_KEY = 'ngdpbase.holidays.enabled';
export const HOLIDAYS_DATES_KEY = 'ngdpbase.holidays.dates';
export const HOLIDAYS_MESSAGE_KEY = 'ngdpbase.holidays.message';
export const TIME_ZONE_KEY = 'ngdpbase.time-zone';

const DEFAULT_SCHEDULE_MESSAGE = 'The site is closed at this time. Please try again during opening hours.';
const DEFAULT_HOLIDAY_MESSAGE = 'The site is closed for a holiday. Please try again later.';

/** A named schedule from `ngdpbase.schedules`. */
export interface ScheduleRule {
  days?: string[];
  startTime?: string;
  endTime?: string;
  /** `allow` opens the window; `deny` closes it. Absent reads as `allow`. */
  type?: string;
}

export interface Schedule {
  name?: string;
  description?: string;
  timeZone?: string;
  rules?: ScheduleRule[];
  exceptions?: string[];
  enabled?: boolean;
  message?: string;
}

/** A holiday entry. The key carries the date — `2026-07-04` or `*-12-25`. */
export interface HolidayEntry {
  name?: string;
  message?: string;
  enabled?: boolean;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
  }
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

/**
 * The instant, in a named time zone, as the parts a schedule compares:
 * the weekday and minutes since midnight, plus the ISO date for a holiday.
 *
 * Uses `Intl` rather than arithmetic on the epoch so daylight saving is the
 * platform's problem, not ours.
 */
export function zonedParts(now: Date, timeZone: string): { day: string; minutes: number; date: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(now);
  } catch {
    // An unknown zone must not decide the site is closed: fall back to UTC.
    return zonedParts(now, 'UTC');
  }
  const find = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(find('hour'));
  return {
    day: find('weekday').toLowerCase(),
    // Intl renders midnight as 24 in some locales with hour12:false.
    minutes: (hour === 24 ? 0 : hour) * 60 + Number(find('minute')),
    date: `${find('year')}-${find('month')}-${find('day')}`
  };
}

function minutesOf(hhmm: unknown): number | null {
  if (typeof hhmm !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * Whether a schedule is open at `now`.
 *
 * A `deny` rule matching the day closes it outright. Otherwise an `allow` rule
 * must match both the day and the time window. A schedule with no rules is
 * open — an empty schedule is not a lockout.
 */
export function scheduleIsOpen(schedule: Schedule, now: Date, fallbackZone: string): boolean {
  const rules = Array.isArray(schedule.rules) ? schedule.rules : [];
  if (rules.length === 0) return true;

  const { day, minutes } = zonedParts(now, text(schedule.timeZone, fallbackZone));
  const matchesDay = (rule: ScheduleRule): boolean => {
    if (!Array.isArray(rule.days) || rule.days.length === 0) return true;
    return rule.days.some((d) => typeof d === 'string' && d.trim().toLowerCase() === day);
  };

  for (const rule of rules) {
    if (rule.type === 'deny' && matchesDay(rule)) return false;
  }

  let sawAllow = false;
  for (const rule of rules) {
    if (rule.type === 'deny') continue;
    sawAllow = true;
    if (!matchesDay(rule)) continue;
    const start = minutesOf(rule.startTime);
    const end = minutesOf(rule.endTime);
    if (start === null || end === null) return true; // a malformed window does not close the site
    if (start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end) return true;
  }
  return !sawAllow;
}

/** Whether `date` (ISO `YYYY-MM-DD`) matches a holiday key, including `*-MM-DD`. */
export function holidayKeyMatches(key: string, date: string): boolean {
  if (key === date) return true;
  if (key.startsWith('*-')) return date.slice(5) === key.slice(2);
  return false;
}

/**
 * The first reason the instance is closed, or an open state.
 *
 * Order is maintenance, then schedule, then holiday: the operator's own switch
 * before anything time-based, so "I closed it" is never reported as "it is a
 * holiday".
 */
export function resolveAvailability(get: ReadProperty, now: Date = new Date()): AvailabilityState {
  // maintenanceState still takes (key, fallback); give it one that ignores the
  // fallback for a key that is present, so the two readers cannot disagree.
  const withFallback: ReadPropertyWithFallback = (key, fallback) => get(key) ?? fallback;
  const maintenance: MaintenanceState = resolveMaintenanceState(withFallback);
  if (maintenance.enabled) {
    return {
      blocked: true,
      kind: 'maintenance',
      message: maintenance.message,
      allowAdmins: maintenance.allowAdmins,
      estimatedDuration: maintenance.estimatedDuration
    };
  }

  const open: AvailabilityState = {
    blocked: false, kind: null, message: '', allowAdmins: true, estimatedDuration: null
  };
  const fallbackZone = text(get(TIME_ZONE_KEY), 'UTC');

  // An administrator can always reach a time-closed instance: a schedule that
  // locks out the only person who can change it is a trap, and unlike
  // maintenance there is no switch to flip from outside.
  const closed = (kind: AvailabilityKind, message: string): AvailabilityState => ({
    blocked: true, kind, message, allowAdmins: true, estimatedDuration: null
  });

  const schedules = (get(SCHEDULES_KEY) ?? {}) as Record<string, Schedule>;

  if (toBoolean(get(BUSINESS_HOURS_ENABLED_KEY), false)) {
    const schedule = schedules['business-hours'];
    if (schedule && toBoolean(schedule.enabled, true) && !scheduleIsOpen(schedule, now, fallbackZone)) {
      return closed('schedule', text(
        schedule.message ?? get(BUSINESS_HOURS_MESSAGE_KEY),
        DEFAULT_SCHEDULE_MESSAGE
      ));
    }
  }

  if (toBoolean(get(HOLIDAYS_ENABLED_KEY), false)) {
    const dates = (get(HOLIDAYS_DATES_KEY) ?? {}) as Record<string, HolidayEntry>;
    const { date } = zonedParts(now, fallbackZone);
    for (const [key, entry] of Object.entries(dates)) {
      if (!entry || !toBoolean(entry.enabled, true)) continue;
      if (!holidayKeyMatches(key, date)) continue;
      return closed('holiday', text(
        entry.message ?? get(HOLIDAYS_MESSAGE_KEY),
        DEFAULT_HOLIDAY_MESSAGE
      ));
    }
  }

  return open;
}
