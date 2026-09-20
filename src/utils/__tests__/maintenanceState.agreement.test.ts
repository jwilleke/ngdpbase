import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveAvailability } from '../availability';

/**
 * #1147 — "one switch, one state", made provable. #1432 — made structural.
 *
 * The original bug was not that either reader was wrong on its own: the gate
 * middleware and `ACLManager` read different sources, so the instance could be
 * half in maintenance, and which half depended on how it was switched on.
 * These tests drove both readers from one configuration and asserted the same
 * verdict.
 *
 * `ACLManager` no longer reads maintenance at all — #1432 removed
 * `checkContextRestrictions` and its four companions, none of which had a
 * caller, and the availability question moved to `src/utils/availability.ts`
 * behind the gate middleware. So the disagreement is now impossible by
 * construction rather than by agreement, and that is what these assert: one
 * reader exists, and it is the gate's.
 */
const __dirname_ = path.dirname(fileURLToPath(import.meta.url));
const aclSource = readFileSync(path.resolve(__dirname_, '../../managers/ACLManager.ts'), 'utf8');

describe('#1147/#1432 — there is one reader of the maintenance switch', () => {
  test('ACLManager does not read maintenance state', () => {
    expect(aclSource).not.toContain('resolveMaintenanceState');
    expect(aclSource).not.toContain('maintenanceState');
  });

  test('ACLManager holds none of the availability checks', () => {
    for (const gone of [
      'checkContextRestrictions',
      'checkMaintenanceMode',
      'checkBusinessHours',
      'checkEnhancedTimeRestrictions',
      'checkHolidayRestrictions'
    ]) {
      // The explanatory comment names them; a definition would be `  <name>(`.
      expect(aclSource).not.toMatch(new RegExp(`\\n\\s*(?:async\\s+)?${gone}\\s*\\(`));
    }
  });

  const configFrom = (values: Record<string, unknown>) => (key: string) => values[key];

  /** What the gate middleware in app.ts decides for a given request. */
  const gateBlocks = (values: Record<string, unknown>, isAdmin: boolean): boolean => {
    const state = resolveAvailability(configFrom(values));
    if (!state.blocked) return false;
    return !(state.allowAdmins && isAdmin);
  };

  const cases: Array<[string, Record<string, unknown>, boolean, boolean]> = [
    ['off, ordinary user', { 'ngdpbase.features.maintenance.enabled': false }, false, false],
    ['off, admin', { 'ngdpbase.features.maintenance.enabled': false }, true, false],
    ['on, ordinary user', { 'ngdpbase.features.maintenance.enabled': true }, false, true],
    ['on, admin permitted', { 'ngdpbase.features.maintenance.enabled': true }, true, false],
    [
      'on, admins excluded, admin',
      { 'ngdpbase.features.maintenance.enabled': true, 'ngdpbase.features.maintenance.allow-admins': false },
      true,
      true
    ],
    [
      'on, admins excluded, ordinary user',
      { 'ngdpbase.features.maintenance.enabled': true, 'ngdpbase.features.maintenance.allow-admins': false },
      false,
      true
    ]
  ];

  test.each(cases)('%s', (_name, values, isAdmin, expected) => {
    expect(gateBlocks(values, isAdmin)).toBe(expected);
  });
});
