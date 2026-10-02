/**
 * #1536 — DatabaseManager: off by default, opens SQLite when configured,
 * refuses an unknown provider, and is the only door to the handle.
 */
vi.unmock('../../providers/SqliteDatabaseProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import DatabaseManager, { DATABASE_KEY_ENV } from '../DatabaseManager';

describe('DatabaseManager (#1536)', () => {
  let dir: string;
  const savedKey = process.env[DATABASE_KEY_ENV];

  const started = async (props: Record<string, unknown>): Promise<DatabaseManager> => {
    const configManager = {
      getProperty: (key: string, def: unknown) => (key in props ? props[key] : def),
      getResolvedDataPath: (_key: string, def: string) => (props['ngdpbase.database.file'] as string | undefined) ?? def
    };
    const manager = new DatabaseManager({ getManager: (n: string) => (n === 'ConfigurationManager' ? configManager : null) } as never);
    await manager.initialize();
    return manager;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1536-mgr-'));
    delete process.env[DATABASE_KEY_ENV];
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env[DATABASE_KEY_ENV]; else process.env[DATABASE_KEY_ENV] = savedKey;
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('off by default: no file is opened, and asking for the handle names the key to set', async () => {
    const manager = await started({ 'ngdpbase.database.file': path.join(dir, 'app.db') });
    expect(manager.isEnabled()).toBe(false);
    expect(fs.existsSync(path.join(dir, 'app.db'))).toBe(false);
    expect(() => manager.getHandle()).toThrow(/ngdpbase\.database\.provider/);
    expect(manager.integrityOk()).toBe(true);
  });

  test('sqlite with a key opens an encrypted database and hands out the connection', async () => {
    process.env[DATABASE_KEY_ENV] = 'test-key-not-a-secret';
    const file = path.join(dir, 'app.db');
    const manager = await started({ 'ngdpbase.database.provider': 'sqlite', 'ngdpbase.database.file': file });
    expect(manager.isEnabled()).toBe(true);
    const db = manager.getHandle<{ prepare(sql: string): { get(): unknown } }>();
    expect(db.prepare('SELECT 1 AS one').get()).toEqual({ one: 1 });
    expect(fs.readFileSync(file).subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3');
    await manager.shutdown();
    expect(manager.isEnabled()).toBe(false);
  });

  test('an unknown provider refuses to start, naming the choices', async () => {
    await expect(started({ 'ngdpbase.database.provider': 'postgres' })).rejects.toThrow(/'sqlite' or 'none'/);
  });
});
