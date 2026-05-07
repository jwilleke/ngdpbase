/**
 * In-memory cache behaviour for the three #617 identity managers (#620
 * Option B). Exercises the cache hit/miss/bust pattern uniformly across
 * RoleManager, PersonManager, OrganizationManager. Each manager is tested
 * with a stub provider whose method calls are counted via vi.fn() — the
 * cache effect is observable as "provider only saw 1 call across N reads
 * with the same key, then saw 1 more after a write."
 */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';

describe('Identity manager caches (#620 Option B)', () => {
  let tmpDir: string;
  let RoleManager: any;
  let PersonManager: any;
  let OrganizationManager: any;

  const ORG_ID = 'https://example.com/';
  const PERSON_A = 'urn:uuid:11111111-1111-1111-1111-111111111111';
  const PERSON_B = 'urn:uuid:22222222-2222-2222-2222-222222222222';

  const makeConfig = (overrides: Record<string, unknown> = {}) => ({
    getProperty: vi.fn((key: string, defaultValue: unknown) => {
      if (key in overrides) return overrides[key];
      return defaultValue;
    }),
    getResolvedDataPath: vi.fn((key: string, defaultValue: string) =>
      (overrides[key] as string) ?? defaultValue
    )
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'identity-cache-test-'));
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.FAST_STORAGE;
    delete process.env.INSTANCE_DATA_FOLDER;
    process.env.INSTANCE_DATA_FOLDER = tmpDir;

    RoleManager = (await import('../RoleManager')).default;
    PersonManager = (await import('../PersonManager')).default;
    OrganizationManager = (await import('../OrganizationManager')).default;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
    delete process.env.INSTANCE_DATA_FOLDER;
  });

  describe('RoleManager', () => {
    const mockRole = (namedPosition: string, members: string[]) => ({
      '@context': 'https://schema.org' as const,
      '@type': 'OrganizationRole' as const,
      '@id': `${ORG_ID}roles/${namedPosition}#role`,
      namedPosition,
      organization: { '@id': ORG_ID },
      member: members.map((id) => ({ '@id': id }))
    });

    const stubProvider = (initialRoles: any[] = []) => {
      let store = [...initialRoles];
      return {
        initialized: true,
        list: vi.fn(async () => [...store]),
        getById: vi.fn(async (id: string) => store.find((r) => r['@id'] === id) ?? null),
        getByOrgAndPosition: vi.fn(async (orgId: string, np: string) =>
          store.find((r) => r.organization['@id'] === orgId && r.namedPosition === np) ?? null
        ),
        listByMember: vi.fn(async (personId: string) =>
          store.filter((r) => (r.member ?? []).some((m: any) => m['@id'] === personId))
        ),
        create: vi.fn(async (r: any) => { store.push(r); return r; }),
        update: vi.fn(async (id: string, patch: any) => {
          const idx = store.findIndex((r) => r['@id'] === id);
          if (idx < 0) return null;
          store[idx] = { ...store[idx], ...patch };
          return store[idx];
        }),
        delete: vi.fn(async (id: string) => {
          const before = store.length;
          store = store.filter((r) => r['@id'] !== id);
          return store.length < before;
        }),
        initialize: vi.fn(async () => {}),
        shutdown: vi.fn(async () => {}),
        getProviderInfo: vi.fn(() => ({ name: 'stub', version: '0.0.0', description: '', features: [] }))
      };
    };

    const makeManager = async (initialRoles: any[] = []) => {
      const configManager = makeConfig({
        'ngdpbase.application.roles.storagedir': path.join(tmpDir, 'roles')
      });
      const engine = {
        getManager: vi.fn((name: string) => name === 'ConfigurationManager' ? configManager : null)
      };
      const manager = new RoleManager(engine);
      await manager.initialize();
      // Replace the file provider with our spying stub
      const provider = stubProvider(initialRoles);
      (manager).provider = provider;
      return { manager, provider };
    };

    test('listByMember: repeated reads with same key hit the provider once', async () => {
      const { manager, provider } = await makeManager([
        mockRole('admin', [PERSON_A]),
        mockRole('editor', [PERSON_A, PERSON_B])
      ]);

      const r1 = await manager.listByMember(PERSON_A);
      const r2 = await manager.listByMember(PERSON_A);
      const r3 = await manager.listByMember(PERSON_A);

      expect(provider.listByMember).toHaveBeenCalledTimes(1);
      expect(r1.map((r: any) => r.namedPosition).sort()).toEqual(['admin', 'editor']);
      expect(r2).toBe(r1);
      expect(r3).toBe(r1);
    });

    test('listByMember: distinct keys each fetch once', async () => {
      const { manager, provider } = await makeManager([
        mockRole('admin', [PERSON_A]),
        mockRole('editor', [PERSON_B])
      ]);

      await manager.listByMember(PERSON_A);
      await manager.listByMember(PERSON_B);
      await manager.listByMember(PERSON_A);
      await manager.listByMember(PERSON_B);

      expect(provider.listByMember).toHaveBeenCalledTimes(2);
    });

    test('create busts the cache', async () => {
      const { manager, provider } = await makeManager([mockRole('admin', [PERSON_A])]);

      await manager.listByMember(PERSON_A);
      await manager.create(mockRole('reader', [PERSON_A]));
      await manager.listByMember(PERSON_A);

      expect(provider.listByMember).toHaveBeenCalledTimes(2);
    });

    test('update busts the cache', async () => {
      const role = mockRole('admin', [PERSON_A]);
      const { manager, provider } = await makeManager([role]);

      await manager.listByMember(PERSON_A);
      await manager.update(role['@id'], { description: 'changed' });
      await manager.listByMember(PERSON_A);

      expect(provider.listByMember).toHaveBeenCalledTimes(2);
    });

    test('delete busts the cache', async () => {
      const role = mockRole('admin', [PERSON_A]);
      const { manager, provider } = await makeManager([role]);

      await manager.listByMember(PERSON_A);
      await manager.delete(role['@id']);
      const after = await manager.listByMember(PERSON_A);

      expect(provider.listByMember).toHaveBeenCalledTimes(2);
      expect(after).toEqual([]);
    });

    test('getByOrgAndPosition: cached separately from listByMember', async () => {
      const { manager, provider } = await makeManager([mockRole('admin', [PERSON_A])]);

      await manager.getByOrgAndPosition(ORG_ID, 'admin');
      await manager.getByOrgAndPosition(ORG_ID, 'admin');
      expect(provider.getByOrgAndPosition).toHaveBeenCalledTimes(1);

      await manager.getByOrgAndPosition(ORG_ID, 'editor');
      expect(provider.getByOrgAndPosition).toHaveBeenCalledTimes(2);
    });

    test('invalidateCache() clears member and byOrgPosition caches together', async () => {
      const { manager, provider } = await makeManager([mockRole('admin', [PERSON_A])]);

      await manager.listByMember(PERSON_A);
      await manager.getByOrgAndPosition(ORG_ID, 'admin');
      manager.invalidateCache();
      await manager.listByMember(PERSON_A);
      await manager.getByOrgAndPosition(ORG_ID, 'admin');

      expect(provider.listByMember).toHaveBeenCalledTimes(2);
      expect(provider.getByOrgAndPosition).toHaveBeenCalledTimes(2);
    });
  });

  describe('PersonManager', () => {
    const mockPerson = (identifier: string, id: string = `urn:uuid:${identifier}`) => ({
      '@context': 'https://schema.org' as const,
      '@type': 'Person' as const,
      '@id': id,
      identifier,
      name: identifier
    });

    const stubProvider = (initialPersons: any[] = []) => {
      let store = [...initialPersons];
      return {
        initialized: true,
        list: vi.fn(async () => [...store]),
        getById: vi.fn(async (id: string) => store.find((p) => p['@id'] === id) ?? null),
        getByIdentifier: vi.fn(async (ident: string) => store.find((p) => p.identifier === ident) ?? null),
        create: vi.fn(async (p: any) => { store.push(p); return p; }),
        update: vi.fn(async (id: string, patch: any) => {
          const idx = store.findIndex((p) => p['@id'] === id);
          if (idx < 0) return null;
          store[idx] = { ...store[idx], ...patch };
          return store[idx];
        }),
        delete: vi.fn(async (id: string) => {
          const before = store.length;
          store = store.filter((p) => p['@id'] !== id);
          return store.length < before;
        }),
        initialize: vi.fn(async () => {}),
        shutdown: vi.fn(async () => {}),
        getProviderInfo: vi.fn(() => ({ name: 'stub', version: '0.0.0', description: '', features: [] }))
      };
    };

    const makeManager = async (initialPersons: any[] = []) => {
      const configManager = makeConfig({
        'ngdpbase.application.persons.storagedir': path.join(tmpDir, 'persons')
      });
      const engine = {
        getManager: vi.fn((name: string) => name === 'ConfigurationManager' ? configManager : null)
      };
      const manager = new PersonManager(engine);
      await manager.initialize();
      const provider = stubProvider(initialPersons);
      (manager).provider = provider;
      return { manager, provider };
    };

    test('getByIdentifier: repeated reads with same key hit the provider once', async () => {
      const { manager, provider } = await makeManager([mockPerson('alice')]);

      await manager.getByIdentifier('alice');
      await manager.getByIdentifier('alice');
      await manager.getByIdentifier('alice');

      expect(provider.getByIdentifier).toHaveBeenCalledTimes(1);
    });

    test('getByIdentifier: caches null results too', async () => {
      const { manager, provider } = await makeManager([]);

      await manager.getByIdentifier('ghost');
      await manager.getByIdentifier('ghost');

      expect(provider.getByIdentifier).toHaveBeenCalledTimes(1);
    });

    test('create busts both caches', async () => {
      const { manager, provider } = await makeManager([mockPerson('alice')]);

      await manager.getByIdentifier('alice');
      await manager.getById(mockPerson('alice')['@id']);
      await manager.create(mockPerson('bob'));
      await manager.getByIdentifier('alice');
      await manager.getById(mockPerson('alice')['@id']);

      expect(provider.getByIdentifier).toHaveBeenCalledTimes(2);
      expect(provider.getById).toHaveBeenCalledTimes(2);
    });

    test('update busts both caches', async () => {
      const alice = mockPerson('alice');
      const { manager, provider } = await makeManager([alice]);

      await manager.getByIdentifier('alice');
      await manager.update(alice['@id'], { name: 'Alice Smith' });
      await manager.getByIdentifier('alice');

      expect(provider.getByIdentifier).toHaveBeenCalledTimes(2);
    });

    test('delete busts both caches', async () => {
      const alice = mockPerson('alice');
      const { manager, provider } = await makeManager([alice]);

      await manager.getByIdentifier('alice');
      await manager.delete(alice['@id']);
      const after = await manager.getByIdentifier('alice');

      expect(provider.getByIdentifier).toHaveBeenCalledTimes(2);
      expect(after).toBeNull();
    });
  });

  describe('OrganizationManager', () => {
    const mockOrg = (id: string, name: string, url?: string) => ({
      '@context': 'https://schema.org' as const,
      '@type': 'Organization' as const,
      '@id': id,
      name,
      ...(url ? { url } : {})
    });

    const stubProvider = (initialOrgs: any[] = [], filenameMap: Record<string, any> = {}) => {
      let store = [...initialOrgs];
      const filenames = { ...filenameMap };
      return {
        initialized: true,
        list: vi.fn(async () => [...store]),
        getById: vi.fn(async (id: string) => store.find((o) => o['@id'] === id) ?? null),
        getByFile: vi.fn(async (filename: string) => filenames[filename] ?? null),
        create: vi.fn(async (org: any, filename?: string) => {
          store.push(org);
          if (filename) filenames[filename] = org;
          return org;
        }),
        update: vi.fn(async (id: string, patch: any) => {
          const idx = store.findIndex((o) => o['@id'] === id);
          if (idx < 0) return null;
          store[idx] = { ...store[idx], ...patch };
          return store[idx];
        }),
        delete: vi.fn(async (id: string) => {
          const before = store.length;
          store = store.filter((o) => o['@id'] !== id);
          return store.length < before;
        }),
        initialize: vi.fn(async () => {}),
        shutdown: vi.fn(async () => {}),
        getProviderInfo: vi.fn(() => ({ name: 'stub', version: '0.0.0', description: '', features: [] }))
      };
    };

    const makeManager = async (
      initialOrgs: any[] = [],
      filenameMap: Record<string, any> = {},
      anchorFile = ''
    ) => {
      const configManager = makeConfig({
        'ngdpbase.application.organization.storagedir': path.join(tmpDir, 'organizations'),
        'ngdpbase.application.organization.file': anchorFile
      });
      const engine = {
        getManager: vi.fn((name: string) => name === 'ConfigurationManager' ? configManager : null)
      };
      const manager = new OrganizationManager(engine);
      await manager.initialize();
      const provider = stubProvider(initialOrgs, filenameMap);
      (manager).provider = provider;
      return { manager, provider };
    };

    test('getInstallOrg: repeated reads hit the provider once', async () => {
      const anchor = mockOrg(ORG_ID, 'Anchor');
      const { manager, provider } = await makeManager([anchor], { 'anchor.json': anchor }, 'anchor.json');

      await manager.getInstallOrg();
      await manager.getInstallOrg();
      await manager.getInstallOrg();

      expect(provider.getByFile).toHaveBeenCalledTimes(1);
    });

    test('getInstallOrg: null when no anchor configured, still cached', async () => {
      const { manager, provider } = await makeManager([], {}, '');

      const a = await manager.getInstallOrg();
      const b = await manager.getInstallOrg();

      expect(a).toBeNull();
      expect(b).toBeNull();
      expect(provider.getByFile).not.toHaveBeenCalled();
    });

    test('create busts getInstallOrg + getByFile + getById', async () => {
      const anchor = mockOrg(ORG_ID, 'Anchor');
      const { manager, provider } = await makeManager([anchor], { 'anchor.json': anchor }, 'anchor.json');

      await manager.getInstallOrg();
      await manager.getByFile('anchor.json');
      await manager.getById(ORG_ID);
      await manager.create(mockOrg('urn:other', 'Other'));
      await manager.getInstallOrg();
      await manager.getByFile('anchor.json');
      await manager.getById(ORG_ID);

      expect(provider.getByFile).toHaveBeenCalledTimes(2 + 2);
      expect(provider.getById).toHaveBeenCalledTimes(2);
    });

    test('update busts the install-org cache', async () => {
      const anchor = mockOrg(ORG_ID, 'Anchor');
      const { manager, provider } = await makeManager([anchor], { 'anchor.json': anchor }, 'anchor.json');

      await manager.getInstallOrg();
      await manager.update(ORG_ID, { name: 'Renamed' });
      await manager.getInstallOrg();

      expect(provider.getByFile).toHaveBeenCalledTimes(2);
    });

    test('delete busts caches', async () => {
      const anchor = mockOrg(ORG_ID, 'Anchor');
      const { manager, provider } = await makeManager([anchor], { 'anchor.json': anchor }, 'anchor.json');

      await manager.getById(ORG_ID);
      await manager.delete(ORG_ID);
      await manager.getById(ORG_ID);

      expect(provider.getById).toHaveBeenCalledTimes(2);
    });
  });

  // #620 hit/miss telemetry — verify each cache lookup records a single
  // recordCacheLookup() call with the correct {manager, cache, result}
  // attributes. Stubbed MetricsManager swaps in for the real one via the
  // engine.getManager() mock.
  describe('cache telemetry (#620)', () => {
    const stubMetrics = () => ({
      recordCacheLookup: vi.fn()
    });

    test('RoleManager.listByMember records hit and miss', async () => {
      const metrics = stubMetrics();
      const configManager = makeConfig({
        'ngdpbase.application.roles.storagedir': path.join(tmpDir, 'roles')
      });
      const engine = {
        getManager: vi.fn((name: string) => {
          if (name === 'ConfigurationManager') return configManager;
          if (name === 'MetricsManager') return metrics;
          return null;
        })
      };
      const manager = new RoleManager(engine);
      await manager.initialize();
      (manager).provider = {
        listByMember: vi.fn(async () => []),
        initialize: vi.fn(async () => {}),
        list: vi.fn(async () => [])
      };

      await manager.listByMember(PERSON_A); // miss
      await manager.listByMember(PERSON_A); // hit

      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'RoleManager', cache: 'memberCache', result: 'miss' });
      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'RoleManager', cache: 'memberCache', result: 'hit' });
      expect(metrics.recordCacheLookup).toHaveBeenCalledTimes(2);
    });

    test('RoleManager.getByOrgAndPosition records hit and miss', async () => {
      const metrics = stubMetrics();
      const configManager = makeConfig({
        'ngdpbase.application.roles.storagedir': path.join(tmpDir, 'roles')
      });
      const engine = {
        getManager: vi.fn((name: string) => {
          if (name === 'ConfigurationManager') return configManager;
          if (name === 'MetricsManager') return metrics;
          return null;
        })
      };
      const manager = new RoleManager(engine);
      await manager.initialize();
      (manager).provider = {
        getByOrgAndPosition: vi.fn(async () => null),
        initialize: vi.fn(async () => {}),
        list: vi.fn(async () => [])
      };

      await manager.getByOrgAndPosition(ORG_ID, 'admin'); // miss
      await manager.getByOrgAndPosition(ORG_ID, 'admin'); // hit

      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'RoleManager', cache: 'byOrgPosition', result: 'miss' });
      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'RoleManager', cache: 'byOrgPosition', result: 'hit' });
    });

    test('PersonManager.getByIdentifier records hit and miss', async () => {
      const metrics = stubMetrics();
      const configManager = makeConfig({
        'ngdpbase.application.persons.storagedir': path.join(tmpDir, 'persons')
      });
      const engine = {
        getManager: vi.fn((name: string) => {
          if (name === 'ConfigurationManager') return configManager;
          if (name === 'MetricsManager') return metrics;
          return null;
        })
      };
      const manager = new PersonManager(engine);
      await manager.initialize();
      (manager).provider = {
        getByIdentifier: vi.fn(async () => null),
        initialize: vi.fn(async () => {}),
        list: vi.fn(async () => [])
      };

      await manager.getByIdentifier('alice'); // miss
      await manager.getByIdentifier('alice'); // hit

      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'PersonManager', cache: 'byIdentifier', result: 'miss' });
      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'PersonManager', cache: 'byIdentifier', result: 'hit' });
    });

    test('PersonManager.getById records hit and miss', async () => {
      const metrics = stubMetrics();
      const configManager = makeConfig({
        'ngdpbase.application.persons.storagedir': path.join(tmpDir, 'persons')
      });
      const engine = {
        getManager: vi.fn((name: string) => {
          if (name === 'ConfigurationManager') return configManager;
          if (name === 'MetricsManager') return metrics;
          return null;
        })
      };
      const manager = new PersonManager(engine);
      await manager.initialize();
      (manager).provider = {
        getById: vi.fn(async () => null),
        initialize: vi.fn(async () => {}),
        list: vi.fn(async () => [])
      };

      await manager.getById(PERSON_A); // miss
      await manager.getById(PERSON_A); // hit

      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'PersonManager', cache: 'byId', result: 'miss' });
      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'PersonManager', cache: 'byId', result: 'hit' });
    });

    test('OrganizationManager.getInstallOrg records hit and miss', async () => {
      const metrics = stubMetrics();
      const configManager = makeConfig({
        'ngdpbase.application.organization.storagedir': path.join(tmpDir, 'organizations'),
        'ngdpbase.application.organization.file': 'anchor.json'
      });
      const engine = {
        getManager: vi.fn((name: string) => {
          if (name === 'ConfigurationManager') return configManager;
          if (name === 'MetricsManager') return metrics;
          return null;
        })
      };
      const manager = new OrganizationManager(engine);
      await manager.initialize();
      (manager).provider = {
        getByFile: vi.fn(async () => ({ '@id': ORG_ID, '@type': 'Organization', name: 'Anchor' })),
        initialize: vi.fn(async () => {}),
        list: vi.fn(async () => [])
      };

      await manager.getInstallOrg(); // miss
      await manager.getInstallOrg(); // hit

      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'OrganizationManager', cache: 'installOrg', result: 'miss' });
      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'OrganizationManager', cache: 'installOrg', result: 'hit' });
    });

    test('OrganizationManager.getById records hit and miss', async () => {
      const metrics = stubMetrics();
      const configManager = makeConfig({
        'ngdpbase.application.organization.storagedir': path.join(tmpDir, 'organizations')
      });
      const engine = {
        getManager: vi.fn((name: string) => {
          if (name === 'ConfigurationManager') return configManager;
          if (name === 'MetricsManager') return metrics;
          return null;
        })
      };
      const manager = new OrganizationManager(engine);
      await manager.initialize();
      (manager).provider = {
        getById: vi.fn(async () => null),
        initialize: vi.fn(async () => {}),
        list: vi.fn(async () => [])
      };

      await manager.getById(ORG_ID); // miss
      await manager.getById(ORG_ID); // hit

      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'OrganizationManager', cache: 'byId', result: 'miss' });
      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'OrganizationManager', cache: 'byId', result: 'hit' });
    });

    test('OrganizationManager.getByFile records hit and miss', async () => {
      const metrics = stubMetrics();
      const configManager = makeConfig({
        'ngdpbase.application.organization.storagedir': path.join(tmpDir, 'organizations')
      });
      const engine = {
        getManager: vi.fn((name: string) => {
          if (name === 'ConfigurationManager') return configManager;
          if (name === 'MetricsManager') return metrics;
          return null;
        })
      };
      const manager = new OrganizationManager(engine);
      await manager.initialize();
      (manager).provider = {
        getByFile: vi.fn(async () => null),
        initialize: vi.fn(async () => {}),
        list: vi.fn(async () => [])
      };

      await manager.getByFile('anchor.json'); // miss
      await manager.getByFile('anchor.json'); // hit

      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'OrganizationManager', cache: 'byFile', result: 'miss' });
      expect(metrics.recordCacheLookup).toHaveBeenCalledWith({ manager: 'OrganizationManager', cache: 'byFile', result: 'hit' });
    });

    test('telemetry is a no-op when MetricsManager is not registered', async () => {
      const configManager = makeConfig({
        'ngdpbase.application.persons.storagedir': path.join(tmpDir, 'persons')
      });
      const engine = {
        getManager: vi.fn((name: string) => name === 'ConfigurationManager' ? configManager : null)
      };
      const manager = new PersonManager(engine);
      await manager.initialize();
      (manager).provider = {
        getByIdentifier: vi.fn(async () => null),
        initialize: vi.fn(async () => {}),
        list: vi.fn(async () => [])
      };

      // Should not throw — getMetrics() resolves to null and the optional chain no-ops.
      await expect(manager.getByIdentifier('alice')).resolves.toBeNull();
      await expect(manager.getByIdentifier('alice')).resolves.toBeNull();
    });
  });
});
