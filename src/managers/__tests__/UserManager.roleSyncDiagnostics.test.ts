/**
 * Role-assignment diagnostics (#1027).
 *
 * An instance with no anchor Organization cannot attach a Person to a Role, so
 * NO role is ever assigned — including `admin` on the default admin account.
 * That used to happen in complete silence: syncRoleAdd/syncRoleRemove had five
 * bare `return`s between them and logged nothing, so a failed assignment was
 * indistinguishable from a successful one.
 *
 * These tests pin the diagnostics rather than the behaviour. The behaviour
 * (assignment does not happen) is correct and unchanged — the bug was that
 * nobody could tell.
 */

import UserManager from '../UserManager';
import logger from '../../utils/logger';

const PERSON_ID = 'urn:uuid:22222222-2222-2222-2222-222222222222';
const ORG_ID = 'https://example.com/';

const makeConfigManager = () => ({
  getProperty: vi.fn((key: string, defaultValue: unknown) => {
    const config: Record<string, unknown> = {
      'ngdpbase.user.provider.default': 'fileuserprovider',
      'ngdpbase.user.provider': 'fileuserprovider',
      'ngdpbase.roles.definitions': { admin: { name: 'admin', permissions: [] } },
      'ngdpbase.permissions.definitions': {}
    };
    return key in config ? config[key] : defaultValue;
  }),
  getResolvedDataPath: vi.fn(() => '/tmp/ngdpbase-test-users')
});

function makeEngine(opts: { installOrg?: unknown; person?: unknown } = {}) {
  const roleManager = {
    getByOrgAndPosition: vi.fn(async () => null),
    create: vi.fn(async (r: unknown) => r),
    update: vi.fn(async () => null),
    list: vi.fn(async () => [])
  };
  const personManager = {
    getByIdentifier: vi.fn(async () =>
      opts.person === null ? null : (opts.person ?? { '@id': PERSON_ID })
    ),
    create: vi.fn(async (p: unknown) => p),
    update: vi.fn(async () => null)
  };
  const organizationManager = {
    getInstallOrg: vi.fn(async () =>
      opts.installOrg === null ? null : (opts.installOrg ?? { '@id': ORG_ID, url: ORG_ID })
    )
  };

  return {
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') return makeConfigManager();
      if (name === 'PersonManager') return personManager;
      if (name === 'OrganizationManager') return organizationManager;
      if (name === 'RoleManager') return roleManager;
      return null;
    }),
    getConfig: vi.fn(() => ({ get: vi.fn() }))
  };
}

/** syncRoleAdd/Remove are private; exercised through the documented seam. */
type RoleSync = {
  syncRoleAdd(username: string, roleName: string): Promise<void>;
  syncRoleRemove(username: string, roleName: string): Promise<void>;
};

function warnings(): string {
  return (logger.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((c) => String(c[0]))
    .join('\n');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('role assignment with no anchor Organization (#1027)', () => {
  test('warns instead of failing silently, naming user, role and cause', async () => {
    const manager = new UserManager(makeEngine({ installOrg: null }));
    await (manager as unknown as RoleSync).syncRoleAdd('admin', 'admin');

    const out = warnings();
    expect(out).toContain('admin');
    expect(out).toMatch(/anchor Organization/i);
    // Names the key to set — a warning that does not say what to do is nearly
    // as useless as no warning.
    expect(out).toContain('ngdpbase.application.organization.file');
  });

  test('warns on revocation too — the more dangerous direction', async () => {
    // A revoke that silently does nothing leaves the operator believing access
    // was removed when it was not.
    const manager = new UserManager(makeEngine({ installOrg: null }));
    await (manager as unknown as RoleSync).syncRoleRemove('bob', 'editor');

    const out = warnings();
    expect(out).toContain('bob');
    expect(out).toContain('editor');
    expect(out).toMatch(/anchor Organization/i);
  });

  test('warns when there is no Person record for the username', async () => {
    const manager = new UserManager(makeEngine({ person: null }));
    await (manager as unknown as RoleSync).syncRoleAdd('ghost', 'admin');

    expect(warnings()).toMatch(/no Person record/i);
  });
});

describe('role assignment with a healthy anchor Organization', () => {
  test('does not warn — diagnostics must not fire on the happy path', async () => {
    // Otherwise the warning becomes noise and stops being read, which is how
    // this class of failure hides in the first place.
    const manager = new UserManager(makeEngine());
    await (manager as unknown as RoleSync).syncRoleAdd('alice', 'admin');

    expect(warnings()).not.toMatch(/anchor Organization/i);
  });
});
