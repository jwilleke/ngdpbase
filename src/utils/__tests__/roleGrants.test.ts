/**
 * What each role is granted, for the admin user forms — #1521.
 */
import { roleGrants } from '../roleGrants';

describe('roleGrants (#1521)', () => {
  test('collects what each role\'s policies allow, across policies', () => {
    const grants = roleGrants([
      { id: 'r', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-read'] },
      { id: 'c', effect: 'allow', subjects: [{ type: 'role', value: 'contributor' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-read', 'page-edit'] },
      { id: 'j', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }, { type: 'role', value: 'contributor' }], actions: ['journal-read'] }
    ] as never);
    expect(grants.reader.allows.map((g) => g.action)).toEqual(['journal-read', 'page-read']);
    expect(grants.contributor.allows.map((g) => g.action)).toEqual(['journal-read', 'page-edit', 'page-read']);
  });

  test('a grant on some resources only is marked limited; one also granted everywhere is not', () => {
    const grants = roleGrants([
      { id: 'p', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], resources: [{ type: 'system-category', pattern: 'general' }], actions: ['page-public'] },
      { id: 'x', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], resources: [{ type: 'system-category', pattern: 'journal' }], actions: ['page-read'] },
      { id: 'y', effect: 'allow', subjects: [{ type: 'role', value: 'reader' }], resources: [{ type: 'page', pattern: '*' }], actions: ['page-read'] }
    ] as never);
    expect(grants.reader.allows).toEqual([
      { action: 'page-public', limited: true, where: ['system-category'] },
      { action: 'page-read', limited: false, where: [] }
    ]);
  });

  test('a grant inside vaults only is limited, even with pattern * (#1539)', () => {
    const grants = roleGrants([
      { id: 'v', effect: 'allow', subjects: [{ type: 'role', value: 'vault-owner' }], resources: [{ type: 'vault', pattern: '*' }], actions: ['page-delete'] }
    ] as never);
    expect(grants['vault-owner'].allows).toEqual([{ action: 'page-delete', limited: true, where: ['vault'] }]);
  });

  test('a higher-priority deny takes a grant away; a lower-priority one does not (#1539, the evaluator\'s order)', () => {
    const grants = roleGrants([
      { id: 'a', effect: 'allow', priority: 50, subjects: [{ type: 'role', value: 'r' }], actions: ['page-edit', 'page-read'] },
      { id: 'd', effect: 'deny', priority: 90, subjects: [{ type: 'role', value: 'r' }], actions: ['page-edit'] },
      { id: 'low', effect: 'deny', priority: 10, subjects: [{ type: 'role', value: 'r' }], actions: ['page-read'] }
    ] as never);
    expect(grants.r.allows.map((g) => g.action)).toEqual(['page-read']);
    expect(grants.r.denies).toEqual(['page-edit', 'page-read']);
  });

  test('deny policies are listed as denies, not grants', () => {
    const grants = roleGrants([
      { id: 'd', effect: 'deny', subjects: [{ type: 'role', value: 'demo-admin' }], actions: ['page-edit'] }
    ] as never);
    expect(grants['demo-admin']).toEqual({ allows: [], denies: ['page-edit'] });
  });
});
