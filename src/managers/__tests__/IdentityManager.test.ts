import os from 'os';
import path from 'path';
import fs from 'fs-extra';

describe('IdentityManager (#617)', () => {
  let tmpDir: string;
  let IdentityManager: any;

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
    const mod = await import('../IdentityManager');
    IdentityManager = mod.default ?? mod;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
  });

  test('CRUD — create, getById, update, delete', async () => {
    const configManager = makeConfigManager();
    const engine = makeEngine(configManager);

    const manager = new IdentityManager(engine);
    await manager.initialize();

    const created = await manager.create(CTX, { name: 'Jane Doe', email: 'jane@example.com' });
    const id = created['@id'];
    expect(id).toMatch(/^urn:uuid:/);

    const fetched = await manager.getById(CTX, id);
    expect(fetched?.email).toBe('jane@example.com');

    const updated = await manager.update(CTX, id, { name: 'Jane Renamed', identifier: 'someone' });
    expect(updated?.name).toBe('Jane Renamed');
    expect(updated?.identifier).toBe(created.identifier); // identifier stays immutable

    const removed = await manager.delete(CTX, id);
    expect(removed).toBe(true);
    expect(await manager.getById(CTX, id)).toBeNull();
  });

  test('getByUserIdentifier lazy-migrates from a User on first call', async () => {
    const configManager = makeConfigManager();
    const userManager = makeUserManager({
      alice: { username: 'alice', email: 'alice@example.com', displayName: 'Alice' }
    });
    const engine = makeEngine(configManager, userManager);

    const manager = new IdentityManager(engine);
    await manager.initialize();

    // No Person initially
    expect(await manager.getByIdentifier(CTX, 'alice')).toBeNull();

    const promoted = await manager.getByUserIdentifier(CTX, 'alice');
    const userLookups = userManager.getUser.mock.calls.length;
    expect(promoted).not.toBeNull();
    expect(promoted!.identifier).toBe('alice');
    expect(promoted!.email).toBe('alice@example.com');
    expect(promoted!.name).toBe('Alice');
    expect(promoted!['@id']).toMatch(/^urn:uuid:/);

    // Second call returns the persisted record without re-creating
    const second = await manager.getByUserIdentifier(CTX, 'alice');
    expect(second!['@id']).toBe(promoted!['@id']);
    expect(userManager.getUser).toHaveBeenCalledTimes(userLookups);
  });

  // #2037: every user has exactly one identity record; one missing is made, recorded, never twice.
  describe('a user missing its identity record (#2037)', () => {
    const ALICE = { alice: { username: 'alice', email: 'alice@example.com', displayName: 'Alice' } };

    test('is made through the door under the system context, naming the caller, and recorded as identity-manage', async () => {
      const boot = await import('../../context/bootActions');
      boot.resetBootActions();
      const manager = new IdentityManager(makeEngine(makeConfigManager(), makeUserManager(ALICE)));
      await manager.initialize();

      const made = await manager.getByUserIdentifier(CTX, 'alice');

      expect(made?.identifier).toBe('alice');
      const recorded = boot.pendingBootActions().filter((a) => a.event.eventType === 'identity-manage');
      expect(recorded).toHaveLength(1);
      expect(recorded[0].event.action).toBe('person-create');
      expect(recorded[0].event.resource).toBe(made!['@id']);
      expect(recorded[0].context.origin).toBe('boot');
      expect(recorded[0].context.reason).toMatch(/account alice.*asked by admin/);
      boot.resetBootActions();
    });

    test('many lookups at once make one identity record', async () => {
      const manager = new IdentityManager(makeEngine(makeConfigManager(), makeUserManager(ALICE)));
      await manager.initialize();

      const all = await Promise.all(Array.from({ length: 8 }, () => manager.getByUserIdentifier(CTX, 'alice')));

      expect(new Set(all.map((p) => p!['@id'])).size).toBe(1);
      expect((await manager.list(CTX)).filter((p: { identifier: string }) => p.identifier === 'alice')).toHaveLength(1);
    });

    test('an existing identity record is returned, never a second one; a contact with the same email is left alone', async () => {
      const manager = new IdentityManager(makeEngine(makeConfigManager(), makeUserManager(ALICE)));
      await manager.initialize();
      const own = await manager.create(CTX, { identifier: 'alice', name: 'Alice' });
      const contact = await manager.create(CTX, { name: 'Alice too', email: 'alice@example.com' });

      expect((await manager.getByUserIdentifier(CTX, 'alice'))!['@id']).toBe(own['@id']);
      const records = await manager.list(CTX);
      expect(records).toHaveLength(2);
      expect(records.find((p: { '@id': string }) => p['@id'] === contact['@id'])?.identifier).toMatch(/^person:/);
    });
  });

  test('getByUserIdentifier returns null when neither Person nor User exists', async () => {
    const configManager = makeConfigManager();
    const userManager = makeUserManager({});
    const engine = makeEngine(configManager, userManager);

    const manager = new IdentityManager(engine);
    await manager.initialize();

    const result = await manager.getByUserIdentifier(CTX, 'nobody');
    expect(result).toBeNull();
  });
});
