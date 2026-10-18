/**
 * #1883 (operator, 2026-10-18): one rule for an enabled add-on that does not
 * load, whatever the reason.
 *
 * - Every one sends admins a notification at the most severe level, naming the
 *   add-on and the reason.
 * - A site-critical one (`ngdpbase.addons.<slug>.site-critical: true`) also
 *   holds the whole site in maintenance mode through engine.blockConfiguration
 *   (#1152), with a public message that carries no details.
 *
 * Real add-on folders on disk, the real configuration merge, the real Engine
 * blocking list, the real DatabaseManager on a temporary SQLite file; only the
 * ConfigurationManager and NotificationManager are stand-ins.
 *
 * Sabotage (each done once, each turned these red): drop recordLoadFailure from
 * refuseAddon → every refused/import/no-register case; drop it from loadAddon's
 * catch → register-throws, migration and corrupt-database cases; drop the
 * blockConfiguration call → every "site-critical" case; drop the public
 * message from it → "visitors see none of the details"; read the add-on's value
 * before the site's in addonSiteCriticalLayer → the site-override tests; accept
 * a non-boolean in addonSiteCriticalLayer → the invalid-value tests; drop the
 * prefix filter in notifySystemCategoryProblems → "declared once".
 */
vi.unmock('../../providers/SqliteDatabaseProvider');

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Engine from '../../core/Engine';
import DatabaseManager, { DATABASE_KEY_ENV } from '../DatabaseManager';
import { mergeConfigWithAddons } from '../../utils/addonConfigLayer';
import { blockedForVisitors, gateDecision } from '../../utils/startupState';

const PUBLIC_MESSAGE = "We're having temporary issues. Please try again later.";
const SLUG = 'phr';
const CRITICAL = `ngdpbase.addons.${SLUG}.site-critical`;
const PHR_DB = { owner: SLUG, ledgerTable: 'phr_schema_migrations', encrypt: 'required' };
const LOADS = `export default { name: '${SLUG}', register: async () => {} };\n`;

let root: string;
const savedKey = process.env[DATABASE_KEY_ENV];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'addon-site-critical-'));
  delete process.env[DATABASE_KEY_ENV];
});
afterEach(() => {
  if (savedKey === undefined) delete process.env[DATABASE_KEY_ENV]; else process.env[DATABASE_KEY_ENV] = savedKey;
  // Only this test's temp directory — never a live data tree.
  fs.rmSync(root, { recursive: true, force: true });
});

interface AddonFiles {
  defaults?: Record<string, unknown>;
  index?: string;
  pkg?: Record<string, unknown>;
}

function writeAddon(slug: string, { defaults = {}, index = LOADS, pkg = {} }: AddonFiles): void {
  const dir = path.join(root, 'addons', slug);
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: slug, version: '1.0.0', ngdpbase: { slug, ...pkg } }));
  fs.writeFileSync(path.join(dir, 'config', 'default-config.json'), JSON.stringify(defaults));
  fs.writeFileSync(path.join(dir, 'index.js'), index);
}

interface Booted {
  engine: Engine;
  notifications: Array<{ level: string; title: string; message: string }>;
  status: { enabled: boolean; loaded: boolean; error?: string | null } | undefined;
}

/** Boot the real AddonsManager against the real merge of these add-ons and this site file. */
async function boot(custom: Record<string, unknown>, options: { database?: boolean } = {}): Promise<Booted> {
  const shipped = {
    'ngdpbase.managers.addons-manager.enabled': true,
    'ngdpbase.managers.addons-manager.addons-path': './addons',
    'ngdpbase.managers.addons-manager.site-critical.public-message': PUBLIC_MESSAGE,
    'ngdpbase.version': '5.19.0'
  };
  const { merged, refused, databases, siteCritical, problems } = mergeConfigWithAddons(shipped, custom, root, path.join(root, 'data'));
  const props: Record<string, unknown> = {
    ...merged,
    'ngdpbase.managers.addons-manager.addons-path': path.join(root, 'addons'),
    'ngdpbase.database.provider': options.database ? 'sqlite' : 'none',
    'ngdpbase.database.file': path.join(root, 'ngdpbase.db')
  };
  const configManager = {
    getProperty: (key: string, def: unknown) => (key in props ? props[key] : def),
    getAllProperties: () => props,
    getResolvedDataPath: (key: string, def: string) => (key === 'ngdpbase.database.file' ? path.join(root, 'ngdpbase.db') : def),
    getCustomProperty: () => null,
    setRuntimeProperty: () => undefined,
    getAddonRefusal: (s: string) => refused.get(s) ?? null,
    isAddonSiteCritical: (s: string) => siteCritical.get(s) === true,
    getSystemCategoryProblems: () => problems,
    getAddonDatabaseDeclarations: () => databases,
    getAddonDeclaredDefaults: () => ({})
  };
  const notifications: Booted['notifications'] = [];
  const engine = new Engine();
  engine.registerManager('ConfigurationManager', configManager);
  engine.registerManager('NotificationManager', {
    createNotification: (n: Booted['notifications'][number]) => { notifications.push(n); return Promise.resolve('id'); }
  });
  const databaseManager = new DatabaseManager(engine as never);
  await databaseManager.initialize();
  engine.registerManager('DatabaseManager', databaseManager);
  const mod = await import('../AddonsManager');
  const AddonsManager = (mod.default ?? mod) as unknown as new (e: unknown) => {
    initialize(): Promise<void>;
    getStatus(): Promise<Array<{ name: string; enabled: boolean; loaded: boolean; error?: string | null }>>;
  };
  const manager = new AddonsManager(engine);
  await manager.initialize();
  const status = (await manager.getStatus()).find((s) => s.name === SLUG);
  await databaseManager.shutdown();
  return { engine, notifications, status };
}

/** A register() that opens its declared database with one migration. */
const opensDatabase = (up: string): string =>
  `export default { name: '${SLUG}', register: async (engine) => {\n` +
  `  engine.getManager('DatabaseManager').openAddonDatabase('${SLUG}', { ledgerTable: 'phr_schema_migrations', migrations: [\n` +
  `    { id: '20261018000000', description: 'first', up: (db) => { ${up} } }\n` +
  '  ] });\n} };\n';

interface FailureKind {
  name: string;
  /** The add-on's files, given its site-critical value (undefined: none declared). */
  files: (critical: boolean | undefined) => AddonFiles;
  /** Set up anything else the failure needs, before boot. */
  before?: () => void;
  database?: boolean;
  why: RegExp;
}

const withCritical = (critical: boolean | undefined, defaults: Record<string, unknown> = {}): Record<string, unknown> =>
  (critical === undefined ? defaults : { ...defaults, [CRITICAL]: critical });

const KINDS: FailureKind[] = [
  {
    name: 'a required-encryption database with no NGDPBASE_DATABASE_KEY',
    files: (c) => ({ defaults: withCritical(c, { 'ngdpbase.addons.phr.database': PHR_DB }), index: "throw new Error('imported without its key');\n" }),
    why: /encrypt "required", but NGDPBASE_DATABASE_KEY is not set.*Set NGDPBASE_DATABASE_KEY in the environment or the instance \.env \(<FAST_STORAGE>\/\.env\) and restart/
  },
  {
    name: 'a migration that fails when register() opens the database',
    files: (c) => ({ defaults: withCritical(c, { 'ngdpbase.addons.phr.database': { ...PHR_DB, encrypt: 'optional' } }), index: opensDatabase("db.exec('CREATE TABLE (');") }),
    database: true,
    why: /migration 20261018000000 \(first\) failed and was rolled back: .*syntax error/
  },
  {
    name: 'a database file that is not a database (open or integrity check fails)',
    files: (c) => ({ defaults: withCritical(c, { 'ngdpbase.addons.phr.database': { ...PHR_DB, encrypt: 'optional' } }), index: opensDatabase("db.exec('CREATE TABLE t (x)');") }),
    before: () => { fs.writeFileSync(path.join(root, `${SLUG}.db`), 'this is not a SQLite file, it is long enough to have a header '.repeat(80)); },
    database: true,
    why: /file is not a database|failed its integrity check/
  },
  {
    name: 'an invalid database declaration (#1860)',
    files: (c) => ({ defaults: withCritical(c, { 'ngdpbase.addons.phr.database': { ...PHR_DB, encrypt: 'yes' } }), index: "throw new Error('a refused add-on was imported');\n" }),
    why: /database declaration was refused.*encrypt must be "required" or "optional"/
  },
  {
    name: 'an invalid system-category declaration (#1559)',
    files: (c) => ({ defaults: withCritical(c, { 'ngdpbase.system-category': { phr: { label: 'phr', encrypt: 'true' } } }), index: "throw new Error('a refused add-on was imported');\n" }),
    why: /system-category declaration was refused.*encrypt must be true or false/
  },
  {
    name: 'an import that throws',
    files: (c) => ({ defaults: withCritical(c), index: "throw new Error('cannot find module ../../dist/src/new-thing.js');\n" }),
    why: /could not be imported: cannot find module/
  },
  {
    name: 'a module with no register()',
    files: (c) => ({ defaults: withCritical(c), index: `export default { name: '${SLUG}' };\n` }),
    why: /exports no register\(\) function/
  },
  {
    name: 'register() throwing',
    files: (c) => ({ defaults: withCritical(c), index: `export default { name: '${SLUG}', register: async () => { throw new Error('the vault is unreachable'); } };\n` }),
    why: /the vault is unreachable/
  },
  {
    name: 'a minVersion newer than this core (#1757)',
    files: (c) => ({ defaults: withCritical(c), pkg: { minVersion: '99.0.0' }, index: "throw new Error('imported on a core it does not support');\n" }),
    why: /needs ngdpbase 99\.0\.0 or later; this is 5\.19\.0/
  },
  {
    name: 'a dependency that is not installed (load order unresolvable)',
    files: (c) => ({ defaults: withCritical(c), index: `export default { name: '${SLUG}', dependencies: ['ledger'], register: async () => {} };\n` }),
    why: /load order could not be resolved: Add-on phr requires ledger but it's not installed/
  }
];

describe('#1883 a site-critical add-on that does not load puts the site in maintenance', () => {
  test.each(KINDS.map((k) => [k.name, k] as const))('%s', async (_name, kind) => {
    writeAddon(SLUG, kind.files(true));
    kind.before?.();
    const { engine, notifications, status } = await boot({ [`ngdpbase.addons.${SLUG}.enabled`]: true }, { database: kind.database });

    expect(status).toMatchObject({ enabled: true, loaded: false });
    expect(status?.error).toMatch(kind.why);
    const blocked = engine.getBlockingConditions();
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatch(/^Site-critical add-on 'phr' did not load: /);
    expect(blocked[0]).toMatch(kind.why);
    expect(engine.getPublicBlockingMessage()).toBe(PUBLIC_MESSAGE);

    const critical = notifications.filter((n) => n.level === 'error');
    expect(critical).toHaveLength(1);
    expect(critical[0].title).toBe('Critical: add-on phr did not load');
    expect(critical[0].message).toMatch(kind.why);
    expect(critical[0].message).toMatch(/site-critical .*whole site is in maintenance mode/);
  });
});

describe('#1883 any other add-on that does not load is switched off, the site stays up, admins are told', () => {
  test.each(KINDS.map((k) => [k.name, k] as const))('%s', async (_name, kind) => {
    writeAddon(SLUG, kind.files(undefined));
    kind.before?.();
    const { engine, notifications, status } = await boot({ [`ngdpbase.addons.${SLUG}.enabled`]: true }, { database: kind.database });

    expect(status).toMatchObject({ enabled: true, loaded: false });
    expect(engine.getBlockingConditions()).toEqual([]);
    expect(engine.getPublicBlockingMessage()).toBeNull();
    const critical = notifications.filter((n) => n.level === 'error');
    expect(critical).toHaveLength(1);
    expect(critical[0]).toMatchObject({ title: 'Critical: add-on phr did not load' });
    expect(critical[0].message).toMatch(kind.why);
    expect(critical[0].message).toMatch(/The site is running without it/);
  });

  test('a declaration refusal is reported once, as the load failure, not again as a declaration problem', async () => {
    writeAddon(SLUG, KINDS.find((k) => k.name.includes('#1860')).files(undefined));
    const { notifications } = await boot({ [`ngdpbase.addons.${SLUG}.enabled`]: true });
    expect(notifications.map((n) => n.title)).toEqual(['Critical: add-on phr did not load']);
  });

  test('a turned-off add-on that would fail is not reported: it was never meant to load', async () => {
    writeAddon(SLUG, { defaults: { [CRITICAL]: true }, index: "throw new Error('broken');\n" });
    const { engine, notifications } = await boot({});
    expect(engine.getBlockingConditions()).toEqual([]);
    expect(notifications.filter((n) => n.level === 'error')).toEqual([]);
  });

  test('an add-on that loads raises nothing, site-critical or not', async () => {
    writeAddon(SLUG, { defaults: { [CRITICAL]: true } });
    const { engine, notifications, status } = await boot({ [`ngdpbase.addons.${SLUG}.enabled`]: true });
    expect(status).toMatchObject({ loaded: true, error: null });
    expect(engine.getBlockingConditions()).toEqual([]);
    expect(notifications).toEqual([]);
  });

  test('an enabled site-critical add-on that was never found (its install failed) blocks too', async () => {
    const { engine, notifications } = await boot({ 'ngdpbase.addons.ledger.enabled': true, 'ngdpbase.addons.ledger.site-critical': true });
    expect(engine.getBlockingConditions()).toEqual([expect.stringMatching(/^Site-critical add-on 'ledger' did not load: it is enabled but was not found/)]);
    expect(notifications.map((n) => n.title)).toEqual(['Critical: add-on ledger did not load']);
  });
});

describe('#1883 the site-critical value', () => {
  test.each([['the string "true"', 'true'], ['a number', 1], ['null', null]])('%s refuses the add-on and counts as site-critical', async (_name, value) => {
    writeAddon(SLUG, { defaults: { [CRITICAL]: value }, index: "throw new Error('a refused add-on was imported');\n" });
    const { engine, notifications, status } = await boot({ [`ngdpbase.addons.${SLUG}.enabled`]: true });
    expect(status?.error).toMatch(/ngdpbase\.addons\.phr\.site-critical must be true or false, got .* in its config\/default-config\.json; it is treated as true/);
    expect(engine.getBlockingConditions()).toEqual([expect.stringMatching(/^Site-critical add-on 'phr' did not load: .*site-critical must be true or false/)]);
    expect(notifications.filter((n) => n.level === 'error')).toHaveLength(1);
  });

  test('an invalid value in the site\'s file refuses it the same way', async () => {
    writeAddon(SLUG, { defaults: { [CRITICAL]: false } });
    const { engine, status } = await boot({ [`ngdpbase.addons.${SLUG}.enabled`]: true, [CRITICAL]: 'yes' });
    expect(status?.error).toMatch(/got "yes" in app-custom-config\.json/);
    expect(engine.getBlockingConditions()).toHaveLength(1);
  });

  test('the site can make an add-on site-critical', async () => {
    writeAddon(SLUG, { index: `export default { name: '${SLUG}', register: async () => { throw new Error('down'); } };\n` });
    const { engine } = await boot({ [`ngdpbase.addons.${SLUG}.enabled`]: true, [CRITICAL]: true });
    expect(engine.getBlockingConditions()).toEqual([expect.stringMatching(/^Site-critical add-on 'phr' did not load: down/)]);
  });

  test('the site wins over the add-on: it can turn site-critical off', async () => {
    writeAddon(SLUG, { defaults: { [CRITICAL]: true }, index: `export default { name: '${SLUG}', register: async () => { throw new Error('down'); } };\n` });
    const { engine, notifications } = await boot({ [`ngdpbase.addons.${SLUG}.enabled`]: true, [CRITICAL]: false });
    expect(engine.getBlockingConditions()).toEqual([]);
    expect(notifications.filter((n) => n.level === 'error')).toHaveLength(1);
  });

  test('another add-on cannot make this one site-critical', async () => {
    writeAddon('other', { defaults: { [CRITICAL]: true } });
    writeAddon(SLUG, { index: `export default { name: '${SLUG}', register: async () => { throw new Error('down'); } };\n` });
    const { engine } = await boot({ [`ngdpbase.addons.${SLUG}.enabled`]: true, 'ngdpbase.addons.other.enabled': true });
    expect(engine.getBlockingConditions()).toEqual([]);
  });
});

describe('#1883 what visitors and administrators see while blocked', () => {
  test('visitors see none of the details: neither the page nor /health/readiness', () => {
    const reasons = ["Site-critical add-on 'phr' did not load: Add-on 'phr' declares database 'phr' with encrypt \"required\", but NGDPBASE_DATABASE_KEY is not set"];
    const seen = blockedForVisitors(reasons, PUBLIC_MESSAGE);
    expect(seen).toEqual({ message: PUBLIC_MESSAGE, detail: [PUBLIC_MESSAGE] });
    expect(JSON.stringify(seen)).not.toMatch(/phr|NGDPBASE|database/);
  });

  test('one private reason hides every reason, so no detail stands beside the notice', () => {
    const seen = blockedForVisitors(['3 outbound range(s) do not parse as CIDR', "Site-critical add-on 'phr' did not load: x"], PUBLIC_MESSAGE);
    expect(JSON.stringify(seen)).not.toMatch(/CIDR|phr/);
  });

  test('without a private reason the #1152 page is unchanged and names every reason', () => {
    const seen = blockedForVisitors(['3 outbound range(s) do not parse as CIDR'], null);
    expect(seen.message).toMatch(/configuration could not be used:\n• 3 outbound range/);
    expect(seen.detail).toEqual(['3 outbound range(s) do not parse as CIDR']);
  });

  test('an empty configured message still hides the details', () => {
    expect(blockedForVisitors(['secret detail'], '')).toEqual({ message: '', detail: [''] });
  });

  test('administrators can still reach /admin, /login and /logout; everything else is closed', () => {
    // The add-on blocks after the engine finished, so the gate is the #1152 one.
    for (const p of ['/admin', '/admin/addons', '/login', '/logout']) expect(gateDecision(false, true, p)).toBe('serve');
    for (const p of ['/', '/view/Welcome', '/api/phr/records', '/adminish']) expect(gateDecision(false, true, p)).toBe('block');
  });

  test('the Engine keeps reasons for administrators and the public message apart', () => {
    const engine = new Engine();
    engine.blockConfiguration('a public reason');
    expect(engine.getPublicBlockingMessage()).toBeNull();
    engine.blockConfiguration('a private reason', { publicMessage: PUBLIC_MESSAGE });
    expect(engine.getBlockingConditions()).toEqual(['a public reason', 'a private reason']);
    expect(engine.getPublicBlockingMessage()).toBe(PUBLIC_MESSAGE);
  });
});
