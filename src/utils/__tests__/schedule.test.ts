/**
 * The schedule engine (#1713): RRULE and shorthands, time zones, daylight
 * saving, dates that do not exist, and the refusals.
 */

import { expandShorthand, parseSchedule } from '../schedule';

const UTC = { defaultTimeZone: 'UTC' };
const NY = { defaultTimeZone: 'America/New_York' };
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const slots = (input: Parameters<typeof parseSchedule>[0], from: string, to: string, options = UTC): string[] =>
  parseSchedule(input, options).slotsBetween(new Date(from), new Date(to)).map((d) => d.toISOString());

describe('the examples the operator gave (#1611)', () => {
  test('end of month', () => {
    expect(slots('FREQ=MONTHLY;BYMONTHDAY=-1;BYHOUR=23;BYMINUTE=0', '2026-01-01T00:00Z', '2026-04-30T23:59Z')).toEqual([
      '2026-01-31T23:00:00.000Z', '2026-02-28T23:00:00.000Z', '2026-03-31T23:00:00.000Z', '2026-04-30T23:00:00.000Z'
    ]);
    expect(slots('end-of-month 23:00', '2028-02-01T00:00Z', '2028-02-29T23:59Z')).toEqual(['2028-02-29T23:00:00.000Z']);
  });

  test('start of year', () => {
    expect(slots('start-of-year', '2025-06-01T00:00Z', '2028-06-01T00:00Z')).toEqual([
      '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z'
    ]);
  });

  test('every 30 days keeps the same phase whenever it is asked', () => {
    const a = parseSchedule('every 30 days', UTC).nextSlot(new Date('2026-10-08T12:00Z'));
    const b = parseSchedule('FREQ=DAILY;INTERVAL=30;BYHOUR=0;BYMINUTE=0', UTC).nextSlot(new Date('2026-10-08T12:00Z'));
    expect(iso(a)).toBe(iso(b));
    const next = parseSchedule('every 30 days', UTC).nextSlot(a as Date);
    expect((next as Date).getTime() - (a as Date).getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test('last business day of the month', () => {
    expect(slots('last-business-day 17:00', '2026-01-01T00:00Z', '2026-06-30T23:59Z')).toEqual([
      '2026-01-30T17:00:00.000Z', '2026-02-27T17:00:00.000Z', '2026-03-31T17:00:00.000Z',
      '2026-04-30T17:00:00.000Z', '2026-05-29T17:00:00.000Z', '2026-06-30T17:00:00.000Z'
    ]);
  });

  test('quarter end', () => {
    expect(slots('end-of-quarter', '2026-01-01T00:00Z', '2026-12-31T23:59Z')).toEqual([
      '2026-03-31T00:00:00.000Z', '2026-06-30T00:00:00.000Z', '2026-09-30T00:00:00.000Z', '2026-12-31T00:00:00.000Z'
    ]);
  });

  test('daily at 06:00 in the instance time zone', () => {
    expect(iso(parseSchedule('daily 06:00', NY).nextSlot(new Date('2026-07-01T12:00Z')))).toBe('2026-07-02T10:00:00.000Z');
    expect(iso(parseSchedule({ rrule: 'daily 06:00', tz: 'Europe/Berlin' }, NY).nextSlot(new Date('2026-07-01T12:00Z')))).toBe('2026-07-02T04:00:00.000Z');
  });
});

describe('daylight saving (America/New_York, 2026)', () => {
  test('spring forward: a slot in the skipped hour runs at the next valid instant', () => {
    // 2026-03-08 02:00 → 03:00 local. 02:30 does not exist that day.
    expect(slots('daily 02:30', '2026-03-07T00:00Z', '2026-03-09T23:59Z', NY)).toEqual([
      '2026-03-07T07:30:00.000Z', // 02:30 EST
      '2026-03-08T07:30:00.000Z', // 03:30 EDT, the next valid instant
      '2026-03-09T06:30:00.000Z' // 02:30 EDT
    ]);
  });

  test('fall back: a slot in the repeated hour runs once', () => {
    // 2026-11-01 02:00 → 01:00 local. 01:30 happens twice.
    const day = slots('daily 01:30', '2026-11-01T00:00Z', '2026-11-01T23:59Z', NY);
    expect(day).toEqual(['2026-11-01T05:30:00.000Z']); // the first 01:30, EDT
    const s = parseSchedule('daily 01:30', NY);
    expect(iso(s.nextSlot(new Date('2026-11-01T05:30Z')))).toBe('2026-11-02T06:30:00.000Z');
  });
});

describe('dates that do not exist', () => {
  test('BYMONTHDAY=31 skips months without a 31st', () => {
    expect(slots('FREQ=MONTHLY;BYMONTHDAY=31;BYHOUR=0;BYMINUTE=0', '2026-01-01T00:00Z', '2026-06-30T23:59Z')).toEqual([
      '2026-01-31T00:00:00.000Z', '2026-03-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z'
    ]);
  });
});

describe('refusals', () => {
  test('slots closer than the minimum interval', () => {
    expect(() => parseSchedule('every 30 min', { ...UTC, minIntervalMs: 60 * 60 * 1000 })).toThrow(/closer than the minimum interval/);
    expect(() => parseSchedule('FREQ=HOURLY;BYMINUTE=0,1', UTC)).not.toThrow();
    expect(() => parseSchedule('every 1m', { ...UTC, minIntervalMs: 120_000 })).toThrow(/minimum interval/);
  });

  test('FREQ=SECONDLY', () => {
    expect(() => parseSchedule('FREQ=SECONDLY;INTERVAL=90', UTC)).toThrow(/SECONDLY is not allowed/);
  });

  test('an RSCALE other than GREGORIAN', () => {
    expect(() => parseSchedule('RSCALE=HEBREW;FREQ=YEARLY', UTC)).toThrow(/RSCALE=HEBREW is not supported/);
  });

  test('an unknown shorthand, an invalid rule, an unknown zone, a bad start', () => {
    expect(() => expandShorthand('fortnightly')).toThrow(/Unknown schedule "fortnightly"/);
    expect(() => parseSchedule('FREQ=BOGUS', UTC)).toThrow(/Invalid FREQ/);
    expect(() => parseSchedule({ rrule: 'hourly', tz: 'Mars/Olympus' }, UTC)).toThrow(/unknown time zone/);
    expect(() => parseSchedule({ rrule: 'hourly', dtstart: 'yesterday' }, UTC)).toThrow(/not a wall-clock date-time/);
    expect(() => expandShorthand('daily 25:00')).toThrow(/Invalid time/);
  });
});

describe('shorthands', () => {
  test.each([
    ['hourly', 'FREQ=HOURLY;BYMINUTE=0'],
    ['Daily 6:05', 'FREQ=DAILY;BYHOUR=6;BYMINUTE=5'],
    ['weekly mo 09:00', 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0'],
    ['every 15m', 'FREQ=MINUTELY;INTERVAL=15'],
    ['every 2 hours', 'FREQ=HOURLY;INTERVAL=2;BYMINUTE=0'],
    ['RRULE:FREQ=WEEKLY;BYDAY=FR', 'FREQ=WEEKLY;BYDAY=FR']
  ])('%s expands to %s', (input, rrule) => {
    expect(expandShorthand(input)).toBe(rrule);
  });

  test('a rule that ends has no next slot', () => {
    expect(parseSchedule('FREQ=DAILY;COUNT=2', UTC).nextSlot(new Date('2026-01-01Z'))).toBeNull();
  });
});
