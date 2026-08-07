/**
 * Anchor-organization resolution (#1027).
 *
 * A headless install that was never handed an Organization JSON-LD could not
 * assign ANY role to ANY user — including `admin` to the default admin — and
 * said nothing about it. `docker/HEADLESS-DEPLOYMENT-NOTES.md` §1 documented
 * the remedy as "edit your deployment YAML", which is knowledge that does not
 * survive contact with a new deployment.
 *
 * getInstallOrg() now resolves in three tiers. These pin each one, including
 * the case where it must deliberately resolve to nothing.
 */

import os from 'os';
import path from 'path';
import fs from 'fs-extra';

describe('getInstallOrg — anchor resolution tiers (#1027)', () => {
  let tmpDir: string;
  let orgsDir: string;
  let OrganizationManager: any;

  const makeConfigManager = (overrides: Record<string, unknown> = {}) => ({
    getProperty: vi.fn((key: string, defaultValue: unknown) =>
      key in overrides ? overrides[key] : defaultValue
    ),
    getResolvedDataPath: vi.fn(() => orgsDir),
    getBaseURL: vi.fn(() => (overrides['ngdpbase.application.base-url'] as string) ?? '')
  });

  const makeEngine = (configManager: ReturnType<typeof makeConfigManager>) => ({
    getManager: vi.fn((name: string) =>
      name === 'ConfigurationManager' ? configManager : null
    )
  });

  const writeOrg = async (filename: string, id: string, name: string) => {
    await fs.ensureDir(orgsDir);
    await fs.writeJson(path.join(orgsDir, filename), {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': id,
      name,
      url: id
    });
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'org-anchor-test-'));
    orgsDir = path.join(tmpDir, 'organizations');
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.FAST_STORAGE;
    process.env.INSTANCE_DATA_FOLDER = tmpDir;
    const mod = await import('../OrganizationManager');
    OrganizationManager = mod.default ?? mod;
  });

  afterEach(async () => {
    await fs.remove(tmpDir).catch(() => {});
    delete process.env.INSTANCE_DATA_FOLDER;
  });

  async function manager(overrides: Record<string, unknown> = {}) {
    const m = new OrganizationManager(makeEngine(makeConfigManager(overrides)));
    await m.initialize();
    return m;
  }

  test('tier 1 — the configured file wins', async () => {
    await writeOrg('named.json', 'https://named.example/', 'Named');
    await writeOrg('other.json', 'https://other.example/', 'Other');

    const m = await manager({ 'ngdpbase.application.organization.file': 'named.json' });
    const org = await m.getInstallOrg();

    expect(org?.['@id']).toBe('https://named.example/');
  });

  test('tier 2 — adopts the sole record when no key names one', async () => {
    // This is what makes an existing instance work with no config and no YAML.
    await writeOrg('geohazardwatch.json', 'https://geohazardwatch.com', 'GeoHazardWatch');

    const m = await manager({ 'ngdpbase.application.base-url': 'https://geohazardwatch.com' });
    const org = await m.getInstallOrg();

    expect(org?.['@id']).toBe('https://geohazardwatch.com');
    expect(org?.name).toBe('GeoHazardWatch');
  });

  test('tier 2 — adoption does not rewrite the @id', async () => {
    // Role records reference the org by @id. Normalising a trailing slash here
    // would orphan every existing role on the instance.
    await writeOrg('geohazardwatch.json', 'https://geohazardwatch.com', 'GeoHazardWatch');

    const m = await manager({ 'ngdpbase.application.base-url': 'https://geohazardwatch.com' });
    const org = await m.getInstallOrg();

    expect(org?.['@id']).toBe('https://geohazardwatch.com');
    expect(org?.['@id']).not.toBe('https://geohazardwatch.com/');
    expect(await fs.readdir(orgsDir)).toEqual(['geohazardwatch.json']);
  });

  test('tier 3 — seeds one when there is nothing to adopt', async () => {
    const m = await manager({
      'ngdpbase.application.base-url': 'https://demo.example.com',
      'ngdpbase.application-name': 'Demo ngdpbase'
    });
    const org = await m.getInstallOrg();

    expect(org).not.toBeNull();
    expect(org!.name).toBe('Demo ngdpbase');
    expect(org!['@id']).toBe('https://demo.example.com/');

    // Written to the storage directory like any other record — which is what
    // makes it editable afterwards, unlike a mounted file.
    const files = await fs.readdir(orgsDir);
    expect(files).toHaveLength(1);
  });

  test('tier 3 — seeded record carries no invented address or contact details', async () => {
    const m = await manager({ 'ngdpbase.application.base-url': 'https://demo.example.com' });
    const org = await m.getInstallOrg();

    expect(org!.address).toBeUndefined();
    expect(org!.contactPoint).toBeUndefined();
  });

  test('several records and no key — resolves to nothing rather than guessing', async () => {
    // Picking one arbitrarily could bind every role to the wrong organization,
    // and seeding another would add to the ambiguity being reported.
    await writeOrg('one.json', 'https://one.example/', 'One');
    await writeOrg('two.json', 'https://two.example/', 'Two');

    const m = await manager({ 'ngdpbase.application.base-url': 'https://one.example' });
    const org = await m.getInstallOrg();

    expect(org).toBeNull();
    expect(await fs.readdir(orgsDir)).toHaveLength(2);
  });

  test('no base-url — declines to seed rather than inventing an identity', async () => {
    const m = await manager({});
    const org = await m.getInstallOrg();

    expect(org).toBeNull();
    expect(await fs.pathExists(orgsDir) ? await fs.readdir(orgsDir) : []).toHaveLength(0);
  });

  test('resolution is cached — a second call does not seed again', async () => {
    const m = await manager({ 'ngdpbase.application.base-url': 'https://demo.example.com' });

    await m.getInstallOrg();
    await m.getInstallOrg();

    expect(await fs.readdir(orgsDir)).toHaveLength(1);
  });
});
