/**
 * #1536 — DatabaseManager: off by default, opens SQLite when configured,
 * refuses an unknown provider, and is the only door to the handle.
 */
vi.unmock('../../providers/SqliteDatabaseProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import DatabaseManager, { DATABASE_KEY_ENV } from '../DatabaseManager';
import type { Migration } from '../../providers/sqliteMigrations';

describe('DatabaseManager (#1536)', () => {
  let dir: string;
  const savedKey = process.env[DATABASE_KEY_ENV];

  const started = async (props: Record<string, unknown>): Promise<DatabaseManager> => {
    const configManager = {
      getProperty: (key: string, def: unknown) => (key in props ? props[key] : def),
      getResolvedDataPath: (_key: string, def: string) => (props['ngdpbase.database.file'] as string | undefined) ?? def
    };
    const manager = new DatabaseManager({ getManager: (n: string) => (n === 'ConfigurationManager' ? configManager : null) });
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

  test('ngdpbase.database.busy-timeout-ms reaches the application database and every add-on database (#1710)', async () => {
    process.env[DATABASE_KEY_ENV] = 'test-key-not-a-secret';
    const manager = await started({ 'ngdpbase.database.provider': 'sqlite', 'ngdpbase.database.file': path.join(dir, 'ngdpbase.db'), 'ngdpbase.database.busy-timeout-ms': 2500 });
    type P = { pragma(sql: string, o: { simple: true }): unknown };
    expect(manager.getHandle<P>().pragma('busy_timeout', { simple: true })).toBe(2500);
    const addon = manager.openAddonDatabase<P>('accounting', { migrations: [], ledgerTable: 'accounting_schema_migrations' });
    expect(addon.pragma('busy_timeout', { simple: true })).toBe(2500);
    await manager.shutdown();
  });

  test('a busy-timeout that is not a whole number of milliseconds refuses to start, naming the key (#1710)', async () => {
    for (const bad of [-1, 1.5, '5000', null]) {
      await expect(started({ 'ngdpbase.database.provider': 'sqlite', 'ngdpbase.database.file': path.join(dir, 'ngdpbase.db'), 'ngdpbase.database.busy-timeout-ms': bad })).rejects.toThrow(/busy-timeout-ms/);
    }
  });

  test('an unknown provider refuses to start, naming the choices', async () => {
    await expect(started({ 'ngdpbase.database.provider': 'postgres' })).rejects.toThrow(/'sqlite' or 'none'/);
  });
  describe('add-on databases (ngdp-accounting-addons#13)', () => {
    type Db = { prepare(sql: string): { get(): unknown; all(): unknown[]; run(...a: unknown[]): unknown }; open: boolean };
    const LEDGER: Migration = { id: '20261007090000', description: 'ledger table', up: (db) => db.exec('CREATE TABLE accounting_transactions (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)') };
    const DUES: Migration = { id: '20261007100000', description: 'dues tiers', up: (db) => db.exec('CREATE TABLE accounting_dues_tiers (id INTEGER PRIMARY KEY)') };
    const withDatabase = (): Promise<DatabaseManager> => {
      process.env[DATABASE_KEY_ENV] = 'test-key-not-a-secret';
      return started({ 'ngdpbase.database.provider': 'sqlite', 'ngdpbase.database.file': path.join(dir, 'ngdpbase.db') });
    };

    test('refused when the operator has not turned the database on, naming the key', async () => {
      const manager = await started({ 'ngdpbase.database.file': path.join(dir, 'ngdpbase.db') });
      expect(() => manager.openAddonDatabase('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' })).toThrow(/ngdpbase\.database\.provider/);
      expect(fs.existsSync(path.join(dir, 'accounting.db'))).toBe(false);
    });

    test('opens <owner>.db beside the application database, encrypted, with the add-on ledger applied', async () => {
      const manager = await withDatabase();
      const db = manager.openAddonDatabase<Db>('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' });
      db.prepare('INSERT INTO accounting_transactions (amount) VALUES (?)').run(1234);
      expect(db.prepare('SELECT amount FROM accounting_transactions').get()).toEqual({ amount: 1234 });
      const file = path.join(dir, 'accounting.db');
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.readFileSync(file).subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3');
      // The application database is untouched: the add-on's table is not in it.
      const core = manager.getHandle<Db>();
      expect(core.prepare("SELECT name FROM sqlite_master WHERE name = 'accounting_transactions'").get()).toBeUndefined();
      expect(manager.integrityOk()).toBe(true);
      await manager.shutdown();
    });

    test('a dependent add-on adds its own ledger to the owner\'s file and gets the same connection', async () => {
      const manager = await withDatabase();
      const owner = manager.openAddonDatabase<Db>('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' });
      const module = manager.openAddonDatabase<Db>('accounting', { migrations: [DUES], ledgerTable: 'accounting_dues_schema_migrations' });
      expect(module).toBe(owner);
      const ledgers = (owner.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%schema_migrations' ORDER BY name").all() as { name: string }[]).map(r => r.name);
      expect(ledgers).toEqual(['accounting_dues_schema_migrations', 'accounting_schema_migrations']);
      await manager.shutdown();
    });

    test('an owner whose slug carries digits gets its database (ledger names allow digits)', async () => {
      const manager = await withDatabase();
      const LOG: Migration = { id: '20261007110000', description: 'i18n strings', up: (db) => db.exec('CREATE TABLE i18n_strings (id INTEGER PRIMARY KEY)') };
      const db = manager.openAddonDatabase<Db>('i18n', { migrations: [LOG], ledgerTable: 'i18n_schema_migrations' });
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'i18n_strings'").get()).toEqual({ name: 'i18n_strings' });
      expect(fs.existsSync(path.join(dir, 'i18n.db'))).toBe(true);
      await manager.shutdown();
    });

    test('the same ledger cannot be registered twice', async () => {
      const manager = await withDatabase();
      manager.openAddonDatabase('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' });
      expect(() => manager.openAddonDatabase('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' })).toThrow(/already registered/);
      await manager.shutdown();
    });

    test('refuses a non-slug owner, a ledger table outside the owner\'s prefix, and the application database\'s own file', async () => {
      const manager = await withDatabase();
      expect(() => manager.openAddonDatabase('../evil', { migrations: [], ledgerTable: 'evil_schema_migrations' })).toThrow(/not an add-on slug/);
      expect(() => manager.openAddonDatabase('accounting', { migrations: [], ledgerTable: 'schema_migrations' })).toThrow(/must start with 'accounting_'/);
      expect(() => manager.openAddonDatabase('accounting-dues', { migrations: [], ledgerTable: 'accounting_schema_migrations' })).toThrow(/must start with 'accounting_dues_'/);
      expect(() => manager.openAddonDatabase('ngdpbase', { migrations: [], ledgerTable: 'ngdpbase_schema_migrations' })).toThrow(/application database itself/);
      await manager.shutdown();
    });

    test('shutdown closes the add-on databases as well as the application database', async () => {
      const manager = await withDatabase();
      const db = manager.openAddonDatabase<Db>('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' });
      await manager.shutdown();
      expect(db.open).toBe(false);
      expect(manager.isEnabled()).toBe(false);
    });
  });
});
