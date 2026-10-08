/**
 * The schedule engine for scheduled jobs (#1713, epic #1611).
 *
 * A schedule is an iCalendar recurrence rule (RFC 5545 RRULE), the format the
 * calendar add-on already stores, with a start (`dtstart`) and a time zone.
 * Cron is not used: it cannot say "every 30 days" or "the last business day".
 * Named shorthands (`daily 06:00`, `end-of-month`, …) expand to an RRULE.
 *
 * Recurrence is computed on wall-clock time and then placed in the time zone,
 * so daylight saving does what a person expects:
 *   - spring forward: a slot inside the skipped hour runs at the next valid
 *     instant (02:30 becomes 03:30), rather than not at all;
 *   - fall back: a slot inside the repeated hour runs once, at its first
 *     occurrence.
 * A date that does not exist is skipped, as RFC 5545 says: `BYMONTHDAY=31`
 * skips short months; the last day of a month is `BYMONTHDAY=-1`. RFC 7529
 * (RSCALE / SKIP) is not used (operator, 2026-10-08).
 *
 * Pure: no configuration is read here. The caller passes the default time zone
 * (`ngdpbase.default.timezone`) and the minimum interval.
 *
 * @module utils/schedule
 */

import { RRuleTemporal } from 'rrule-temporal';
import { Temporal } from 'temporal-polyfill';

/** What a job declares. A string is a shorthand or a bare RRULE (`FREQ=…`). */
export type ScheduleInput = string | { rrule: string; dtstart?: string; tz?: string };

export interface ScheduleOptions {
  /** IANA time zone used when the schedule names none. */
  defaultTimeZone: string;
  /** Slots closer together than this are refused. Default 60 000 ms. */
  minIntervalMs?: number;
}

export interface Schedule {
  /** The RRULE that was compiled (after shorthand expansion). */
  rrule: string;
  /** The wall-clock start the recurrence is counted from, e.g. `2000-01-01T00:00:00`. */
  dtstart: string;
  timeZone: string;
  /** The first slot strictly after `after`, or null when the rule has ended. */
  nextSlot(after: Date): Date | null;
  /** Every slot in `[from, to]`, oldest first. */
  slotsBetween(from: Date, to: Date): Date[];
}

/**
 * The default start. Rules that count an interval (`every 30 days`) are
 * counted from it, so their phase is the same on every restart.
 */
const DEFAULT_DTSTART = '2000-01-01T00:00:00';

const TIME = String.raw`(?:\s+(?:at\s+)?(\d{1,2}):(\d{2}))?`;
const DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Hour and minute parts for an optional `HH:MM`; midnight when absent. */
function at(hour: string | undefined, minute: string | undefined): string {
  const h = hour === undefined ? 0 : Number(hour);
  const m = minute === undefined ? 0 : Number(minute);
  if (h > 23 || m > 59) throw new Error(`Invalid time ${hour}:${minute}`);
  return `BYHOUR=${h};BYMINUTE=${m}`;
}

/**
 * The shorthands, each expanding to one RRULE. Case-insensitive; a time is
 * optional where shown and defaults to 00:00.
 */
const SHORTHANDS: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^hourly$/i, () => 'FREQ=HOURLY;BYMINUTE=0'],
  [new RegExp(`^daily${TIME}$`, 'i'), (m) => `FREQ=DAILY;${at(m[1], m[2])}`],
  [new RegExp(`^weekly\\s+(mo|tu|we|th|fr|sa|su)${TIME}$`, 'i'), (m) => `FREQ=WEEKLY;BYDAY=${m[1].toUpperCase()};${at(m[2], m[3])}`],
  [/^every\s+(\d+)\s*m(?:in(?:utes?)?)?$/i, (m) => `FREQ=MINUTELY;INTERVAL=${Number(m[1])}`],
  [/^every\s+(\d+)\s*h(?:ours?)?$/i, (m) => `FREQ=HOURLY;INTERVAL=${Number(m[1])};BYMINUTE=0`],
  [new RegExp(`^every\\s+(\\d+)\\s*d(?:ays?)?${TIME}$`, 'i'), (m) => `FREQ=DAILY;INTERVAL=${Number(m[1])};${at(m[2], m[3])}`],
  [new RegExp(`^start-of-month${TIME}$`, 'i'), (m) => `FREQ=MONTHLY;BYMONTHDAY=1;${at(m[1], m[2])}`],
  [new RegExp(`^end-of-month${TIME}$`, 'i'), (m) => `FREQ=MONTHLY;BYMONTHDAY=-1;${at(m[1], m[2])}`],
  [new RegExp(`^last-business-day${TIME}$`, 'i'), (m) => `FREQ=MONTHLY;BYDAY=${DAYS.slice(0, 5).join(',')};BYSETPOS=-1;${at(m[1], m[2])}`],
  [new RegExp(`^end-of-quarter${TIME}$`, 'i'), (m) => `FREQ=MONTHLY;BYMONTH=3,6,9,12;BYMONTHDAY=-1;${at(m[1], m[2])}`],
  [new RegExp(`^start-of-year${TIME}$`, 'i'), (m) => `FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;${at(m[1], m[2])}`]
];

/** A shorthand's RRULE, a bare RRULE as given, or an error naming what was not understood. */
export function expandShorthand(text: string): string {
  const trimmed = text.trim();
  const bare = trimmed.replace(/^RRULE:/i, '');
  if (/(?:^|;)FREQ=/i.test(bare)) return bare;
  for (const [pattern, build] of SHORTHANDS) {
    const m = pattern.exec(trimmed);
    if (m) return build(m);
  }
  throw new Error(`Unknown schedule "${text}": use an RRULE (FREQ=…) or one of hourly, daily HH:MM, weekly MO HH:MM, every Nm / Nh / Nd, start-of-month, end-of-month, last-business-day, end-of-quarter, start-of-year`);
}

/** The same wall-clock reading, as an instant in UTC: the frame recurrence is computed in. */
function toWallUtc(instant: Date, timeZone: string): Temporal.ZonedDateTime {
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toZonedDateTime('UTC');
}

/** A wall-clock reading placed in the time zone; a skipped hour moves forward, a repeated one takes its first. */
function fromWallUtc(wall: { toString(): string }, timeZone: string): Date {
  const plain = Temporal.PlainDateTime.from(wall.toString().replace(/[+-]\d{2}:\d{2}\[UTC\]$|Z?\[UTC\]$/, ''));
  return new Date(plain.toZonedDateTime(timeZone, { disambiguation: 'compatible' }).epochMilliseconds);
}

/**
 * Compile a schedule. Throws, with a message a job author can act on, for an
 * unknown shorthand, an invalid rule, an unknown time zone, `FREQ=SECONDLY`,
 * an `RSCALE` other than GREGORIAN, or slots closer than the minimum interval.
 */
export function parseSchedule(input: ScheduleInput, options: ScheduleOptions): Schedule {
  const spec = typeof input === 'string' ? { rrule: input } : input;
  const rrule = expandShorthand(spec.rrule);
  const timeZone = spec.tz ?? options.defaultTimeZone;
  const dtstart = spec.dtstart ?? DEFAULT_DTSTART;
  const minIntervalMs = options.minIntervalMs ?? 60_000;

  if (/(^|;)FREQ=SECONDLY(;|$)/i.test(rrule)) throw new Error(`Schedule "${spec.rrule}": FREQ=SECONDLY is not allowed`);
  const rscale = /(?:^|;)RSCALE=([^;]+)/i.exec(rrule);
  if (rscale && rscale[1].toUpperCase() !== 'GREGORIAN') throw new Error(`Schedule "${spec.rrule}": RSCALE=${rscale[1]} is not supported`);

  try {
    Temporal.Now.instant().toZonedDateTimeISO(timeZone);
  } catch (err) {
    throw new Error(`Schedule "${spec.rrule}": unknown time zone "${timeZone}"`, { cause: err });
  }

  let start: Temporal.ZonedDateTime;
  try {
    start = Temporal.PlainDateTime.from(dtstart).toZonedDateTime('UTC');
  } catch (err) {
    throw new Error(`Schedule "${spec.rrule}": dtstart "${dtstart}" is not a wall-clock date-time (YYYY-MM-DDTHH:MM:SS)`, { cause: err });
  }

  let rule: RRuleTemporal;
  try {
    rule = new RRuleTemporal({ rruleString: rrule, dtstart: start });
  } catch (err) {
    throw new Error(`Schedule "${spec.rrule}": ${(err as Error).message}`, { cause: err });
  }

  const schedule: Schedule = {
    rrule,
    dtstart,
    timeZone,
    nextSlot(after: Date): Date | null {
      // Ask in the wall-clock frame, then place the answer in the zone. A slot
      // that lands at or before `after` once placed (the repeated hour) is
      // passed over.
      let from = toWallUtc(after, timeZone);
      for (let guard = 0; guard < 4; guard++) {
        const next = rule.next(from, false);
        if (!next) return null;
        const slot = fromWallUtc(next, timeZone);
        if (slot.getTime() > after.getTime()) return slot;
        from = Temporal.ZonedDateTime.from(next.toString());
      }
      return null;
    },
    slotsBetween(from: Date, to: Date): Date[] {
      if (to.getTime() < from.getTime()) return [];
      // Widen by a day so slots moved across the edge by daylight saving are
      // seen, then keep the ones whose instant is in range.
      const day = 24 * 60 * 60 * 1000;
      const hits = rule.between(
        new Date(toWallUtc(new Date(from.getTime() - day), timeZone).epochMilliseconds),
        new Date(toWallUtc(new Date(to.getTime() + day), timeZone).epochMilliseconds),
        true
      );
      const seen = new Set<number>();
      const out: Date[] = [];
      for (const hit of hits) {
        const slot = fromWallUtc(hit, timeZone);
        const t = slot.getTime();
        if (t < from.getTime() || t > to.getTime() || seen.has(t)) continue;
        seen.add(t);
        out.push(slot);
      }
      return out;
    }
  };

  // The minimum interval, measured on the rule's first slots from its start.
  let previous = schedule.nextSlot(new Date(fromWallUtc(start, timeZone).getTime() - 1));
  for (let i = 0; previous && i < 48; i++) {
    const next = schedule.nextSlot(previous);
    if (!next) break;
    if (next.getTime() - previous.getTime() < minIntervalMs) {
      throw new Error(`Schedule "${spec.rrule}": slots ${Math.round((next.getTime() - previous.getTime()) / 1000)} s apart are closer than the minimum interval of ${Math.round(minIntervalMs / 1000)} s`);
    }
    previous = next;
  }

  return schedule;
}
