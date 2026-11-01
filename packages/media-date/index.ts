/**
 * Filename → capture-date parser, the one implementation of it.
 *
 * ngdpbase uses it when a media file carries no usable EXIF/QuickTime date, and
 * mjs-media-handling uses a built copy of it to place and stamp files. Both must read a name the same way, which is why it is one package.
 *
 * It is a pure function of the name: no filesystem, no network, no server.
 *
 * Missing parts are filled with fixed, documented values — see FAKE_MONTH below
 * and README.md. Callers that must know what was real read `parseFilenameDate`,
 * whose `month`/`day`/`time` are null where the name did not carry them.
 */

/** Written when the name gives a year but no month. */
export const FAKE_MONTH = 6;
/** Written when the name gives no day of the month. */
export const FAKE_DAY = 15;
/** Written when the name gives no time of day. */
export const FAKE_TIME = '11:59:00';

/** Earliest surviving photograph. */
const YEAR_MIN = 1826;

/** Unix stamps outside 2000-01-01 .. 2100-01-01 UTC are not dates. */
const EPOCH_MIN = 946684800;
const EPOCH_MAX = 4102444800;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

/** What a filename said, with null for each part it did not say. */
export interface FilenameDate {
  year: number;
  month: number | null;
  day: number | null;
  /** `HH:MM:SS`, only when the name carried a valid time. */
  time: string | null;
  /** Which rule matched, e.g. `filename:YYYY-MM-DD`. */
  source: string;
}

function okYear(y: number): boolean {
  return y >= YEAR_MIN && y <= new Date().getUTCFullYear() + 1;
}

/** A real calendar date: 2026-02-31 is not one. */
function okDate(y: number, mo: number, d: number): boolean {
  if (!okYear(y) || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** `HH:MM:SS` when in range. An out-of-range time never costs the date. */
function okTime(h: string | undefined, mi: string | undefined, s: string | undefined): string | null {
  if (h === undefined || mi === undefined || s === undefined) return null;
  if (+h > 23 || +mi > 59 || +s > 59) return null;
  return [h, mi, s].map((part) => part.padStart(2, '0')).join(':');
}

function dated(y: number, mo: number, d: number, time: string | null, source: string): FilenameDate | null {
  return okDate(y, mo, d) ? { year: y, month: mo, day: d, time, source } : null;
}

/**
 * Ordered, most specific first; the first that both matches and validates wins.
 * The digit boundaries are what stop a serial reading as a date: without them
 * `Label_1663020003` was year 1663.
 */
const MATCHERS: ReadonlyArray<(name: string) => FilenameDate | null> = [
  // 2026-04-03[_14.00.00] / 2010-05-24-045250-Ireland / 2026-04-03-IMG_4654.
  // Six digits after the date read as a time, even when they are a sequence
  // number, the same bet the compact form below makes.
  (name) => {
    const m = name.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)(?:[ T_-](\d{2})[:.-]?(\d{2})[:.-]?(\d{2}))?/);
    return m && dated(+m[1], +m[2], +m[3], okTime(m[4], m[5], m[6]), 'filename:YYYY-MM-DD');
  },

  // PXL_20260113_123414708 / Screenshot_20260113-123414. Milliseconds may follow.
  (name) => {
    const m = name.match(/(?<!\d)(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/);
    const time = m && okTime(m[4], m[5], m[6]);
    return m && time ? dated(+m[1], +m[2], +m[3], time, 'filename:YYYYMMDD') : null;
  },

  // 20090420123754.m2ts / VID-20261003-WA0002.mp4 / 20260113.jpg. Eight or
  // fourteen digits exactly, so a ten-digit Unix stamp is never read as a date.
  (name) => {
    const m = name.match(/(?<!\d)(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?(?!\d)/);
    return m && dated(+m[1], +m[2], +m[3], okTime(m[4], m[5], m[6]), 'filename:YYYYMMDD');
  },

  // US order, always: Cam Front Walk - 4-3-2026 / Back - 12-11-2024 is December 11.
  (name) => {
    const m = name.match(/(?<!\d)(\d{1,2})-(\d{1,2})-(\d{4})(?!\d)/);
    return m && dated(+m[3], +m[1], +m[2], null, 'filename:M-D-YYYY');
  },

  // Feb_20_2026[_19_25_04] / February_5_2026 / Drive - May 29, 2025, 15_11_57
  (name) => {
    const m = name.match(/(?<![A-Za-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[_\- ](\d{1,2}),?[_\- ](\d{4})(?!\d)(?:,?[_\- ](\d{1,2})[_\- ](\d{1,2})[_\- ](\d{1,2}))?/i);
    return m && dated(+m[3], MONTHS[m[1].toLowerCase()], +m[2], okTime(m[4], m[5], m[6]), 'filename:MonthName');
  },

  // Unix milliseconds, then seconds. The calendar day in UTC, and no time: the
  // name says when in UTC, a capture date is a local clock reading.
  (name) => {
    for (const [digits, divisor, label] of [[13, 1000, 'unix-ms'], [10, 1, 'unix-s']] as const) {
      const m = name.match(new RegExp(`(?<!\\d)(\\d{${digits}})(?!\\d)`));
      if (!m) continue;
      const secs = Math.floor(+m[1] / divisor);
      if (secs < EPOCH_MIN || secs > EPOCH_MAX) continue;
      const when = new Date(secs * 1000);
      return dated(when.getUTCFullYear(), when.getUTCMonth() + 1, when.getUTCDate(), null, `filename:${label}`);
    }
    return null;
  },

  // YYYY-MM, only separated: a bare six-digit run is not a month.
  (name) => {
    const m = name.match(/(?<!\d)(\d{4})[-_](\d{2})(?!\d)/);
    if (!m || !okYear(+m[1]) || +m[2] < 1 || +m[2] > 12) return null;
    return { year: +m[1], month: +m[2], day: null, time: null, source: 'filename:YYYY-MM' };
  },

  // A bare year: scan-1990.jpg
  (name) => {
    const m = name.match(/(?<!\d)(\d{4})(?!\d)/);
    if (!m || !okYear(+m[1])) return null;
    return { year: +m[1], month: null, day: null, time: null, source: 'filename:YYYY' };
  }
];

/** What the name itself says, nothing filled in. Null when it says nothing. */
export function parseFilenameDate(filename: string): FilenameDate | null {
  if (!filename) return null;
  const base = filename.split(/[\\/]/).pop() ?? '';
  for (const matcher of MATCHERS) {
    const result = matcher(base);
    if (result) return result;
  }
  return null;
}

/** `YYYY-MM-DD HH:MM:SS`, with FAKE_MONTH, FAKE_DAY and FAKE_TIME where missing. */
export function fillFilenameDate(date: FilenameDate): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.year}-${pad(date.month ?? FAKE_MONTH)}-${pad(date.day ?? FAKE_DAY)} ${date.time ?? FAKE_TIME}`;
}

/** The capture date a filename gives, filled in; null when it gives none. */
export function parseDateFromFilename(filename: string): string | null {
  const date = parseFilenameDate(filename);
  return date ? fillFilenameDate(date) : null;
}
