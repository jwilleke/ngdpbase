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
import type { AddonDatabaseDeclaration } from '../../utils/addonDatabaseRules';

/** #1860: the databases the add-ons of these tests declare; each test may replace them. */
const declared = (owner: string, ledgerTable: string, extra: Partial<AddonDatabaseDeclaration> = {}): AddonDatabaseDeclaration =>
  ({ owner, ledgerTable, encrypt: 'optional', declaredBy: owner, enabled: true, ...extra });
const DEFAULT_DECLARATIONS: AddonDatabaseDeclaration[] = [
  declared('accounting', 'accounting_schema_migrations'),
  declared('accounting', 'accounting_dues_schema_migrations', { declaredBy: 'accounting-dues' }),
  declared('i18n', 'i18n_schema_migrations'),
  declared('ngdpbase', 'ngdpbase_schema_migrations')
];

describe('DatabaseManager (#1536)', () => {
  let dir: string;
  const savedKey = process.env[DATABASE_KEY_ENV];

  const started = async (props: Record<string, unknown>, declarations: AddonDatabaseDeclaration[] = DEFAULT_DECLARATIONS): Promise<DatabaseManager> => {
    const configManager = {
      getProperty: (key: string, def: unknown) => (key in props ? props[key] : def),
      getResolvedDataPath: (_key: string, def: string) => (props['ngdpbase.database.file'] as string | undefined) ?? def,
      getAddonDatabaseDeclarations: () => declarations
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
    const withDatabase = (declarations?: AddonDatabaseDeclaration[]): Promise<DatabaseManager> => {
      process.env[DATABASE_KEY_ENV] = 'test-key-not-a-secret';
      return started({ 'ngdpbase.database.provider': 'sqlite', 'ngdpbase.database.file': path.join(dir, 'ngdpbase.db') }, declarations);
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
    describe('declared databases only (#1860)', () => {
      const withoutKey = (declarations: AddonDatabaseDeclaration[]): Promise<DatabaseManager> =>
        started({ 'ngdpbase.database.provider': 'sqlite', 'ngdpbase.database.file': path.join(dir, 'ngdpbase.db') }, declarations);

      test('an owner no add-on declares is refused, and no file is made', async () => {
        const manager = await withDatabase([declared('accounting', 'accounting_schema_migrations')]);
        expect(() => manager.openAddonDatabase('payroll', { migrations: [], ledgerTable: 'payroll_schema_migrations' })).toThrow(/No add-on declares database 'payroll'/);
        expect(fs.existsSync(path.join(dir, 'payroll.db'))).toBe(false);
        await manager.shutdown();
      });

      test('a declared owner with a ledger nobody declares is refused', async () => {
        const manager = await withDatabase([declared('accounting', 'accounting_schema_migrations')]);
        expect(() => manager.openAddonDatabase('accounting', { migrations: [DUES], ledgerTable: 'accounting_dues_schema_migrations' })).toThrow(/not with ledger 'accounting_dues_schema_migrations'/);
        await manager.shutdown();
      });

      test('a declaration whose add-on is off is known but not opened', async () => {
        const manager = await withDatabase([declared('accounting', 'accounting_schema_migrations', { enabled: false })]);
        expect(() => manager.openAddonDatabase('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' })).toThrow(/turned off or not loaded/);
        expect(fs.existsSync(path.join(dir, 'accounting.db'))).toBe(false);
        expect(manager.getDeclaredDatabases()).toEqual([
          expect.objectContaining({ owner: 'accounting', enabled: false, open: false, file: path.join(dir, 'accounting.db') })
        ]);
        await manager.shutdown();
      });

      test('"required" with no key is refused, and nothing is written in the clear', async () => {
        const manager = await withoutKey([declared('phr', 'phr_schema_migrations', { encrypt: 'required' })]);
        expect(() => manager.openAddonDatabase('phr', { migrations: [], ledgerTable: 'phr_schema_migrations' })).toThrow(/encrypt "required", but NGDPBASE_DATABASE_KEY is not set/);
        expect(fs.existsSync(path.join(dir, 'phr.db'))).toBe(false);
        expect(manager.addonRefusal('phr')).toMatch(/NGDPBASE_DATABASE_KEY is not set/);
        await manager.shutdown();
      });

      test('a dependent ledger declared "required" is refused even after its owner opened unencrypted', async () => {
        const manager = await withoutKey([
          declared('accounting', 'accounting_schema_migrations'),
          declared('accounting', 'accounting_dues_schema_migrations', { declaredBy: 'accounting-dues', encrypt: 'required' })
        ]);
        manager.openAddonDatabase('accounting', { migrations: [LEDGER], ledgerTable: 'accounting_schema_migrations' });
        expect(() => manager.openAddonDatabase('accounting', { migrations: [DUES], ledgerTable: 'accounting_dues_schema_migrations' })).toThrow(/accounting-dues.*NGDPBASE_DATABASE_KEY is not set/);
        expect(manager.addonRefusal('accounting')).toBeNull();
        expect(manager.addonRefusal('accounting-dues')).toMatch(/NGDPBASE_DATABASE_KEY/);
        await manager.shutdown();
      });

      test('"required" with the key opens encrypted', async () => {
        const keyed = await withDatabase([declared('phr', 'phr_schema_migrations', { encrypt: 'required' })]);
        expect(keyed.addonRefusal('phr')).toBeNull();
        keyed.openAddonDatabase('phr', { migrations: [], ledgerTable: 'phr_schema_migrations' });
        expect(fs.readFileSync(path.join(dir, 'phr.db')).subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3');
        expect(keyed.getDeclaredDatabases()).toEqual([expect.objectContaining({ owner: 'phr', open: true, encrypt: 'required' })]);
        await keyed.shutdown();
      });

      test('"optional" without a key opens in the clear', async () => {
        const plain = await withoutKey([declared('notes', 'notes_schema_migrations', { encrypt: 'optional' })]);
        expect(plain.addonRefusal('notes')).toBeNull();
        plain.openAddonDatabase('notes', { migrations: [], ledgerTable: 'notes_schema_migrations' });
        expect(fs.readFileSync(path.join(dir, 'notes.db')).subarray(0, 15).toString('latin1')).toBe('SQLite format 3');
        await plain.shutdown();
      });

      test('with no application database the declarations are still listed, with no file', async () => {
        const manager = await started({ 'ngdpbase.database.file': path.join(dir, 'ngdpbase.db') }, [declared('phr', 'phr_schema_migrations', { encrypt: 'required' })]);
        expect(manager.getDeclaredDatabases()).toEqual([expect.objectContaining({ owner: 'phr', file: null, open: false })]);
      });
    });
  });
});
