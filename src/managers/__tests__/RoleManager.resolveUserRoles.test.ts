/**
 * RoleManager.resolveUserRoles tests (#617; moved from UserManager in #1431
 * step 12 — who holds which role is RoleManager's).
 *
 * Returns the role-name array sourced from OrganizationRole records, or `[]`
 * when PersonManager is unavailable, when the user has no paired Person
 * record, or when the lookup fails. There is no fallback to `User.roles[]`.
 */
import { roleManagerOver } from './__fixtures__/roleManagerOver';

const PERSON_ID = 'urn:uuid:11111111-1111-1111-1111-111111111111';

interface MockRole {
  '@id': string;
  namedPosition: string;
  organization: { '@id': string };
  member?: { '@id': string }[];
}

function makeRoleManager(opts: {
  person?: { '@id': string; identifier: string } | null;
  roles?: MockRole[];
  registerPersonManager?: boolean;
  listByMember?: ReturnType<typeof vi.fn>;
}) {
  const personManager = opts.registerPersonManager === false ? null : {
    getByIdentifier: vi.fn(async () => opts.person ?? null)
  };
  const listByMember = opts.listByMember ?? vi.fn(async () => opts.roles ?? []);
  const engine = {
    getManager: vi.fn((name: string) => (name === 'PersonManager' ? personManager : null))
  };
  return { roleManager: roleManagerOver(engine, { listByMember }), listByMember };
}

describe('RoleManager.resolveUserRoles (#617)', () => {
  test('returns role.namedPosition[] from the records that list the Person', async () => {
    const { roleManager, listByMember } = makeRoleManager({
      person: { '@id': PERSON_ID, identifier: 'alice' },
      roles: [
        { '@id': 'r1', namedPosition: 'admin', organization: { '@id': 'o' } },
        { '@id': 'r2', namedPosition: 'editor', organization: { '@id': 'o' } }
      ]
    });

    expect((await roleManager.resolveUserRoles('alice')).sort()).toEqual(['admin', 'editor']);
    expect(listByMember).toHaveBeenCalledWith(PERSON_ID);
  });

  test('returns [] when no record lists the Person', async () => {
    const { roleManager } = makeRoleManager({ person: { '@id': PERSON_ID, identifier: 'alice' }, roles: [] });
    expect(await roleManager.resolveUserRoles('alice')).toEqual([]);
  });

  test('returns [] when the user has no paired Person record', async () => {
    const { roleManager, listByMember } = makeRoleManager({
      person: null,
      roles: [{ '@id': 'r', namedPosition: 'admin', organization: { '@id': 'o' } }]
    });
    expect(await roleManager.resolveUserRoles('alice')).toEqual([]);
    expect(listByMember).not.toHaveBeenCalled();
  });

  test('returns [] when PersonManager is unavailable', async () => {
    const { roleManager } = makeRoleManager({
      registerPersonManager: false,
      roles: [{ '@id': 'r', namedPosition: 'admin', organization: { '@id': 'o' } }]
    });
    expect(await roleManager.resolveUserRoles('alice')).toEqual([]);
  });

  test('returns [] when the record lookup throws', async () => {
    const { roleManager } = makeRoleManager({
      person: { '@id': PERSON_ID, identifier: 'alice' },
      listByMember: vi.fn().mockRejectedValue(new Error('disk corrupt'))
    });
    expect(await roleManager.resolveUserRoles('alice')).toEqual([]);
  });

  test('does NOT inject pseudo-roles (Authenticated, All) — the caller does that', async () => {
    const { roleManager } = makeRoleManager({
      person: { '@id': PERSON_ID, identifier: 'alice' },
      roles: [{ '@id': 'r', namedPosition: 'admin', organization: { '@id': 'o' } }]
    });
    const result = await roleManager.resolveUserRoles('alice');
    expect(result).toEqual(['admin']);
    expect(result).not.toContain('Authenticated');
    expect(result).not.toContain('All');
  });

  test('hasRole answers from the same records', async () => {
    const { roleManager } = makeRoleManager({
      person: { '@id': PERSON_ID, identifier: 'alice' },
      roles: [{ '@id': 'r', namedPosition: 'editor', organization: { '@id': 'o' } }]
    });
    expect(await roleManager.hasRole('alice', 'editor')).toBe(true);
    expect(await roleManager.hasRole('alice', 'admin')).toBe(false);
  });
});
