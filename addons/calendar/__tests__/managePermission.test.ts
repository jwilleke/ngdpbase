/**
 * #2546 (slice 2 of #2391): how a calendar's `manage-permission` setting is read.
 *
 * - A calendar that names none, one the configuration does not name and one with
 *   an entry that is not an object ask `calendar-manage`, as before.
 * - A calendar that names a permission the site has declared asks that one.
 * - A name the site has not declared, a setting that is not text and an empty
 *   one resolve to no permission at all: nobody may manage that calendar.
 * - A site whose declared permissions cannot be read cannot vouch for a name,
 *   so a named permission fails closed; the default needs no vouching.
 */
import { MANAGE_PERMISSION } from '../managers/calendarVisibility';
import { managePermissionOf, resolveManagePermission, declaredPermissionNames } from '../managers/calendarManage';

const DECLARED = new Set(['calendar-manage', 'association-event-post']);

describe('managePermissionOf: the setting as written', () => {
  test('a calendar that names none asks calendar-manage', () => {
    expect(managePermissionOf({ calendars: { c: { workflow: 'managed' } } }, 'c')).toBe(MANAGE_PERMISSION);
  });

  test.each(['not-configured', '__proto__', 'constructor'])('a calendar the configuration does not name (%s) asks calendar-manage', (id) => {
    expect(managePermissionOf({ calendars: { c: { 'manage-permission': 'x' } } }, id)).toBe(MANAGE_PERMISSION);
  });

  test('a name is returned as written', () => {
    expect(managePermissionOf({ calendars: { c: { 'manage-permission': 'association-event-post' } } }, 'c')).toBe('association-event-post');
  });

  test.each([[42], [''], [null], [true], [{}], [['calendar-manage']]])('%j is no permission', (value) => {
    expect(managePermissionOf({ calendars: { c: { 'manage-permission': value } } }, 'c')).toBeNull();
  });
});

describe('resolveManagePermission: the permission to ask', () => {
  const config = {
    calendars: {
      plain: { workflow: 'managed' },
      events: { workflow: 'managed', 'manage-permission': 'association-event-post' },
      ghost: { workflow: 'managed', 'manage-permission': 'never-declared' },
      odd: { workflow: 'managed', 'manage-permission': 42 }
    }
  };

  test('none named: calendar-manage', () => {
    expect(resolveManagePermission(config, 'plain', DECLARED)).toBe('calendar-manage');
  });

  test('a declared name: that permission', () => {
    expect(resolveManagePermission(config, 'events', DECLARED)).toBe('association-event-post');
  });

  test('an undeclared name fails closed', () => {
    expect(resolveManagePermission(config, 'ghost', DECLARED)).toBeNull();
  });

  test('a setting that is not text fails closed', () => {
    expect(resolveManagePermission(config, 'odd', DECLARED)).toBeNull();
  });

  test('declared names that cannot be read: a named permission fails closed, the default does not', () => {
    expect(resolveManagePermission(config, 'events', null)).toBeNull();
    expect(resolveManagePermission(config, 'plain', null)).toBe('calendar-manage');
  });

  test('naming calendar-manage itself is the default', () => {
    const named = { calendars: { c: { 'manage-permission': 'calendar-manage' } } };
    expect(resolveManagePermission(named, 'c', null)).toBe('calendar-manage');
  });
});

describe('declaredPermissionNames', () => {
  test('reads the names the site declares', () => {
    const engine = { getManager: (n: string) => (n === 'ConfigurationManager' ? { getProperty: () => ({ a: {}, b: {} }) } : undefined) };
    expect([...(declaredPermissionNames(engine) ?? [])].sort()).toEqual(['a', 'b']);
  });

  test('no configuration manager, or nothing readable: null', () => {
    expect(declaredPermissionNames({ getManager: () => undefined })).toBeNull();
    expect(declaredPermissionNames({ getManager: () => ({ getProperty: () => null }) })).toBeNull();
    expect(declaredPermissionNames({ getManager: () => ({ getProperty: () => ['calendar-manage'] }) })).toBeNull();
  });
});
