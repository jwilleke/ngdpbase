import os from 'os';
import path from 'path';
import fs from 'fs-extra';

describe('OrganizationManager (#617)', () => {
  let tmpDir: string;
  let OrganizationManager: any;

  const makeConfigManager = (overrides: Record<string, unknown> = {}) => ({
    getProperty: vi.fn((key: string, defaultValue: unknown) => {
      const map = overrides;
      if (key in map) return map[key];
      return defaultValue;
    }),
    getResolvedDataPath: vi.fn((_key: string, _defaultValue: string) =>
      (overrides['ngdpbase.application.organization.storagedir'] as string)
        ?? path.join(tmpDir, 'organizations')
    ),
    // seedAnchorOrganization reads the base URL through getBaseURL(), NOT through
    // getProperty('ngdpbase.application.base-url'). A mock carrying only the
    // property made tier 3 look broken when it was the harness that was wrong.
    getBaseURL: vi.fn(() => (overrides['ngdpbase.application.base-url'] as string) ?? '')
  });

  const makeEngine = (configManager: ReturnType<typeof makeConfigManager>) => ({
    getManager: vi.fn((name: string) =>
      name === 'ConfigurationManager' ? configManager : null
    )
  });

  beforeAll(() => {
    vi.setConfig({ testTimeout: 10000 });
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'org-mgr-test-'));
    vi.resetModules();
    vi.clearAllMocks();
    // FAST_STORAGE not set — use the temp-dir override below
    delete process.env.FAST_STORAGE;
    delete process.env.INSTANCE_DATA_FOLDER;
    process.env.INSTANCE_DATA_FOLDER = tmpDir;

    const mod = await import('../OrganizationManager');
    OrganizationManager = mod.default ?? mod;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
    delete process.env.INSTANCE_DATA_FOLDER;
  });

  test('seedFromConfig writes an Organization JSON-LD file with the correct @id', async () => {
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': path.join(tmpDir, 'organizations')
    });
    const engine = makeEngine(configManager);

    const manager = new OrganizationManager(engine);
    await manager.initialize();

    const org = await manager.seedFromConfig({
      orgName: 'Acme Corporation',
      orgUrl: 'https://example.com/',
      orgDescription: 'We make widgets',
      adminEmail: 'tech@example.com',
      filename: 'acme-corporation.json'
    });

    expect(org).not.toBeNull();
    expect(org!['@type']).toBe('Organization');
    expect(org!['@id']).toBe('https://example.com/');
    expect(org!.name).toBe('Acme Corporation');
    expect(org!.contactPoint?.[0]?.email).toBe('tech@example.com');

    const written = await fs.readJson(path.join(tmpDir, 'organizations', 'acme-corporation.json'));
    expect(written['@id']).toBe('https://example.com/');
  });

  test('seedFromConfig is idempotent — second call returns existing org without rewrite', async () => {
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': path.join(tmpDir, 'organizations')
    });
    const engine = makeEngine(configManager);

    const manager = new OrganizationManager(engine);
    await manager.initialize();

    const first = await manager.seedFromConfig({
      orgName: 'Acme',
      orgUrl: 'https://acme.test/',
      filename: 'acme.json'
    });

    // Tamper with the file to prove the second call doesn't overwrite
    const filePath = path.join(tmpDir, 'organizations', 'acme.json');
    await fs.writeJson(filePath, { ...first, marker: 'tampered' });

    const second = await manager.seedFromConfig({
      orgName: 'Acme (different name)',
      orgUrl: 'https://different.test/',
      filename: 'acme.json'
    });

    expect((second).marker).toBe('tampered');
    expect((second)['@id']).toBe('https://acme.test/');
  });

  test('getInstallOrg returns the org named by the .file config key', async () => {
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': path.join(tmpDir, 'organizations'),
      'ngdpbase.application.organization.file': 'acme.json'
    });
    const engine = makeEngine(configManager);

    const manager = new OrganizationManager(engine);
    await manager.initialize();
    await manager.seedFromConfig({
      orgName: 'Acme',
      orgUrl: 'https://acme.test/',
      filename: 'acme.json'
    });

    const anchor = await manager.getInstallOrg();
    expect(anchor).not.toBeNull();
    expect(anchor!.name).toBe('Acme');
  });

  test('list returns multiple orgs (multi-org from day one)', async () => {
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': path.join(tmpDir, 'organizations')
    });
    const engine = makeEngine(configManager);

    const manager = new OrganizationManager(engine);
    await manager.initialize();

    await manager.create({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://one.test/',
      name: 'One'
    });
    await manager.create({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://two.test/',
      name: 'Two'
    });

    const all = await manager.list();
    expect(all).toHaveLength(2);
    expect(all.map((o: any) => o['@id']).sort()).toEqual(['https://one.test/', 'https://two.test/']);
  });

  test('install round-trip — seedFromConfig satisfies the startup invariant on next boot', async () => {
    const orgsDir = path.join(tmpDir, 'organizations');
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': orgsDir,
      'ngdpbase.application.organization.file': 'fairways.json'
    });
    const engine = makeEngine(configManager);

    // First boot — fresh install, no .install-complete yet. Form data drives
    // the seed; org metadata lives in the JSON-LD file, not config.
    const first = new OrganizationManager(engine);
    await first.initialize();
    await first.seedFromConfig({
      orgName: 'The Fairways',
      orgUrl: 'https://fairways.example.com/',
      filename: 'fairways.json'
    });
    expect(await fs.pathExists(path.join(orgsDir, 'fairways.json'))).toBe(true);

    // Install completion marker.
    await fs.writeJson(path.join(tmpDir, '.install-complete'), { headless: true });

    // Second boot — install-complete + .file set + file present → no throw.
    const second = new OrganizationManager(engine);
    await expect(second.initialize()).resolves.toBeUndefined();
    const anchor = await second.getInstallOrg();
    expect(anchor!['@id']).toBe('https://fairways.example.com/');
  });

  test('create rejects duplicate filename (#617, locked decision #10)', async () => {
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': path.join(tmpDir, 'organizations')
    });
    const engine = makeEngine(configManager);

    const manager = new OrganizationManager(engine);
    await manager.initialize();

    await manager.create({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://one.test/',
      name: 'One'
    }, 'shared.json');

    await expect(manager.create({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://two.test/',
      name: 'Two'
    }, 'shared.json')).rejects.toThrow(/file already exists at shared\.json/);
  });

  test('create rejects duplicate @id even with a different filename (#617, locked decision #10)', async () => {
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': path.join(tmpDir, 'organizations')
    });
    const engine = makeEngine(configManager);

    const manager = new OrganizationManager(engine);
    await manager.initialize();

    await manager.create({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://shared-id.test/',
      name: 'First'
    }, 'first.json');

    await expect(manager.create({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': 'https://shared-id.test/',
      name: 'Second'
    }, 'second.json')).rejects.toThrow(/already uses that @id/);
  });

  test('seedFromConfig stays idempotent under uniqueness checks (rerun on existing file does not throw)', async () => {
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': path.join(tmpDir, 'organizations')
    });
    const engine = makeEngine(configManager);

    const manager = new OrganizationManager(engine);
    await manager.initialize();

    const first = await manager.seedFromConfig({
      orgName: 'Acme',
      orgUrl: 'https://acme.test/',
      filename: 'acme.json'
    });

    const second = await manager.seedFromConfig({
      orgName: 'Acme',
      orgUrl: 'https://acme.test/',
      filename: 'acme.json'
    });

    expect((second)['@id']).toBe(first!['@id']);
  });

  // ── three-tier anchor resolution (#1027) ──────────────────────────────────
  //
  // An instance could boot healthy and be structurally incapable of assigning
  // ANY role — including `admin` to the default admin — because `getInstallOrg`
  // returned null and cached it. UserManager.syncRoleAdd then abandoned every
  // assignment. Nothing logged. That was the default for containerised installs,
  // since headless deployments do not pre-supply the JSON-LD file.

  test('tier 2 — no config key and exactly ONE record: adopt it', async () => {
    // Requiring a config key to state the obvious is what left headless
    // deployments unable to assign roles.
    const orgsDir = path.join(tmpDir, 'organizations');
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': orgsDir
      // no .file key at all
    });
    const manager = new OrganizationManager(makeEngine(configManager));
    await manager.initialize();
    await manager.seedFromConfig({ orgName: 'Solo', orgUrl: 'https://solo.test/', filename: 'solo.json' });

    const anchor = await manager.getInstallOrg();

    expect(anchor).not.toBeNull();
    expect(anchor!.name).toBe('Solo');
  });

  test('tier 2 does NOT rewrite the adopted record @id', async () => {
    // Role records reference the organization by @id. Normalising even a
    // trailing slash would orphan every role on the instance.
    const orgsDir = path.join(tmpDir, 'organizations');
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': orgsDir
    });
    const manager = new OrganizationManager(makeEngine(configManager));
    await manager.initialize();
    await manager.seedFromConfig({ orgName: 'Solo', orgUrl: 'https://solo.test', filename: 'solo.json' });

    const before = (await manager.list())[0]['@id'];
    const anchor = await manager.getInstallOrg();

    expect(anchor!['@id']).toBe(before);
    expect((await manager.list())[0]['@id']).toBe(before);
  });

  test('tier 3 — nothing at all: seed one from the base URL', async () => {
    const orgsDir = path.join(tmpDir, 'organizations');
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': orgsDir,
      'ngdpbase.application.base-url': 'https://fresh.test/',
      'ngdpbase.application-name': 'Fresh Instance'
    });
    const manager = new OrganizationManager(makeEngine(configManager));
    await manager.initialize();

    const anchor = await manager.getInstallOrg();

    expect(anchor).not.toBeNull();
    expect(anchor!.name).toBe('Fresh Instance');
    expect(await manager.list()).toHaveLength(1);
  });

  test('tier 3 seeds ONCE — a second call does not add another record', async () => {
    const orgsDir = path.join(tmpDir, 'organizations');
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': orgsDir,
      'ngdpbase.application.base-url': 'https://fresh.test/'
    });
    const manager = new OrganizationManager(makeEngine(configManager));
    await manager.initialize();

    await manager.getInstallOrg();
    manager.invalidateInstallOrgCache?.();
    await manager.getInstallOrg();

    expect(await manager.list()).toHaveLength(1);
  });

  test('several records and no key resolves to null — and seeds nothing', async () => {
    // Deliberate. Picking one arbitrarily could bind every role to the wrong
    // organization, and seeding an additional record would add to the very
    // ambiguity being reported. An earlier draft let tier 3 fire here.
    const orgsDir = path.join(tmpDir, 'organizations');
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': orgsDir,
      'ngdpbase.application.base-url': 'https://fresh.test/'
    });
    const manager = new OrganizationManager(makeEngine(configManager));
    await manager.initialize();
    await manager.seedFromConfig({ orgName: 'One', orgUrl: 'https://one.test/', filename: 'one.json' });
    await manager.seedFromConfig({ orgName: 'Two', orgUrl: 'https://two.test/', filename: 'two.json' });

    const anchor = await manager.getInstallOrg();

    expect(anchor).toBeNull();
    expect(await manager.list()).toHaveLength(2);
  });

  test('the config key still wins over both fallbacks', async () => {
    const orgsDir = path.join(tmpDir, 'organizations');
    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': orgsDir,
      'ngdpbase.application.organization.file': 'two.json',
      'ngdpbase.application.base-url': 'https://fresh.test/'
    });
    const manager = new OrganizationManager(makeEngine(configManager));
    await manager.initialize();
    await manager.seedFromConfig({ orgName: 'One', orgUrl: 'https://one.test/', filename: 'one.json' });
    await manager.seedFromConfig({ orgName: 'Two', orgUrl: 'https://two.test/', filename: 'two.json' });

    const anchor = await manager.getInstallOrg();

    expect(anchor!.name).toBe('Two');
  });

  test('startup invariant — install-complete + missing anchor file → throws', async () => {
    const orgsDir = path.join(tmpDir, 'organizations');
    await fs.ensureDir(orgsDir);

    // Mark install as complete WITHOUT writing the anchor file.
    await fs.writeJson(path.join(tmpDir, '.install-complete'), { marker: true });

    const configManager = makeConfigManager({
      'ngdpbase.application.organization.storagedir': orgsDir,
      'ngdpbase.application.organization.file': 'never-written.json'
    });
    const engine = makeEngine(configManager);

    const manager = new OrganizationManager(engine);
    await expect(manager.initialize()).rejects.toThrow(/anchor organization file is missing/);
  });
});
