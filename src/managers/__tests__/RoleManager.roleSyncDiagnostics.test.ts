/**
 * Role-assignment diagnostics (#1027), now refusals (#2015).
 *
 * An instance with no anchor Organization cannot attach a Person to a Role.
 * That used to happen in complete silence (#1027), then with a warning while
 * the account was still created without the role. Operator, 2026-10-23: a
 * role that cannot be added or removed is always an error, whatever the
 * cause — thrown to whoever asked, logged at error level, and an error
 * notification for admins. Never a warning.
 *
 * The membership writes are RoleManager's (#1431 step 12); they were
 * UserManager's syncRoleAdd / syncRoleRemove.
 */

import { roleManagerOver } from './__fixtures__/roleManagerOver';
import logger from '../../utils/logger';
import { RoleChangeError } from '../../utils/roleChangeError';

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

const notifications: Record<string, unknown>[] = [];

function makeEngine(opts: { installOrg?: unknown; person?: unknown } = {}) {
  const roleManager = {
    getByOrgAndPosition: vi.fn(async () => null),
    create: vi.fn(async (r: unknown) => r),
    update: vi.fn(async () => null),
    list: vi.fn(async () => [])
  };
  const lookup = vi.fn(async () =>
    opts.person === null ? null : (opts.person ?? { '@id': PERSON_ID })
  );
  const identityManager = {
    getById: vi.fn(async (_ctx: unknown, id: string) => ({ '@id': id, identifier: 'alice' })),
    getByIdentifier: lookup,
    getByUserIdentifier: lookup,
    create: vi.fn(async (p: unknown) => p),
    update: vi.fn(async () => null)
  };
  const organizationManager = {
    getInstallOrg: vi.fn(async () =>
      opts.installOrg === null ? null : (opts.installOrg ?? { '@id': ORG_ID, url: ORG_ID })
    )
  };

  notifications.length = 0;
  const engine = {
    getManager: vi.fn((name: string) => {
      if (name === 'NotificationManager') return { notifyAdmins: async (n: Record<string, unknown>) => { notifications.push(n); return 'n1'; } };
      if (name === 'ConfigurationManager') return makeConfigManager();
      if (name === 'IdentityManager') return identityManager;
      if (name === 'OrganizationManager') return organizationManager;
      return null;
    }),
    getConfig: vi.fn(() => ({ get: vi.fn() }))
  };
  return roleManagerOver(engine, roleManager);
}

function logged(level: 'warn' | 'error'): string {
  return (logger[level] as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map((c) => String(c[0]))
    .join('\n');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('role assignment with no anchor Organization (#1027, #2015)', () => {
  test('is refused with an error naming user, role and cause — never a warning', async () => {
    const manager = makeEngine({ installOrg: null });
    const failure = await manager.applyRoleDiff('admin', [], ['admin']).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(RoleChangeError);
    const message = (failure as Error).message;
    expect(message).toContain('admin');
    expect(message).toMatch(/anchor Organization/i);
    // Names the key to set — an error that does not say what to do is nearly as useless as none.
    expect(message).toContain('ngdpbase.application.organization.file');
    expect(logged('error')).toMatch(/anchor Organization/i);
    expect(logged('warn')).not.toMatch(/anchor Organization/i);
  });

  test('a revocation is refused too — the more dangerous direction', async () => {
    const manager = makeEngine({ installOrg: null });
    const failure = await manager.applyRoleDiff('bob', ['editor'], []).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(RoleChangeError);
    expect((failure as Error).message).toContain('bob');
    expect((failure as Error).message).toContain('remove editor');
    expect(logged('error')).toContain('bob');
  });

  test('is refused when there is no account by that username (#2037: an account missing its identity record gets one)', async () => {
    const manager = makeEngine({ person: null });
    await expect(manager.applyRoleDiff('ghost', [], ['admin'])).rejects.toThrow(/no account by that username/i);
    expect(logged('error')).toMatch(/no account by that username/i);
  });

  test('admins get an error notification', async () => {
    const manager = makeEngine({ installOrg: null });
    await manager.applyRoleDiff('admin', [], ['admin']).catch(() => undefined);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ level: 'error' });
    expect(String(notifications[0].message)).toContain('admin');
  });
});

describe('role assignment with a healthy anchor Organization', () => {
  test('nothing is logged as an error — diagnostics must not fire on the happy path', async () => {
    // Otherwise the error becomes noise and stops being read, which is how
    // this class of failure hides in the first place.
    const manager = makeEngine();
    await manager.applyRoleDiff('alice', [], ['admin']);

    expect(logged('error')).toBe('');
    expect(notifications).toHaveLength(0);
  });
});
