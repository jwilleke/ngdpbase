import os from 'os';
import path from 'path';
import fs from 'fs-extra';

describe('PersonManager (#617)', () => {
  let tmpDir: string;
  let PersonManager: any;

  const makeConfigManager = (overrides: Record<string, unknown> = {}) => ({
    getProperty: vi.fn((key: string, defaultValue: unknown) => {
      const map = overrides;
      if (key in map) return map[key];
      return defaultValue;
    }),
    getResolvedDataPath: vi.fn((_key: string, _defaultValue: string) =>
      (overrides['ngdpbase.application.persons.storagedir'] as string)
        ?? path.join(tmpDir, 'persons')
    )
  });

  const makeUserManager = (users: Record<string, { username: string; email?: string; displayName?: string }>) => ({
    getUser: vi.fn(async (username: string) => users[username])
  });

  // #1930: the door takes a context and asks the PDP; these tests are about storage, so it permits.
  const CTX = { username: 'admin', roles: ['admin'], isAuthenticated: true };
  const PERMIT_ALL = { decide: vi.fn(async () => ({ permit: true, applicable: true, reason: 'test' })) };

  const makeEngine = (
    configManager: ReturnType<typeof makeConfigManager>,
    userManager: ReturnType<typeof makeUserManager> | null = null
  ) => ({
    getManager: vi.fn((name: string) => {
      if (name === 'ConfigurationManager') return configManager;
      if (name === 'UserManager') return userManager;
      if (name === 'PolicyDecisionPoint') return PERMIT_ALL;
      return null;
    })
  });

  beforeAll(() => {
    vi.setConfig({ testTimeout: 10000 });
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'person-mgr-test-'));
    vi.resetModules();
    vi.clearAllMocks();
    const mod = await import('../PersonManager');
    PersonManager = mod.default ?? mod;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  test('CRUD — create, getById, update, delete', async () => {
    const configManager = makeConfigManager();
    const engine = makeEngine(configManager);

    const manager = new PersonManager(engine);
    await manager.initialize();

    const created = await manager.create(CTX, { name: 'Jane Doe', email: 'jane@example.com' });
    const id = created['@id'];
    expect(id).toMatch(/^urn:uuid:/);

    const fetched = await manager.getById(id);
    expect(fetched?.email).toBe('jane@example.com');

    const updated = await manager.update(CTX, id, { name: 'Jane Renamed', identifier: 'someone' });
    expect(updated?.name).toBe('Jane Renamed');
    expect(updated?.identifier).toBe(created.identifier); // identifier stays immutable

    const removed = await manager.delete(CTX, id);
    expect(removed).toBe(true);
    expect(await manager.getById(id)).toBeNull();
  });

  test('getByUserIdentifier lazy-migrates from a User on first call', async () => {
    const configManager = makeConfigManager();
    const userManager = makeUserManager({
      alice: { username: 'alice', email: 'alice@example.com', displayName: 'Alice' }
    });
    const engine = makeEngine(configManager, userManager);

    const manager = new PersonManager(engine);
    await manager.initialize();

    // No Person initially
    expect(await manager.getByIdentifier('alice')).toBeNull();

    const promoted = await manager.getByUserIdentifier('alice');
    expect(promoted).not.toBeNull();
    expect(promoted!.identifier).toBe('alice');
    expect(promoted!.email).toBe('alice@example.com');
    expect(promoted!.name).toBe('Alice');
    expect(promoted!['@id']).toMatch(/^urn:uuid:/);

    // Second call returns the persisted record without re-creating
    const second = await manager.getByUserIdentifier('alice');
    expect(second!['@id']).toBe(promoted!['@id']);
    expect(userManager.getUser).toHaveBeenCalledTimes(1);
  });

  test('getByUserIdentifier returns null when neither Person nor User exists', async () => {
    const configManager = makeConfigManager();
    const userManager = makeUserManager({});
    const engine = makeEngine(configManager, userManager);

    const manager = new PersonManager(engine);
    await manager.initialize();

    const result = await manager.getByUserIdentifier('nobody');
    expect(result).toBeNull();
  });
});
