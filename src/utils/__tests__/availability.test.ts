/**
 * The availability gate — is the instance open, and if not, why (#1432).
 *
 * Every case here is a thing the configuration could already say and that
 * nothing enforced: `PolicyInformationPoint` held the implementations and no caller.
 */
import {
  resolveAvailability,
  scheduleIsOpen,
  holidayKeyMatches,
  zonedParts,
  type ReadProperty
} from '../availability';
import { MaintenanceState } from '../maintenanceState';

const BUSINESS_HOURS = {
  name: 'Standard Business Hours',
  timeZone: 'America/New_York',
  rules: [
    { days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], startTime: '09:00', endTime: '17:00', type: 'allow' },
    { days: ['saturday', 'sunday'], type: 'deny' }
  ],
  enabled: true
};

/** A reader over a plain map — no fallback parameter, by design. */
const reader = (values: Record<string, unknown>): ReadProperty => (key) => values[key];

/**
 * #1906: maintenance is the door's. What the gate passes in: the admin switch
 * restored from these values, and its visitor view.
 */
const maintenanceFrom = (values: Record<string, unknown>) => {
  const config = { getProperty: (key: string, fallback: unknown) => values[key] ?? fallback };
  const maintenance = new MaintenanceState();
  maintenance.restoreSwitch(config);
  return maintenance.visitorView(config);
};

// Monday 2026-09-21 14:00 New York = 18:00 UTC; Sunday is 2026-09-20.
const MONDAY_MIDDAY_NY = new Date('2026-09-21T18:00:00Z');
const MONDAY_NIGHT_NY = new Date('2026-09-22T03:00:00Z'); // 23:00 Monday in NY
const SUNDAY_MIDDAY_NY = new Date('2026-09-20T18:00:00Z');

describe('#1432 availability', () => {
  describe('open by default', () => {
    test('no switch on means open', () => {
      const state = resolveAvailability(reader({}), MONDAY_MIDDAY_NY);
      expect(state.blocked).toBe(false);
      expect(state.kind).toBeNull();
    });
  });

  describe('maintenance', () => {
    test('closes with the operator message and keeps its own allow-admins', () => {
      const values = {
        'ngdpbase.features.maintenance.enabled': true,
        'ngdpbase.features.maintenance.message': 'Back at noon',
        'ngdpbase.features.maintenance.allow-admins': false
      };
      const state = resolveAvailability(reader(values), MONDAY_MIDDAY_NY, maintenanceFrom(values));
      expect(state).toMatchObject({ blocked: true, kind: 'maintenance', message: 'Back at noon', allowAdmins: false });
    });

    test('wins over a schedule — "I closed it" is never reported as a schedule', () => {
      const values = {
        'ngdpbase.features.maintenance.enabled': true,
        'ngdpbase.access-control.business-hours.enabled': true,
        'ngdpbase.schedules': { 'business-hours': BUSINESS_HOURS }
      };
      const state = resolveAvailability(reader(values), SUNDAY_MIDDAY_NY, maintenanceFrom(values));
      expect(state.kind).toBe('maintenance');
    });
  });

  describe('business hours', () => {
    const values = {
      'ngdpbase.access-control.business-hours.enabled': true,
      'ngdpbase.schedules': { 'business-hours': BUSINESS_HOURS }
    };

    test('open inside the window', () => {
      expect(resolveAvailability(reader(values), MONDAY_MIDDAY_NY).blocked).toBe(false);
    });

    test('closed outside the window, with the schedule kind', () => {
      const state = resolveAvailability(reader(values), MONDAY_NIGHT_NY);
      expect(state).toMatchObject({ blocked: true, kind: 'schedule' });
      expect(state.message).toMatch(/closed/i);
    });

    test('closed on a denied day', () => {
      expect(resolveAvailability(reader(values), SUNDAY_MIDDAY_NY).kind).toBe('schedule');
    });

    test('the switch is what enforces it — the schedule alone does nothing', () => {
      const state = resolveAvailability(reader({ 'ngdpbase.schedules': { 'business-hours': BUSINESS_HOURS } }), SUNDAY_MIDDAY_NY);
      expect(state.blocked).toBe(false);
    });

    test('the operator can word it', () => {
      const state = resolveAvailability(reader({
        ...values,
        'ngdpbase.schedules': { 'business-hours': { ...BUSINESS_HOURS, message: 'Open 9–5 Eastern' } }
      }), SUNDAY_MIDDAY_NY);
      expect(state.message).toBe('Open 9–5 Eastern');
    });

    test('an admin is never locked out by a schedule — there is no switch to flip from outside', () => {
      expect(resolveAvailability(reader(values), SUNDAY_MIDDAY_NY).allowAdmins).toBe(true);
    });
  });

  describe('holidays', () => {
    const values = {
      'ngdpbase.holidays.enabled': true,
      'ngdpbase.time-zone': 'UTC',
      'ngdpbase.holidays.dates': {
        '*-12-25': { name: 'Christmas Day', message: 'Closed for Christmas', enabled: true },
        '2026-09-21': { name: 'One-off', message: 'Closed today only', enabled: true },
        '*-01-01': { name: 'New Year', message: 'Closed', enabled: false }
      }
    };

    test('a recurring date matches any year', () => {
      const state = resolveAvailability(reader(values), new Date('2031-12-25T10:00:00Z'));
      expect(state).toMatchObject({ blocked: true, kind: 'holiday', message: 'Closed for Christmas' });
    });

    test('an exact date matches only that day', () => {
      expect(resolveAvailability(reader(values), new Date('2026-09-21T10:00:00Z')).message).toBe('Closed today only');
      expect(resolveAvailability(reader(values), new Date('2027-09-21T10:00:00Z')).blocked).toBe(false);
    });

    test('a disabled entry does not close the site', () => {
      expect(resolveAvailability(reader(values), new Date('2027-01-01T10:00:00Z')).blocked).toBe(false);
    });

    test('the switch is what enforces it', () => {
      const { 'ngdpbase.holidays.enabled': _off, ...withoutSwitch } = values;
      expect(resolveAvailability(reader(withoutSwitch), new Date('2031-12-25T10:00:00Z')).blocked).toBe(false);
    });
  });

  describe('scheduleIsOpen', () => {
    test('a schedule with no rules is open — an empty schedule is not a lockout', () => {
      expect(scheduleIsOpen({ rules: [] }, MONDAY_MIDDAY_NY, 'UTC')).toBe(true);
    });

    test('a malformed window does not close the site', () => {
      expect(scheduleIsOpen({ rules: [{ days: ['monday'], startTime: 'nine', endTime: '17:00', type: 'allow' }] }, MONDAY_MIDDAY_NY, 'America/New_York')).toBe(true);
    });

    test('a window crossing midnight is handled', () => {
      const overnight = { timeZone: 'UTC', rules: [{ startTime: '22:00', endTime: '06:00', type: 'allow' }] };
      expect(scheduleIsOpen(overnight, new Date('2026-09-21T23:30:00Z'), 'UTC')).toBe(true);
      expect(scheduleIsOpen(overnight, new Date('2026-09-21T12:00:00Z'), 'UTC')).toBe(false);
    });
  });

  describe('zonedParts', () => {
    test('an unknown time zone falls back to UTC rather than closing the site', () => {
      expect(zonedParts(new Date('2026-09-21T18:00:00Z'), 'Mars/Olympus').date).toBe('2026-09-21');
    });

    test('#1998: the local year and month, which a month boundary needs, not the UTC ones', () => {
      // 00:30 on 1 November in Tokyo is still 31 October in UTC.
      const slot = new Date('2026-10-31T15:30:00Z');
      expect(zonedParts(slot, 'Asia/Tokyo')).toEqual({ day: 'sunday', minutes: 30, date: '2026-11-01', year: 2026, month: 11 });
      expect(zonedParts(slot, 'UTC')).toMatchObject({ date: '2026-10-31', year: 2026, month: 10 });
      // New Year's Eve 22:00 in New York is already 1 January in UTC.
      expect(zonedParts(new Date('2027-01-01T03:00:00Z'), 'America/New_York')).toMatchObject({ date: '2026-12-31', year: 2026, month: 12 });
    });
  });

  describe('holidayKeyMatches', () => {
    test.each([
      ['2026-12-25', '2026-12-25', true],
      ['*-12-25', '2031-12-25', true],
      ['*-12-25', '2031-12-26', false],
      ['2026-12-25', '2027-12-25', false]
    ])('%s vs %s', (key, date, expected) => {
      expect(holidayKeyMatches(key, date)).toBe(expected);
    });
  });
});
