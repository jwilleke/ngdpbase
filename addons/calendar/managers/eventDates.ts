/**
 * The dates an event may carry (#2546).
 *
 * The .ics feed writes a date as `YYYYMMDDTHHMMSSZ`, from the date's ISO form. JavaScript
 * reads dates from the year -271821 to 275760, but only the years 0 to 9999 have a four-digit
 * ISO form; any other is written as a malformed date and the whole feed is then refused for
 * every subscriber. A date outside the years 0 to 9999 (read in UTC, as the feed writes it)
 * is therefore refused when an event is written and left out when the feed is built.
 *
 * Any text JavaScript's `Date` reads is accepted, within that range: `2026-12-01`,
 * `2026-12-01T10:00:00` (read as local time) or `2026-12-01T10:00:00Z`.
 */
export const FIRST_YEAR = 0;
export const LAST_YEAR = 9999;

/** An event with no end runs this long in the feed (RFC 5545 needs an end or a duration). */
export const DEFAULT_LENGTH_MS = 60 * 60 * 1000;

/** Whether `date` is a real date in the years the feed can write. */
export function isWritableDate(date: Date): boolean {
  const time = date.getTime();
  if (Number.isNaN(time)) return false;
  const year = date.getUTCFullYear();
  return year >= FIRST_YEAR && year <= LAST_YEAR;
}

/** A date from text, or undefined when it is not a date the feed can write. */
export function readWritableDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return isWritableDate(date) ? date : undefined;
}

/** The end an event with this start has when it names none. */
export function defaultEnd(start: Date): Date {
  return new Date(start.getTime() + DEFAULT_LENGTH_MS);
}
