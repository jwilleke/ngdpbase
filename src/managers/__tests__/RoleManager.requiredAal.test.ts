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

  test('the shipped catalogue: admin and user-admin at AAL2 (since passkeys, #448), the rest AAL1, anonymous none', () => {
    const shipped = (require('../../../config/app-default-config.json') as Record<string, unknown>)['ngdpbase.roles.definitions'] as Record<string, unknown>;
    expect(withDefinitions(shipped).roleRequiredAal()).toEqual({
      admin: 2, 'user-admin': 2, editor: 1, contributor: 1, 'demo-admin': 1, 'vault-owner': 1, reader: 1
    });
  });

  test('operatorRequiredAal reads only what the operator set in custom config', () => {
    const rm = new RoleManager({
      getManager: (name: string) => (name === 'ConfigurationManager'
        ? { getProperty: (_k: string, d: unknown) => d, getCustomProperty: (k: string) => (k === 'ngdpbase.roles.definitions' ? { editor: { 'required-aal': 2 } } : undefined) }
        : null)
    });
    expect(rm.operatorRequiredAal()).toEqual({ editor: 2 });
  });
});
