/**
 * FileBackupProvider tests (#170)
 */
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import FileBackupProvider from '../FileBackupProvider';
import BaseBackupProvider from '../BaseBackupProvider';
import type { WikiEngine } from '../../types/WikiEngine';

let tmpDir: string;

const mockConfigManager = {
  getResolvedDataPath: vi.fn((_key: string, _default: string) => tmpDir)
};
const mockEngine = {
  getManager: vi.fn((name: string) =>
    name === 'ConfigurationManager' ? mockConfigManager : null)
};

describe('FileBackupProvider (#170)', () => {
  let provider: FileBackupProvider;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fbp-test-'));
    vi.clearAllMocks();
    mockConfigManager.getResolvedDataPath.mockImplementation(() => tmpDir);
    provider = new FileBackupProvider(mockEngine);
    await provider.initialize();
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('is a BaseBackupProvider and reports identity', () => {
    expect(provider).toBeInstanceOf(BaseBackupProvider);
    expect(provider.getProviderInfo().name).toBe('FileBackupProvider');
  });

  test('throws if ConfigurationManager is missing', async () => {
    const p = new FileBackupProvider(
      { getManager: () => null }
    );
    await expect(p.initialize()).rejects.toThrow('requires ConfigurationManager');
  });

  test('initialize resolves + ensures the backup directory', async () => {
    expect(provider.getBackupDirectory()).toBe(tmpDir);
    expect(await fs.pathExists(tmpDir)).toBe(true);
  });

  test('write returns full path and round-trips via read', async () => {
    const full = await provider.writeBackup('a.json.gz', Buffer.from('payload'));
    expect(full).toBe(path.join(tmpDir, 'a.json.gz'));
    expect((await provider.readBackup('a.json.gz')).toString()).toBe('payload');
    // absolute path also works
    expect((await provider.readBackup(full)).toString()).toBe('payload');
  });

  test('backupExists by bare name and absolute path', async () => {
    await provider.writeBackup('b.json.gz', 'x');
    expect(await provider.backupExists('b.json.gz')).toBe(true);
    expect(await provider.backupExists(path.join(tmpDir, 'b.json.gz'))).toBe(true);
    expect(await provider.backupExists('missing.json.gz')).toBe(false);
  });

  test('listBackupObjects returns every object with metadata', async () => {
    await provider.writeBackup('one.json.gz', '1');
    await provider.writeBackup('two.txt', '22');
    const list = await provider.listBackupObjects();
    expect(list.map(o => o.filename).sort()).toEqual(['one.json.gz', 'two.txt']);
    const one = list.find(o => o.filename === 'one.json.gz')!;
    expect(one.path).toBe(path.join(tmpDir, 'one.json.gz'));
    expect(one.size).toBeGreaterThan(0);
    expect(one.created).toBeInstanceOf(Date);
  });

  test('removeBackup deletes by path', async () => {
    const full = await provider.writeBackup('gone.json.gz', 'z');
    await provider.removeBackup(full);
    expect(await provider.backupExists('gone.json.gz')).toBe(false);
  });

  test('setBackupDirectory re-points and ensures the new dir', async () => {
    const newDir = path.join(tmpDir, 'nested', 'b');
    await provider.setBackupDirectory(newDir);
    expect(provider.getBackupDirectory()).toBe(newDir);
    expect(await fs.pathExists(newDir)).toBe(true);
  });

  test('isHealthy resolves true', async () => {
    expect(await provider.isHealthy()).toBe(true);
  });
});
