import fs from 'fs-extra';
import os from 'os';
import path from 'path';

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import ConfigurationManager from '../ConfigurationManager';
import logger from '../../utils/logger';

/** #2246: legacy ngdpbase.stores.<kind>.owner|encrypt keys are warned about and shown as needs-attention. */
describe('ConfigurationManager: legacy store keys (#2246)', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  const categories = {
    general: { label: 'general', encrypt: false, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/default/' } },
    capture: { label: 'capture', encrypt: false, storageLocation: { defaultstore: 'pages/', privatestore: 'pages/vaults/{user}/capture/' } }
  };

  async function boot(custom: Record<string, unknown>): Promise<ConfigurationManager> {
    await fs.ensureDir(path.join(tempDir, 'data', 'config'));
    await fs.writeJson(path.join(tempDir, 'data', 'config', 'app-custom-config.json'), custom);
    const cm = new ConfigurationManager({ getManager: vi.fn() });
    await cm.initialize();
    return cm;
  }

  const legacyWarnings = (): string[] =>
    (logger.warn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0])).filter((m) => m.includes('ngdpbase.stores.'));

  beforeEach(async () => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-store-keys-'));
    await fs.ensureDir(path.join(tempDir, 'config'));
    await fs.writeJson(path.join(tempDir, 'config', 'app-default-config.json'), {
      'ngdpbase.application-name': 'TestWiki',
      'ngdpbase.system-category': categories
    });
    originalCwd = process.cwd();
    process.chdir(tempDir);
    delete process.env.INSTANCE_DATA_FOLDER;
    delete process.env.FAST_STORAGE;
    delete process.env.SLOW_STORAGE;
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    process.env = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('with no legacy keys: no warning, and the manager is ready', async () => {
    const cm = await boot({ 'ngdpbase.application-name': 'Mine' });
    expect(legacyWarnings()).toEqual([]);
    expect(cm.getManagerStatus().state).toBe('ready');
  });

  it('warns once per key and marks ConfigurationManager as needing attention', async () => {
    const cm = await boot({
      'ngdpbase.stores.default.encrypt': true,
      'ngdpbase.stores.default.owner': 'admin',
      'ngdpbase.stores.capture.encrypt': true
    });
    const warnings = legacyWarnings();
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain('ngdpbase.system-category.general.encrypt');
    expect(warnings[1]).toContain("'owner' of 'ngdpbase.system-category.general'");
    expect(warnings[2]).toContain('ngdpbase.system-category.capture.encrypt');

    const status = cm.getManagerStatus();
    expect(status.state).toBe('degraded');
    expect(status.kind).toBe('attention');
    expect(status.reason).toContain('3 removed vault settings');
    expect(status.reason).toContain('ngdpbase.stores.default.encrypt');
    expect(status.reason).toContain('ngdpbase.stores.capture.encrypt');
  });

  it('changes nothing: the keys stay in the file and no value is carried over', async () => {
    const cm = await boot({ 'ngdpbase.stores.default.encrypt': true });
    const onDisk = await fs.readJson(path.join(tempDir, 'data', 'config', 'app-custom-config.json'));
    expect(onDisk).toEqual({ 'ngdpbase.stores.default.encrypt': true });
    const sc = cm.getProperty('ngdpbase.system-category') as Record<string, { encrypt?: boolean }>;
    expect(sc.general?.encrypt).toBe(false);
  });
});
