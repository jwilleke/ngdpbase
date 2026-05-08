'use strict';

/**
 * Tests for UserManager.getContactRecipient() — #658 iteration 2
 *
 * Recipient resolution rule:
 *   1. Trimmed `recipientOverride` if non-empty → use verbatim
 *   2. Else: first user with `admin` role whose email is non-empty AND not
 *      the install-default sentinel `admin@localhost`
 *   3. Else: null (caller renders "not configured")
 */

const makeUser = (overrides: Record<string, unknown> = {}) => ({
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

describe('UserManager#getContactRecipient()', () => {
  let UserManager: any;
  let manager: any;

  const personIdFor = (username: string) => `urn:uuid:test:${username}`;

  const makeEngine = (allUsers: any[]) => {
    const personManager = {
      getByIdentifier: vi.fn(async (username: string) => {
        const u = allUsers.find((x) => x.username === username);
        return u ? { '@id': personIdFor(username), identifier: username } : null;
      })
    };
    const roleManager = {
      listByMember: vi.fn(async (personId: string) => {
        const username = personId.replace('urn:uuid:test:', '');
        const u = allUsers.find((x) => x.username === username);
        if (!u || !Array.isArray(u.roles)) return [];
        return u.roles.map((r: string) => ({ '@id': `r-${r}`, namedPosition: r, organization: { '@id': 'o' } }));
      })
    };
    return {
      getManager: vi.fn((name: string) => {
        if (name === 'PersonManager') return personManager;
        if (name === 'RoleManager') return roleManager;
        return null;
      }),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    };
  };

  const setup = async (users: any[]) => {
    vi.resetModules();
    const mod = await import('../UserManager');
    UserManager = (mod).default ?? mod;
    const mockProvider = {
      getAllUsers: vi.fn().mockResolvedValue(new Map(users.map(u => [u.username, u]))),
      getUser: vi.fn(async (username: string) => users.find(u => u.username === username) ?? null),
      saveUser: vi.fn(),
      deleteUser: vi.fn()
    };
    manager = new UserManager(makeEngine(users));
    manager.provider = mockProvider;
  };

  test('returns the override verbatim when non-empty', async () => {
    await setup([
      makeUser({ username: 'admin', email: 'admin@example.com', roles: ['admin'] })
    ]);
    const result = await manager.getContactRecipient('contact@example.com');
    expect(result).toBe('contact@example.com');
  });

  test('trims whitespace from the override', async () => {
    await setup([]);
    const result = await manager.getContactRecipient('  contact@example.com  ');
    expect(result).toBe('contact@example.com');
  });

  test('treats whitespace-only override as empty (falls through to admin lookup)', async () => {
    await setup([
      makeUser({ username: 'admin', email: 'admin@example.com', roles: ['admin'] })
    ]);
    const result = await manager.getContactRecipient('   ');
    expect(result).toBe('admin@example.com');
  });

  test('treats empty-string override as empty (falls through to admin lookup)', async () => {
    await setup([
      makeUser({ username: 'admin', email: 'admin@example.com', roles: ['admin'] })
    ]);
    const result = await manager.getContactRecipient('');
    expect(result).toBe('admin@example.com');
  });

  test('returns first admin user email when override empty and admin email is real', async () => {
    await setup([
      makeUser({ username: 'reader', email: 'reader@example.com', roles: ['reader'] }),
      makeUser({ username: 'admin1', email: 'admin1@example.com', roles: ['admin'] }),
      makeUser({ username: 'admin2', email: 'admin2@example.com', roles: ['admin'] })
    ]);
    const result = await manager.getContactRecipient('');
    expect(result).toBe('admin1@example.com');
  });

  test('skips admin users whose email is the install-default sentinel admin@localhost', async () => {
    await setup([
      makeUser({ username: 'admin', email: 'admin@localhost', roles: ['admin'] })
    ]);
    const result = await manager.getContactRecipient('');
    expect(result).toBeNull();
  });

  test('skips admin users whose email is missing', async () => {
    await setup([
      makeUser({ username: 'admin1', email: '', roles: ['admin'] }),
      makeUser({ username: 'admin2', email: 'real@example.com', roles: ['admin'] })
    ]);
    const result = await manager.getContactRecipient('');
    expect(result).toBe('real@example.com');
  });

  test('returns null when no users exist', async () => {
    await setup([]);
    const result = await manager.getContactRecipient('');
    expect(result).toBeNull();
  });

  test('returns null when no users have the admin role', async () => {
    await setup([
      makeUser({ username: 'reader', email: 'reader@example.com', roles: ['reader'] }),
      makeUser({ username: 'editor', email: 'editor@example.com', roles: ['editor'] })
    ]);
    const result = await manager.getContactRecipient('');
    expect(result).toBeNull();
  });

  test('returns null when only admin user has the sentinel email', async () => {
    await setup([
      makeUser({ username: 'admin', email: 'admin@localhost', roles: ['admin'] }),
      makeUser({ username: 'editor', email: 'editor@example.com', roles: ['editor'] })
    ]);
    const result = await manager.getContactRecipient('');
    expect(result).toBeNull();
  });

  test('override wins even when admin email is the sentinel', async () => {
    await setup([
      makeUser({ username: 'admin', email: 'admin@localhost', roles: ['admin'] })
    ]);
    const result = await manager.getContactRecipient('contact@example.com');
    expect(result).toBe('contact@example.com');
  });
});
