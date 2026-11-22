/**
 * #2391 slice 1: how the visibility setting reads a calendar's entry.
 *
 * - An id is looked up only among the names the configuration holds, so a name
 *   such as `__proto__` is treated like a calendar the configuration does not
 *   name (private).
 * - `enabled` counts as enabled only when it is missing or `true`; any other
 *   value leaves the calendar out.
 */
import { calendarGate, visibilityOf } from '../managers/calendarVisibility';

const everything = async () => true;

describe('a calendar id is looked up among the configured names only', () => {
  test.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])('%s is treated like an unnamed calendar', async (id) => {
    const config = { calendars: { open: { visibility: 'public' } } };
    expect(visibilityOf(config, id)).toBe('private');
    expect(await calendarGate(async () => false, config)(id)).toBe(false);
    expect(await calendarGate(async p => p === 'calendar-manage', config)(id)).toBe(true);
  });

  test('a configured calendar is still found', () => {
    expect(visibilityOf({ calendars: { open: { visibility: 'public' } } }, 'open')).toBe('public');
  });
});

describe('enabled', () => {
  const gate = (enabled: unknown) => calendarGate(everything, { calendars: { c: { visibility: 'public', enabled } } });

  test.each([[true], [undefined]])('%s counts as enabled', async (value) => {
    expect(await gate(value)('c')).toBe(true);
  });

  test.each([[false], ['false'], ['true'], [0], [1], [null], [''], [{}]])('%j leaves the calendar out', async (value) => {
    expect(await gate(value)('c')).toBe(false);
  });
});
