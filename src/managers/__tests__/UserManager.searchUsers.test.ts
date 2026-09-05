'use strict';

/**
 * Tests for UserManager.searchUsers(, ACTOR) — issue #466
 */

/** #1179: search-user is a disclosive lookup; it records who asked. */
const ACTOR = { username: 'root', roles: ['admin'], isAuthenticated: true };

const makeUser = (overrides = {}) => ({
  username: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  roles: ['reader'],
  isActive: true,
  password: 'hashed:test-fixture',
  isSystem: false,
  isExternal: false,
  createdAt: new Date().toISOString(),
  loginCount: 0,
  preferences: {},
  ...overrides
});

describe('UserManager#searchUsers()', () => {
  let UserManager;
  let manager;
  let mockProvider;

  const users = [
    makeUser({ username: 'alice',   displayName: 'Alice Smith',   email: 'alice@example.com',   roles: ['admin'],       isActive: true  }),
    makeUser({ username: 'bob',     displayName: 'Bob Jones',     email: 'bob@example.com',     roles: ['editor'],      isActive: true  }),
    makeUser({ username: 'carol',   displayName: 'Carol White',   email: 'carol@corp.com',      roles: ['reader'],      isActive: true  }),
    makeUser({ username: 'dave',    displayName: 'Dave Brown',    email: 'dave@corp.com',       roles: ['user-admin'],  isActive: false }),
    makeUser({ username: 'erin',    displayName: 'Erin Alice',    email: 'erin@example.com',    roles: ['reader'],      isActive: true  })
  ];

  // #617 iteration 3b: searchUsers' role filter resolves via RoleManager.
  // The mocks below translate the legacy `roles: [...]` test fixture data
  // into RoleManager.listByMember responses, keyed by Person @id of the
  // form `urn:uuid:test:<username>`.
  const personIdFor = (username) => `urn:uuid:test:${username}`;

  const makeEngine = (allUsers) => {
    const personManager = {
      getByIdentifier: vi.fn(async (username) => {
        const u = allUsers.find((x) => x.username === username);
        return u ? { '@id': personIdFor(username), identifier: username } : null;
      })
    };
    const roleManager = {
      listByMember: vi.fn(async (personId) => {
        const username = personId.replace('urn:uuid:test:', '');
        const u = allUsers.find((x) => x.username === username);
        if (!u || !Array.isArray(u.roles)) return [];
        return u.roles.map((r) => ({ '@id': `r-${r}`, namedPosition: r, organization: { '@id': 'o' } }));
      })
    };
    return {
      getManager: vi.fn((name) => {
        if (name === 'PersonManager') return personManager;
        if (name === 'RoleManager') return roleManager;
        return null;
      }),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    };
  };

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../UserManager');
    UserManager = mod.default ?? mod;

    mockProvider = {
      getAllUsers: vi.fn().mockResolvedValue(new Map(users.map(u => [u.username, u]))),
      getUser: vi.fn(async (username) => users.find(u => u.username === username) ?? null),
      saveUser: vi.fn(),
      deleteUser: vi.fn()
    };

    manager = new UserManager(makeEngine(users));
    manager.provider = mockProvider;
  });

  test('returns all active users when query is empty', async () => {
    const results = await manager.searchUsers('', {}, ACTOR);
    expect(results.length).toBe(4); // dave is inactive
    expect(results.find(u => u.username === 'dave')).toBeUndefined();
  });

  test('matches username (case-insensitive)', async () => {
    const results = await manager.searchUsers('ALICE', {}, ACTOR);
    const usernames = results.map(u => u.username);
    expect(usernames).toContain('alice');
    expect(usernames).toContain('erin'); // displayName: 'Erin Alice'
  });

  test('matches displayName (case-insensitive)', async () => {
    const results = await manager.searchUsers('jones', {}, ACTOR);
    expect(results.map(u => u.username)).toContain('bob');
  });

  test('matches email (case-insensitive)', async () => {
    const results = await manager.searchUsers('corp.com', {}, ACTOR);
    const usernames = results.map(u => u.username);
    expect(usernames).toContain('carol');
    expect(usernames).not.toContain('alice');
  });

  test('filters by role', async () => {
    const results = await manager.searchUsers('', { role: 'editor' }, ACTOR);
    expect(results.length).toBe(1);
    expect(results[0].username).toBe('bob');
  });

  test('respects limit', async () => {
    const results = await manager.searchUsers('', { limit: 2 }, ACTOR);
    expect(results.length).toBe(2);
  });

  test('includes inactive users when activeOnly is false', async () => {
    const results = await manager.searchUsers('', { activeOnly: false }, ACTOR);
    const usernames = results.map(u => u.username);
    expect(usernames).toContain('dave');
  });

  test('never returns password field', async () => {
    const results = await manager.searchUsers('', {}, ACTOR);
    results.forEach(u => expect(u).not.toHaveProperty('password'));
  });

  test('returns empty array when no users match', async () => {
    const results = await manager.searchUsers('zzznomatch', {}, ACTOR);
    expect(results).toEqual([]);
  });

  test('returns empty array when role filter matches nothing', async () => {
    const results = await manager.searchUsers('', { role: 'nonexistent-role' }, ACTOR);
    expect(results).toEqual([]);
  });

  test('combined query + role filter', async () => {
    const results = await manager.searchUsers('example.com', { role: 'admin' }, ACTOR);
    expect(results.map(u => u.username)).toContain('alice');
    expect(results.map(u => u.username)).not.toContain('bob');
  });
});
