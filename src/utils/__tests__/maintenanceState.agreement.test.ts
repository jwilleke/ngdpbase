import { resolveMaintenanceState } from '../maintenanceState';
import ACLManager from '../../managers/ACLManager';

/**
 * #1147 — "one switch, one state", made provable.
 *
 * The bug was not that either reader was wrong on its own. It was that the
 * gate middleware and ACLManager read different sources, so the instance could
 * be half in maintenance and which half depended on how it was switched on.
 *
 * These tests drive both readers from one configuration and assert they reach
 * the same verdict. They fail if a future change gives either its own source.
 */
describe('#1147 — the gate and ACLManager cannot disagree', () => {
  const configFrom = (values: Record<string, unknown>) => ({
    getProperty: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback)
  });

  const engineWith = (values: Record<string, unknown>) => ({
    getManager: (name: string) => (name === 'ConfigurationManager' ? configFrom(values) : null)
  });

  /** What the gate middleware in app.ts decides for a given request. */
  const gateBlocks = (values: Record<string, unknown>, isAdmin: boolean): boolean => {
    const state = resolveMaintenanceState((k, d) => configFrom(values).getProperty(k, d));
    if (!state.enabled) return false;
    return !(state.allowAdmins && isAdmin);
  };

  /**
   * What ACLManager decides for the same configuration.
   *
   * Narrowed to the MAINTENANCE verdict specifically. `checkContextRestrictions`
   * also applies time-of-day and schedule rules, and comparing the whole result
   * would make this test fail for reasons that have nothing to do with #1147.
   */
  const aclBlocks = async (values: Record<string, unknown>, isAdmin: boolean): Promise<boolean> => {
    const acl = new ACLManager(engineWith(values));
    const user = { username: 'someone', roles: isAdmin ? ['admin'] : ['reader'], isAuthenticated: true };
    const result = await acl.checkContextRestrictions(user, {});
    return result.allowed === false && result.reason === 'maintenance_mode';
  };

  const cases: Array<[string, Record<string, unknown>, boolean]> = [
    ['off, ordinary user', { 'ngdpbase.features.maintenance.enabled': false }, false],
    ['off, admin', { 'ngdpbase.features.maintenance.enabled': false }, true],
    ['on, ordinary user', { 'ngdpbase.features.maintenance.enabled': true }, false],
    ['on, admin permitted', { 'ngdpbase.features.maintenance.enabled': true }, true],
    [
      'on, admins excluded, admin',
      {
        'ngdpbase.features.maintenance.enabled': true,
        'ngdpbase.features.maintenance.allow-admins': false
      },
      true
    ],
    [
      'on, admins excluded, ordinary user',
      {
        'ngdpbase.features.maintenance.enabled': true,
        'ngdpbase.features.maintenance.allow-admins': false
      },
      false
    ]
  ];

  test.each(cases)('%s — both readers agree', async (_name, values, isAdmin) => {
    const gate = gateBlocks(values, isAdmin);
    const acl = await aclBlocks(values, isAdmin);
    expect({ gate, acl }).toEqual({ gate, acl: gate });
  });

  test('the documented config key alone closes the instance', () => {
    // The original defect: this key was inert because the gate read an
    // in-memory object configuration never populated.
    expect(gateBlocks({ 'ngdpbase.features.maintenance.enabled': true }, false)).toBe(true);
  });

  test('allow-admins false actually excludes an admin', async () => {
    // ACLManager read allowAdmins and then ignored it, consulting allowedRoles
    // which nothing set — so the admin role was always let through.
    const values = {
      'ngdpbase.features.maintenance.enabled': true,
      'ngdpbase.features.maintenance.allow-admins': false
    };
    expect(gateBlocks(values, true)).toBe(true);
    expect(await aclBlocks(values, true)).toBe(true);
  });
});
