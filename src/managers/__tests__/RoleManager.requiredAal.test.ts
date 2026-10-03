/**
 * #1523 — each role's required-aal, read from the catalogue. Every shipped
 * role is at AAL1 (decided 2026-10-03); anonymous has none.
 */
import RoleManager from '../RoleManager';

const withDefinitions = (definitions: Record<string, unknown>) => new RoleManager({
  getManager: (name: string) => (name === 'ConfigurationManager'
    ? { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.roles.definitions' ? definitions : d) }
    : null)
});

describe('RoleManager.roleRequiredAal (#1523)', () => {
  test('only 1, 2 or 3 count', () => {
    const rm = withDefinitions({
      admin: { 'required-aal': 2 }, reader: { 'required-aal': 1 }, odd: { 'required-aal': '2' }, big: { 'required-aal': 4 }, none: {}
    });
    expect(rm.roleRequiredAal()).toEqual({ admin: 2, reader: 1 });
  });

  test('the shipped catalogue: every role at AAL1, anonymous none', () => {
    const shipped = (require('../../../config/app-default-config.json') as Record<string, unknown>)['ngdpbase.roles.definitions'] as Record<string, unknown>;
    const levels = withDefinitions(shipped).roleRequiredAal();
    expect(levels).not.toHaveProperty('anonymous');
    expect(Object.values(levels).every(l => l === 1)).toBe(true);
    expect(Object.keys(levels).sort()).toEqual(['admin', 'contributor', 'demo-admin', 'editor', 'reader', 'user-admin', 'vault-owner']);
  });
});
