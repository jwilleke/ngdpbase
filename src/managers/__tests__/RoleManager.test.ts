import os from 'os';
import path from 'path';
import fs from 'fs-extra';

describe('RoleManager (#617 follow-up)', () => {
  let tmpDir: string;
  let RoleManager: any;

  const ORG_ID = 'https://example.com/';
  const PERSON_A = 'urn:uuid:11111111-1111-1111-1111-111111111111';
  const PERSON_B = 'urn:uuid:22222222-2222-2222-2222-222222222222';

  const makeRole = (namedPosition: string, members: string[] = []) => ({
    '@context': 'https://schema.org' as const,
    '@type': 'OrganizationRole' as const,
    '@id': `${ORG_ID}roles/${namedPosition}#role`,
    namedPosition,
    organization: { '@id': ORG_ID },
    member: members.map((id) => ({ '@id': id }))
  });

  const makeConfigManager = (overrides: Record<string, unknown> = {}) => ({
    getProperty: vi.fn((key: string, defaultValue: unknown) => {
      if (key in overrides) return overrides[key];
      return defaultValue;
    }),
    getResolvedDataPath: vi.fn((_key: string, _defaultValue: string) =>
      (overrides['ngdpbase.application.roles.storagedir'] as string)
        ?? path.join(tmpDir, 'roles')
    )
  });

  const makeEngine = (configManager: ReturnType<typeof makeConfigManager>) => ({
    getManager: vi.fn((name: string) =>
      name === 'ConfigurationManager' ? configManager : null
    )
  });

  const newManager = async () => {
    const configManager = makeConfigManager({
      'ngdpbase.application.roles.storagedir': path.join(tmpDir, 'roles')
    });
    const engine = makeEngine(configManager);
    const manager = new RoleManager(engine);
    await manager.initialize();
    return manager;
  };

  beforeAll(() => {
    vi.setConfig({ testTimeout: 10000 });
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'role-mgr-test-'));
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.FAST_STORAGE;
    delete process.env.INSTANCE_DATA_FOLDER;
    process.env.INSTANCE_DATA_FOLDER = tmpDir;

    const mod = await import('../RoleManager');
    RoleManager = mod.default ?? mod;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
    delete process.env.INSTANCE_DATA_FOLDER;
  });

  test('initialize creates the storage directory and loads zero roles', async () => {
    const manager = await newManager();
    expect(await manager.list()).toEqual([]);
    expect(await fs.pathExists(path.join(tmpDir, 'roles'))).toBe(true);
  });

  test('create persists a role at <namedPosition>.json', async () => {
    const manager = await newManager();
    const role = makeRole('admin', [PERSON_A]);

    const created = await manager.create(role);
    expect(created.namedPosition).toBe('admin');

    const onDisk = await fs.readJson(path.join(tmpDir, 'roles', 'admin.json'));
    expect(onDisk['@id']).toBe(role['@id']);
    expect(onDisk.member).toEqual([{ '@id': PERSON_A }]);
  });

  test('create refuses to overwrite an existing namedPosition file', async () => {
    const manager = await newManager();
    await manager.create(makeRole('admin'));
    await expect(manager.create(makeRole('admin'))).rejects.toThrow(/already exists/);
  });

  test('create refuses a duplicate @id in the storage dir', async () => {
    const manager = await newManager();
    const role = makeRole('admin');
    await manager.create(role);

    // Different namedPosition (different filename) but same @id should fail
    const duplicate = { ...makeRole('editor'), '@id': role['@id'] };
    await expect(manager.create(duplicate)).rejects.toThrow(/already uses that @id/);
  });

  test('getById returns the matching role or null', async () => {
    const manager = await newManager();
    const role = makeRole('admin', [PERSON_A]);
    await manager.create(role);

    expect(await manager.getById(role['@id'])).toMatchObject({ namedPosition: 'admin' });
    expect(await manager.getById('urn:role:nope')).toBeNull();
  });

  test('getByOrgAndPosition is the (org, role) natural-key lookup', async () => {
    const manager = await newManager();
    const role = makeRole('admin', [PERSON_A]);
    await manager.create(role);

    expect(await manager.getByOrgAndPosition(ORG_ID, 'admin')).not.toBeNull();
    expect(await manager.getByOrgAndPosition(ORG_ID, 'editor')).toBeNull();
    expect(await manager.getByOrgAndPosition('https://other.example/', 'admin')).toBeNull();
  });

  test('listByMember returns every role whose member array contains the personId', async () => {
    const manager = await newManager();
    await manager.create(makeRole('admin', [PERSON_A]));
    await manager.create(makeRole('editor', [PERSON_A, PERSON_B]));
    await manager.create(makeRole('reader', [PERSON_B]));

    const aRoles = await manager.listByMember(PERSON_A);
    expect(aRoles.map((r: any) => r.namedPosition).sort()).toEqual(['admin', 'editor']);

    const bRoles = await manager.listByMember(PERSON_B);
    expect(bRoles.map((r: any) => r.namedPosition).sort()).toEqual(['editor', 'reader']);
  });

  test('update merges patch fields and preserves identity fields', async () => {
    const manager = await newManager();
    const role = makeRole('admin', [PERSON_A]);
    await manager.create(role);

    const updated = await manager.update(role['@id'], {
      member: [{ '@id': PERSON_A }, { '@id': PERSON_B }],
      description: 'Now with two members'
    });
    expect(updated).not.toBeNull();
    expect(updated!.member).toHaveLength(2);
    expect(updated!.description).toBe('Now with two members');
    // Identity preserved
    expect(updated!['@id']).toBe(role['@id']);
    expect(updated!.namedPosition).toBe('admin');
    expect(updated!.organization).toEqual({ '@id': ORG_ID });
  });

  test('update returns null when no record matches the @id', async () => {
    const manager = await newManager();
    const result = await manager.update('urn:role:nonexistent', { description: 'x' });
    expect(result).toBeNull();
  });

  test('delete removes the file and reports success', async () => {
    const manager = await newManager();
    const role = makeRole('admin');
    await manager.create(role);

    expect(await manager.delete(role['@id'])).toBe(true);
    expect(await fs.pathExists(path.join(tmpDir, 'roles', 'admin.json'))).toBe(false);
    expect(await manager.delete(role['@id'])).toBe(false); // already gone
  });

  test('list reflects all role files on disk', async () => {
    const manager = await newManager();
    await manager.create(makeRole('admin'));
    await manager.create(makeRole('editor'));
    await manager.create(makeRole('reader'));

    const all = await manager.list();
    expect(all.map((r: any) => r.namedPosition).sort()).toEqual(['admin', 'editor', 'reader']);
  });
  // #1431 (operator, 2026-09-21): a record holds membership only. Records
  // written before step 1 carried a copy of the catalogue entry and a
  // permissions list; start-up strips it, once, and leaves the rest alone.
  describe('start-up strips the stale catalogue copy (#1431)', () => {
    const legacy = () => ({
      ...makeRole('admin', [PERSON_A, PERSON_B]),
      roleName: 'Administrator',
      description: 'Full system access',
      issystem: true,
      icon: 'shield-alt',
      color: '#dc3545',
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'permissions', value: ['page-read', 'admin-system'] },
        { '@type': 'PropertyValue', name: 'externalRef', value: 'kept' }
      ]
    });

    const seed = async (record: Record<string, unknown>) => {
      await fs.ensureDir(path.join(tmpDir, 'roles'));
      await fs.writeJson(path.join(tmpDir, 'roles', `${record.namedPosition as string}.json`), record);
    };
    const onDisk = (name: string) => fs.readJson(path.join(tmpDir, 'roles', `${name}.json`));

    test('removes the copied fields and the permissions entry; keeps identity, members and other properties', async () => {
      await seed(legacy());
      await newManager();

      const record = await onDisk('admin');
      expect(Object.keys(record).sort()).toEqual(
        ['@context', '@id', '@type', 'additionalProperty', 'member', 'namedPosition', 'organization'].sort()
      );
      expect(record.member).toEqual([{ '@id': PERSON_A }, { '@id': PERSON_B }]);
      expect(record.additionalProperty).toEqual([{ '@type': 'PropertyValue', name: 'externalRef', value: 'kept' }]);
    });

    test('drops additionalProperty entirely when permissions was all it held', async () => {
      const record = legacy();
      record.additionalProperty = [record.additionalProperty[0]];
      await seed(record);
      await newManager();

      expect('additionalProperty' in (await onDisk('admin'))).toBe(false);
    });

    test('a clean record is not rewritten', async () => {
      await seed(makeRole('editor', [PERSON_A]));
      const file = path.join(tmpDir, 'roles', 'editor.json');
      const before = (await fs.stat(file)).mtimeMs;
      await new Promise((r) => setTimeout(r, 20));
      await newManager();

      expect((await fs.stat(file)).mtimeMs).toBe(before);
      expect(await onDisk('editor')).toEqual(makeRole('editor', [PERSON_A]));
    });

    test('membership still resolves after the cleanup', async () => {
      await seed(legacy());
      const manager = await newManager();
      expect((await manager.listByMember(PERSON_B)).map((r: any) => r.namedPosition)).toEqual(['admin']);
    });
  });
});
