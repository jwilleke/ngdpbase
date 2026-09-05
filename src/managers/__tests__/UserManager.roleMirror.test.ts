/**
 * UserManager → RoleManager mirror tests (#617 follow-up, iteration 2).
 *
 * Verifies that User.roles[] writes mirror into the OrganizationRole records
 * managed by RoleManager. PersonManager + OrganizationManager + RoleManager
 * are mocked at the engine.getManager seam; the public UserManager methods
 * (createUser, updateUser, deleteUser, assignRole, removeRole) are exercised
 * end-to-end. The provider is stubbed per-test so we don't depend on
 * filesystem state.
 */
import UserManager from '../UserManager';
import type { WikiEngine } from '../../types/WikiEngine';
import type { Role as OrganizationRoleRecord } from '../../types/Role';
/** #1179: the account writes take the actor's context — a request subject here. */
const ACTOR = { username: 'root', roles: ['admin'], isAuthenticated: true, ipAddress: '203.0.113.7' };


const PERSON_ID = 'urn:uuid:11111111-1111-1111-1111-111111111111';
const ORG_ID = 'https://example.com/';
const ORG_URL = 'https://example.com/';

interface MockRole {
  '@id': string;
  namedPosition: string;
  organization: { '@id': string };
  member?: { '@id': string }[];
  [key: string]: unknown;
}

const makeRoleCatalog = () => ({
  admin: {
    name: 'admin',
    displayname: 'Administrator',
    description: 'Full system access',
    issystem: true,
    icon: 'shield-alt',
    color: '#dc3545',
    permissions: ['page-read', 'page-edit']
  },
  editor: {
    name: 'editor',
    displayname: 'Editor',
    permissions: ['page-edit']
  },
  reader: {
    name: 'reader'
  }
});

const makeConfigManager = () => ({
  getProperty: vi.fn((key: string, defaultValue: unknown) => {
    const config: Record<string, unknown> = {
      'ngdpbase.user.provider.default': 'fileuserprovider',
      'ngdpbase.user.provider': 'fileuserprovider',
      'ngdpbase.user.defaultPassword': 'admin',
      'ngdpbase.user.passwordSalt': 'test-salt',
      'ngdpbase.user.sessionExpiration': 3600000,
      'ngdpbase.user.defaultTimezone': 'UTC',
      'ngdpbase.directories.users': './users',
      'ngdpbase.roles.definitions': makeRoleCatalog(),
      // #631: createUser checks the reserved system-principal name; a booted
      // instance always has this key (app.ts refuses to start without it).
      'ngdpbase.system.principal': 'svc-ngdpbase',
      'ngdpbase.system.roles': ['admin']
    };
    return key in config ? config[key] : defaultValue;
  })
});

/**
 * In-memory stub for RoleManager. Tracks calls and exposes role state via
 * a Map keyed by namedPosition. Only the surface UserManager touches is
 * implemented.
 */
function makeRoleManagerStub(seed: MockRole[] = []) {
  const store = new Map<string, MockRole>();
  for (const r of seed) store.set(r.namedPosition, { ...r, member: [...(r.member ?? [])] });

  const stub = {
    create: vi.fn(async (role: MockRole) => {
      if (store.has(role.namedPosition)) {
        throw new Error(`already exists: ${role.namedPosition}`);
      }
      store.set(role.namedPosition, { ...role, member: [...(role.member ?? [])] });
      return role;
    }),
    update: vi.fn(async (id: string, patch: Partial<MockRole>) => {
      for (const role of store.values()) {
        if (role['@id'] === id) {
          Object.assign(role, patch);
          return role;
        }
      }
      return null;
    }),
    getByOrgAndPosition: vi.fn(async (orgId: string, namedPosition: string) => {
      const r = store.get(namedPosition);
      return r && r.organization['@id'] === orgId ? r : null;
    }),
    listByMember: vi.fn(async (personId: string) => {
      return Array.from(store.values()).filter((r) =>
        (r.member ?? []).some((m) => m['@id'] === personId)
      );
    }),
    _store: store
  };
  return stub;
}

function makeMocks(opts: {
  person?: { '@id': string; identifier: string } | null;
  installOrg?: { '@id': string; url?: string } | null;
  roleManager?: ReturnType<typeof makeRoleManagerStub>;
} = {}) {
  const personManager = {
    getByIdentifier: vi.fn(async () => opts.person ?? null),
    create: vi.fn(async (p: unknown) => p),
    update: vi.fn(async () => null),
    delete: vi.fn(async () => true)
  };
  const organizationManager = {
    getInstallOrg: vi.fn(async () =>
      opts.installOrg === null ? null : (opts.installOrg ?? { '@id': ORG_ID, url: ORG_URL })
    )
  };
  const roleManager = opts.roleManager ?? makeRoleManagerStub();
  return { personManager, organizationManager, roleManager };
}

function makeEngine(mocks: ReturnType<typeof makeMocks>, configManager: ReturnType<typeof makeConfigManager>) {
  return {
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'PersonManager') return mocks.personManager;
      if (name === 'OrganizationManager') return mocks.organizationManager;
      if (name === 'RoleManager') return mocks.roleManager;
      return null;
    }),
    getConfig: vi.fn(() => ({ get: vi.fn() }))
  };
}

async function newUserManager(mocks: ReturnType<typeof makeMocks>) {
  const configManager = makeConfigManager();
  const engine = makeEngine(mocks, configManager);
  const manager = new UserManager(engine);
  await manager.initialize();
  return manager;
}

describe('UserManager → RoleManager mirror (#617 iteration 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createUser', () => {
    test('creates an OrganizationRole record and adds the Person to member[]', async () => {
      const mocks = makeMocks({ person: { '@id': PERSON_ID, identifier: 'alice' } });
      const userManager = await newUserManager(mocks);

      userManager.provider.userExists = vi.fn().mockResolvedValue(false);
      userManager.provider.getAllUsernames = vi.fn().mockResolvedValue([]);
      userManager.provider.createUser = vi.fn().mockResolvedValue(undefined);
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);
      // Stub createUserPage path to avoid PageManager dependency
      userManager.createUserPage = vi.fn().mockResolvedValue(false);

      await userManager.createUser({
        username: 'alice',
        email: 'alice@example.com',
        password: 'pw',
        roles: ['admin']
      }, ACTOR);

      expect(mocks.roleManager.create).toHaveBeenCalledTimes(1);
      const created = mocks.roleManager.create.mock.calls[0][0];
      expect(created.namedPosition).toBe('admin');
      expect(created['@id']).toBe('https://example.com/roles/admin#role');
      expect(created.organization).toEqual({ '@id': ORG_ID });
      expect(created.roleName).toBe('Administrator');
      expect(created.icon).toBe('shield-alt');
      expect(created.additionalProperty).toEqual([
        { '@type': 'PropertyValue', name: 'permissions', value: ['page-read', 'page-edit'] }
      ]);
      // After create, the Person is appended via update(...).
      expect(mocks.roleManager.update).toHaveBeenCalledTimes(1);
      const [, patch] = mocks.roleManager.update.mock.calls[0];
      expect(patch.member).toEqual([{ '@id': PERSON_ID }]);
    });

    test('skips mirror silently when the install has no anchor org', async () => {
      const mocks = makeMocks({
        person: { '@id': PERSON_ID, identifier: 'alice' },
        installOrg: null
      });
      const userManager = await newUserManager(mocks);

      userManager.provider.userExists = vi.fn().mockResolvedValue(false);
      userManager.provider.getAllUsernames = vi.fn().mockResolvedValue([]);
      userManager.provider.createUser = vi.fn().mockResolvedValue(undefined);
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);
      userManager.createUserPage = vi.fn().mockResolvedValue(false);

      await userManager.createUser({
        username: 'alice',
        email: 'a@x',
        password: 'pw',
        roles: ['admin']
      }, ACTOR);

      expect(mocks.roleManager.create).not.toHaveBeenCalled();
      expect(mocks.roleManager.update).not.toHaveBeenCalled();
    });

    test('skips mirror silently when the user has no paired Person record', async () => {
      const mocks = makeMocks({ person: null });
      const userManager = await newUserManager(mocks);

      userManager.provider.userExists = vi.fn().mockResolvedValue(false);
      userManager.provider.getAllUsernames = vi.fn().mockResolvedValue([]);
      userManager.provider.createUser = vi.fn().mockResolvedValue(undefined);
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);
      userManager.createUserPage = vi.fn().mockResolvedValue(false);

      await userManager.createUser({
        username: 'alice',
        email: 'a@x',
        password: 'pw',
        roles: ['admin']
      }, ACTOR);

      expect(mocks.roleManager.create).not.toHaveBeenCalled();
      expect(mocks.roleManager.update).not.toHaveBeenCalled();
    });

    test('mirror failures do not break createUser', async () => {
      const roleManager = makeRoleManagerStub();
      roleManager.create.mockRejectedValue(new Error('disk full'));
      const mocks = makeMocks({ person: { '@id': PERSON_ID, identifier: 'alice' }, roleManager });
      const userManager = await newUserManager(mocks);

      userManager.provider.userExists = vi.fn().mockResolvedValue(false);
      userManager.provider.getAllUsernames = vi.fn().mockResolvedValue([]);
      userManager.provider.createUser = vi.fn().mockResolvedValue(undefined);
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);
      userManager.createUserPage = vi.fn().mockResolvedValue(false);

      await expect(
        userManager.createUser({
          username: 'alice',
          email: 'a@x',
          password: 'pw',
          roles: ['admin']
        }, ACTOR)
      ).resolves.toMatchObject({ username: 'alice' });
    });
  });

  describe('assignRole', () => {
    test('appends the Person to existing role.member[]', async () => {
      const seed: MockRole = {
        '@id': 'https://example.com/roles/editor#role',
        namedPosition: 'editor',
        organization: { '@id': ORG_ID },
        member: [{ '@id': 'urn:uuid:other-person' }]
      };
      const roleManager = makeRoleManagerStub([seed]);
      const mocks = makeMocks({ person: { '@id': PERSON_ID, identifier: 'alice' }, roleManager });
      const userManager = await newUserManager(mocks);

      userManager.provider.getUser = vi.fn().mockResolvedValue({
        username: 'alice',
        roles: ['reader']
      });
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);

      await userManager.assignRole('alice', 'editor', ACTOR);

      expect(roleManager.update).toHaveBeenCalledTimes(1);
      const [, patch] = roleManager.update.mock.calls[0];
      expect(patch.member).toEqual([{ '@id': 'urn:uuid:other-person' }, { '@id': PERSON_ID }]);
    });

    test('is a no-op when the Person is already a member', async () => {
      const seed: MockRole = {
        '@id': 'https://example.com/roles/editor#role',
        namedPosition: 'editor',
        organization: { '@id': ORG_ID },
        member: [{ '@id': PERSON_ID }]
      };
      const roleManager = makeRoleManagerStub([seed]);
      const mocks = makeMocks({ person: { '@id': PERSON_ID, identifier: 'alice' }, roleManager });
      const userManager = await newUserManager(mocks);

      userManager.provider.getUser = vi.fn().mockResolvedValue({
        username: 'alice',
        roles: ['reader']
      });
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);

      await userManager.assignRole('alice', 'editor', ACTOR);

      expect(roleManager.update).not.toHaveBeenCalled();
    });
  });

  describe('removeRole', () => {
    test('removes the Person from the role.member[]', async () => {
      const seed: MockRole = {
        '@id': 'https://example.com/roles/editor#role',
        namedPosition: 'editor',
        organization: { '@id': ORG_ID },
        member: [{ '@id': PERSON_ID }, { '@id': 'urn:uuid:other-person' }]
      };
      const roleManager = makeRoleManagerStub([seed]);
      const mocks = makeMocks({ person: { '@id': PERSON_ID, identifier: 'alice' }, roleManager });
      const userManager = await newUserManager(mocks);

      userManager.provider.getUser = vi.fn().mockResolvedValue({
        username: 'alice',
        roles: ['editor', 'reader']
      });
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);

      await userManager.removeRole('alice', 'editor', ACTOR);

      expect(roleManager.update).toHaveBeenCalledTimes(1);
      const [, patch] = roleManager.update.mock.calls[0];
      expect(patch.member).toEqual([{ '@id': 'urn:uuid:other-person' }]);
    });

    test('is a no-op when the Person is not a member', async () => {
      const seed: MockRole = {
        '@id': 'https://example.com/roles/editor#role',
        namedPosition: 'editor',
        organization: { '@id': ORG_ID },
        member: [{ '@id': 'urn:uuid:other-person' }]
      };
      const roleManager = makeRoleManagerStub([seed]);
      const mocks = makeMocks({ person: { '@id': PERSON_ID, identifier: 'alice' }, roleManager });
      const userManager = await newUserManager(mocks);

      userManager.provider.getUser = vi.fn().mockResolvedValue({
        username: 'alice',
        roles: ['editor']
      });
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);

      await userManager.removeRole('alice', 'editor', ACTOR);

      expect(roleManager.update).not.toHaveBeenCalled();
    });
  });

  describe('updateUser', () => {
    test('mirrors the role diff: added roles upsert, removed roles drop', async () => {
      const seed: MockRole = {
        '@id': 'https://example.com/roles/reader#role',
        namedPosition: 'reader',
        organization: { '@id': ORG_ID },
        member: [{ '@id': PERSON_ID }]
      };
      const roleManager = makeRoleManagerStub([seed]);
      const mocks = makeMocks({ person: { '@id': PERSON_ID, identifier: 'alice' }, roleManager });
      const userManager = await newUserManager(mocks);

      userManager.provider.getUser = vi.fn().mockResolvedValue({
        username: 'alice',
        roles: ['reader']
      });
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);

      await userManager.updateUser('alice', { roles: ['editor'] }, ACTOR);

      // editor should be created (not in seed) and Person appended
      expect(roleManager.create).toHaveBeenCalledTimes(1);
      expect(roleManager.create.mock.calls[0][0].namedPosition).toBe('editor');
      // reader's member[] should drop the Person, editor's should pick it up
      const readerAfter = roleManager._store.get('reader');
      const editorAfter = roleManager._store.get('editor');
      expect(readerAfter?.member).toEqual([]);
      expect(editorAfter?.member).toEqual([{ '@id': PERSON_ID }]);
    });

    test('does not mirror when the update has no roles field', async () => {
      const roleManager = makeRoleManagerStub();
      const mocks = makeMocks({ person: { '@id': PERSON_ID, identifier: 'alice' }, roleManager });
      const userManager = await newUserManager(mocks);

      userManager.provider.getUser = vi.fn().mockResolvedValue({
        username: 'alice',
        roles: ['reader']
      });
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);

      await userManager.updateUser('alice', { displayName: 'Alice Smith' }, ACTOR);

      expect(roleManager.create).not.toHaveBeenCalled();
      expect(roleManager.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    test('removes the Person from every role.member[] before deleting the Person', async () => {
      const seedA: MockRole = {
        '@id': 'https://example.com/roles/admin#role',
        namedPosition: 'admin',
        organization: { '@id': ORG_ID },
        member: [{ '@id': PERSON_ID }]
      };
      const seedE: MockRole = {
        '@id': 'https://example.com/roles/editor#role',
        namedPosition: 'editor',
        organization: { '@id': ORG_ID },
        member: [{ '@id': PERSON_ID }, { '@id': 'urn:uuid:other-person' }]
      };
      const roleManager = makeRoleManagerStub([seedA, seedE]);
      const mocks = makeMocks({ person: { '@id': PERSON_ID, identifier: 'alice' }, roleManager });
      const userManager = await newUserManager(mocks);

      userManager.provider.getUser = vi.fn().mockResolvedValue({
        username: 'alice',
        isSystem: false
      });
      userManager.provider.deleteUser = vi.fn().mockResolvedValue(undefined);

      await userManager.deleteUser('alice', ACTOR);

      expect(roleManager._store.get('admin')?.member).toEqual([]);
      expect(roleManager._store.get('editor')?.member).toEqual([{ '@id': 'urn:uuid:other-person' }]);
      // Person is deleted after role memberships are scrubbed
      expect(mocks.personManager.delete).toHaveBeenCalledWith(PERSON_ID);
    });
  });

  describe('catalog snapshot', () => {
    test('roles missing from the catalog still produce a minimal Role record', async () => {
      const mocks = makeMocks({ person: { '@id': PERSON_ID, identifier: 'alice' } });
      const userManager = await newUserManager(mocks);

      userManager.provider.userExists = vi.fn().mockResolvedValue(false);
      userManager.provider.getAllUsernames = vi.fn().mockResolvedValue([]);
      userManager.provider.createUser = vi.fn().mockResolvedValue(undefined);
      userManager.provider.updateUser = vi.fn().mockResolvedValue(undefined);
      userManager.createUserPage = vi.fn().mockResolvedValue(false);

      await userManager.createUser({
        username: 'alice',
        email: 'a@x',
        password: 'pw',
        roles: ['custom-role-not-in-catalog']
      }, ACTOR);

      expect(mocks.roleManager.create).toHaveBeenCalledTimes(1);
      const created: OrganizationRoleRecord = mocks.roleManager.create.mock.calls[0][0];
      expect(created.namedPosition).toBe('custom-role-not-in-catalog');
      expect(created['@id']).toBe('https://example.com/roles/custom-role-not-in-catalog#role');
      // No catalog entry → no snapshot fields
      expect(created.roleName).toBeUndefined();
      expect(created.additionalProperty).toBeUndefined();
    });
  });
});
