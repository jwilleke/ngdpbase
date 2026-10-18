/**
 * #1860 — an add-on declares its database in its own config/default-config.json
 * (`ngdpbase.addons.<slug>.database`), core knows it whether or not the add-on
 * is on, and an invalid declaration stops the add-on loading, as a refused
 * system-category does (#1559).
 *
 * Sabotage: drop the turned-off add-ons from addonDatabaseLayer and "a
 * turned-off add-on's database stays known" goes red; drop
 * addonDatabaseProblems from the layer and every "refused" test goes red; drop
 * DatabaseManager.addonRefusal from AddonsManager's check and "never imported
 * when its required database has no key" goes red.
 */
vi.unmock('../../managers/AddonsManager');

import fs from 'fs';
import os from 'os';
import path from 'path';
import { mergeConfigWithAddons } from '../addonConfigLayer';
import { DATABASE_KEY_ENV } from '../../managers/DatabaseManager';

let root: string;
const savedKey = process.env[DATABASE_KEY_ENV];

function addon(slug: string, defaults: unknown, index?: string): void {
  const dir = path.join(root, 'addons', slug);
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: slug, ngdpbase: { slug } }));
  fs.writeFileSync(path.join(dir, 'config', 'default-config.json'), JSON.stringify(defaults));
  if (index !== undefined) fs.writeFileSync(path.join(dir, 'index.js'), index);
}

const shipped = { 'ngdpbase.managers.addons-manager.addons-path': './addons' };
const on = (...slugs: string[]): Record<string, unknown> => Object.fromEntries(slugs.map((s) => [`ngdpbase.addons.${s}.enabled`, true]));
const PHR_DB = { owner: 'phr', ledgerTable: 'phr_schema_migrations', encrypt: 'required' };
const phr = (database: unknown = PHR_DB): Record<string, unknown> => ({ 'ngdpbase.addons.phr.colour': 'red', 'ngdpbase.addons.phr.database': database });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'addon-database-'));
  delete process.env[DATABASE_KEY_ENV];
});
afterEach(() => {
  if (savedKey === undefined) delete process.env[DATABASE_KEY_ENV]; else process.env[DATABASE_KEY_ENV] = savedKey;
  // Only this test's temp directory — never a live data tree.
  fs.rmSync(root, { recursive: true, force: true });
});

describe('#1860 an add-on declares its database', () => {
  test('an enabled add-on\'s declaration is known, and is not a configuration key', () => {
    addon('phr', phr());
    const { merged, databases, refused, problems } = mergeConfigWithAddons(shipped, on('phr'), root);
    expect(problems).toEqual([]);
    expect(refused.size).toBe(0);
    expect(databases).toEqual([{ ...PHR_DB, declaredBy: 'phr', enabled: true }]);
    expect(merged['ngdpbase.addons.phr.colour']).toBe('red');
    expect(merged['ngdpbase.addons.phr.database']).toBeUndefined();
  });

  test('a turned-off add-on\'s database stays known (for the backup, #1723)', () => {
    addon('phr', phr());
    const { merged, databases } = mergeConfigWithAddons(shipped, {}, root);
    expect(databases).toEqual([{ ...PHR_DB, declaredBy: 'phr', enabled: false }]);
    expect(merged['ngdpbase.addons.phr.colour']).toBeUndefined();
  });

  test('a dependent add-on declares its own ledger in the owner\'s database', () => {
    addon('accounting', { 'ngdpbase.addons.accounting.database': { owner: 'accounting', ledgerTable: 'accounting_schema_migrations', encrypt: 'optional' } });
    addon('accounting-dues', { 'ngdpbase.addons.accounting-dues.database': { owner: 'accounting', ledgerTable: 'accounting_dues_schema_migrations', encrypt: 'optional' } });
    const { databases, refused } = mergeConfigWithAddons(shipped, on('accounting', 'accounting-dues'), root);
    expect(refused.size).toBe(0);
    expect(databases.map((d) => [d.declaredBy, d.owner, d.ledgerTable])).toEqual([
      ['accounting', 'accounting', 'accounting_schema_migrations'],
      ['accounting-dues', 'accounting', 'accounting_dues_schema_migrations']
    ]);
  });

  test('the site\'s file cannot change a declaration, and is told so', () => {
    addon('phr', phr());
    const { databases, problems } = mergeConfigWithAddons(shipped, { ...on('phr'), 'ngdpbase.addons.phr.database': { ...PHR_DB, encrypt: 'optional' } }, root);
    expect(databases[0].encrypt).toBe('required');
    expect(problems).toEqual([expect.stringMatching(/sets ngdpbase\.addons\.phr\.database.*the site's value is ignored/)]);
  });
});

describe('#1860 an invalid declaration stops the add-on loading', () => {
  const refusedFor = (database: unknown): { reason: string | undefined; merged: Record<string, unknown>; databases: unknown[]; addons: string[] } => {
    addon('phr', phr(database));
    const { refused, merged, databases, addons } = mergeConfigWithAddons(shipped, on('phr'), root);
    return { reason: refused.get('phr'), merged, databases, addons: addons.map((a) => a.slug) };
  };

  test.each([
    ['encrypt that is neither "required" nor "optional"', { ...PHR_DB, encrypt: true }, /encrypt must be "required" or "optional", got true/],
    ['no ledger table', { owner: 'phr', encrypt: 'required' }, /ledgerTable must be a table name/],
    ['a ledger outside the owner\'s prefix', { ...PHR_DB, ledgerTable: 'schema_migrations' }, /must start with 'phr_'/],
    ['an owner that is not a slug', { ...PHR_DB, owner: '../phr' }, /owner must be an add-on slug/],
    ['a misspelt field', { owner: 'phr', ledgerTable: 'phr_schema_migrations', encrpyt: 'required' }, /encrypt must be.*'encrpyt' is not a field/],
    ['a value that is not an object', 'phr', /must be an object/]
  ])('%s', (_name, database, why) => {
    const { reason, merged, databases, addons } = refusedFor(database);
    expect(reason).toMatch(/its database declaration was refused/);
    expect(reason).toMatch(why);
    expect(merged['ngdpbase.addons.phr.colour']).toBeUndefined();
    expect(databases).toEqual([]);
    expect(addons).not.toContain('phr');
  });

  test('an add-on that declares under another add-on\'s slug is refused', () => {
    addon('phr', { 'ngdpbase.addons.billing.database': { owner: 'billing', ledgerTable: 'billing_schema_migrations', encrypt: 'optional' } });
    const { refused, databases } = mergeConfigWithAddons(shipped, on('phr'), root);
    expect(refused.get('phr')).toMatch(/declares ngdpbase\.addons\.billing\.database; an add-on declares only its own, ngdpbase\.addons\.phr\.database/);
    expect(databases).toEqual([]);
  });

  test('a second declaration of one owner\'s ledger is refused; the first stands', () => {
    addon('accounting', { 'ngdpbase.addons.accounting.database': { owner: 'accounting', ledgerTable: 'accounting_schema_migrations', encrypt: 'optional' } });
    addon('accounting-copy', { 'ngdpbase.addons.accounting-copy.database': { owner: 'accounting', ledgerTable: 'accounting_schema_migrations', encrypt: 'optional' } });
    const { refused, databases } = mergeConfigWithAddons(shipped, on('accounting', 'accounting-copy'), root);
    expect(refused.get('accounting-copy')).toMatch(/add-on 'accounting' already declares ledger 'accounting_schema_migrations'/);
    expect(refused.has('accounting')).toBe(false);
    expect(databases.map((d) => d.declaredBy)).toEqual(['accounting']);
  });
});

describe('#1860 AddonsManager never imports a refused add-on, and its status says why', () => {
  const THROWS = "throw new Error('a refused add-on was imported');\n";

  async function statusOf(slug: string, databases: { addonRefusal(slug: string): string | null } | null, refused: Map<string, string>): Promise<{ enabled: boolean; loaded: boolean; error?: string | null } | undefined> {
    const cm = {
      getProperty: (key: string, def: unknown) => {
        if (key === 'ngdpbase.managers.addons-manager.enabled') return true;
        if (key === 'ngdpbase.managers.addons-manager.addons-path') return path.join(root, 'addons');
        if (key === 'ngdpbase.page.provider.filesystem.storagedir') return path.join(root, 'pages');
        if (key === 'ngdpbase.addons') return {};
        if (key === `ngdpbase.addons.${slug}.enabled`) return true;
        return def;
      },
      getAllProperties: () => ({}),
      getResolvedDataPath: () => path.join(root, 'pages'),
      getCustomProperty: () => null,
      setRuntimeProperty: () => undefined,
      getAddonRefusal: (s: string) => refused.get(s) ?? null
    };
    const mod = await import('../../managers/AddonsManager');
    const AddonsManager = (mod.default ?? mod) as unknown as new (engine: unknown) => {
      initialize(): Promise<void>;
      getStatus(): Promise<Array<{ name: string; enabled: boolean; loaded: boolean; error?: string | null }>>;
    };
    const manager = new AddonsManager({ getManager: (n: string) => (n === 'ConfigurationManager' ? cm : n === 'DatabaseManager' ? databases : null) });
    await manager.initialize();
    return (await manager.getStatus()).find((s) => s.name === slug);
  }

  test('an invalid declaration', async () => {
    addon('phr', phr({ ...PHR_DB, encrypt: 'yes' }), THROWS);
    const { refused } = mergeConfigWithAddons(shipped, on('phr'), root);
    const status = await statusOf('phr', null, refused);
    expect(status).toMatchObject({ enabled: true, loaded: false });
    expect(status?.error).toMatch(/database declaration was refused.*encrypt must be "required" or "optional"/);
  });

  test('a "required" database with no key', async () => {
    addon('phr', phr(), THROWS);
    const { default: DatabaseManager } = await import('../../managers/DatabaseManager');
    const { databases, refused } = mergeConfigWithAddons(shipped, on('phr'), root);
    const databaseManager = new DatabaseManager({ getManager: () => ({ getAddonDatabaseDeclarations: () => databases }) });
    const status = await statusOf('phr', databaseManager, refused);
    expect(status).toMatchObject({ enabled: true, loaded: false });
    expect(status?.error).toMatch(/encrypt "required", but NGDPBASE_DATABASE_KEY is not set/);
  });

  test('a "required" database with the key loads', async () => {
    process.env[DATABASE_KEY_ENV] = 'test-key-not-a-secret';
    addon('phr', phr(), "export default { name: 'phr', register: async () => {} };\n");
    const { default: DatabaseManager } = await import('../../managers/DatabaseManager');
    const { databases, refused } = mergeConfigWithAddons(shipped, on('phr'), root);
    const databaseManager = new DatabaseManager({ getManager: () => ({ getAddonDatabaseDeclarations: () => databases }) });
    const status = await statusOf('phr', databaseManager, refused);
    expect(status?.error ?? null).toBeNull();
  });
});
