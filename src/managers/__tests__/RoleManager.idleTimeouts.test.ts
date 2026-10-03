/**
 * #1546 — which roles set their own idle timeout, read from the role
 * catalogue. Only positive numbers count; none is the shipped default.
 */
import RoleManager from '../RoleManager';

const withDefinitions = (definitions: Record<string, unknown>) => new RoleManager({
  getManager: (name: string) => (name === 'ConfigurationManager'
    ? { getProperty: (k: string, d: unknown) => (k === 'ngdpbase.roles.definitions' ? definitions : d) }
    : null)
});

describe('RoleManager.roleIdleTimeouts (#1546)', () => {
  test('only roles with a positive idle-timeout-minutes are listed', () => {
    const rm = withDefinitions({
      admin: { name: 'admin', 'idle-timeout-minutes': 15 },
      editor: { name: 'editor', 'idle-timeout-minutes': 0 },
      reader: { name: 'reader' },
      odd: { name: 'odd', 'idle-timeout-minutes': '30' }
    });
    expect(rm.roleIdleTimeouts()).toEqual({ admin: 15 });
  });

  test('the shipped catalogue sets none', () => {
    const shipped = (require('../../../config/app-default-config.json') as Record<string, unknown>)['ngdpbase.roles.definitions'] as Record<string, unknown>;
    expect(withDefinitions(shipped).roleIdleTimeouts()).toEqual({});
  });
});
