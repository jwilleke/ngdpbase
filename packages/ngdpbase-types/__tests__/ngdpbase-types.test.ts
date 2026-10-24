/**
 * `@jwilleke/ngdpbase-types` (#1865): the main entry carries types only, and
 * the `/testing` kit is core's own values, working as they do on a site.
 *
 * Nothing here touches the filesystem: the database is in memory and closed
 * by each test.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { Migration } from '../../../src/providers/sqliteMigrations';
import type { SqliteHandle } from '../../../src/providers/SqliteDatabaseProvider';
import ExportManager from '../../../src/managers/ExportManager';
import PluginManager from '../../../src/managers/PluginManager';
import type { WikiEngine } from '../../../src/types/WikiEngine';
import { buildAddonHost, openAddonTestDatabase, toCsv, formatters } from '../testing';

const PKG = path.resolve(__dirname, '..');
const ENTRY = path.join(PKG, 'index.ts');

describe('@jwilleke/ngdpbase-types main entry (#1865)', () => {
  const source = readFileSync(ENTRY, 'utf8');

  test('every statement is a type-only re-export', () => {
    const file = ts.createSourceFile(ENTRY, source, ts.ScriptTarget.ES2022, true);
    const offending = file.statements
      .filter((s) => !(ts.isExportDeclaration(s) && s.isTypeOnly && s.moduleSpecifier))
      .map((s) => s.getText(file).split('\n')[0]);
    expect(offending).toEqual([]);
    expect(file.statements.length).toBeGreaterThan(0);
  });

  test('it compiles to no JavaScript', () => {
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, removeComments: true }
    });
    expect(outputText.replace(/\s+/g, '')).toBe('export{};');
  });

  test('the package resolves "." for types only, and ./testing for types and JavaScript', () => {
    const pkg = JSON.parse(readFileSync(path.join(PKG, 'package.json'), 'utf8')) as { name: string; exports: Record<string, Record<string, string>> };
    expect(pkg.name).toBe('@jwilleke/ngdpbase-types');
    expect(Object.keys(pkg.exports['.'])).toEqual(['types']);
    expect(Object.keys(pkg.exports['./testing']).sort()).toEqual(['default', 'types']);
  });
});

describe('@jwilleke/ngdpbase-types: what an add-on compiles against (#2022)', () => {
  /** Type-check an add-on source against the public entry; returns its errors. */
  function compileAgainstEntry(consumer: string): string[] {
    const configPath = path.join(PKG, 'tsconfig.json');
    const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, (f) => ts.sys.readFile(f)).config, ts.sys, PKG);
    const file = path.join(PKG, '__consumer__.ts');
    const options = { ...parsed.options, noEmit: true, emitDeclarationOnly: false, declaration: false };
    const host = ts.createCompilerHost(options);
    const { getSourceFile, fileExists, readFile } = host;
    host.fileExists = (f) => f === file || fileExists(f);
    host.readFile = (f) => (f === file ? consumer : readFile(f));
    host.getSourceFile = (f, lang, ...rest) => (f === file ? ts.createSourceFile(f, consumer, lang) : getSourceFile(f, lang, ...rest));
    const program = ts.createProgram([file], options, host);
    return ts.getPreEmitDiagnostics(program, program.getSourceFile(file))
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  }

  test('a receiver passes its context, a job\'s included, straight to the PDP, with no cast', () => {
    const errors = compileAgainstEntry(`
      import type { ActorContext, AddonHost, PolicyDecisionPoint, Decision } from './index.js';
      export async function door(pdp: PolicyDecisionPoint, ctx: ActorContext, host: AddonHost): Promise<boolean> {
        const job = host.systemContext('phr: import');
        const a: Decision = await pdp.decide(ctx, { action: 'phr-write' });
        const b: Decision = await pdp.decide(job, { action: 'phr-write' });
        return a.permit && b.permit && (await pdp.permits(job, 'phr-write')) && (await pdp.holds(ctx, 'phr-write'));
      }
    `);
    expect(errors).toEqual([]);
  }, 60_000);

  test('an add-on changes a user from the account as it is now: updateUser takes a function (#2025)', () => {
    const errors = compileAgainstEntry(`
      import type { ActorContext, UserManager, UserUpdateFn } from './index.js';
      export async function addOwnership(users: UserManager, ctx: ActorContext, place: string): Promise<void> {
        const change: UserUpdateFn = (current) => {
          const ownership = Array.isArray(current.ownership) ? current.ownership as string[] : [];
          if (ownership.includes(place)) return undefined;
          return { ownership: [...ownership, place] };
        };
        await users.updateUser('pat', change, ctx);
        await users.updateUser('pat', async (current) => ({ displayName: current.displayName ?? 'Pat' }), ctx);
        await users.updateUser('pat', { displayName: 'Pat' }, ctx);
      }
    `);
    expect(errors).toEqual([]);
  }, 60_000);
});

describe('@jwilleke/ngdpbase-types/testing (#1865)', () => {
  const defaults = {
    'ngdpbase.permissions.definitions': {
      'ledger-post': { description: 'Post to the ledger', audit: { 'on-failure': 'continue', description: 'Ledger posted' } }
    }
  };
  const event = (eventType: string) => ({
    eventType, user: 'alice', ipAddress: undefined, action: 'post', result: 'success', severity: 'low', metadata: {}
  }) as Parameters<ReturnType<typeof buildAddonHost>['recordAuditEvent']>[1];

  test('buildAddonHost records a declared event, as on a site', async () => {
    const host = buildAddonHost('ledger', defaults);
    const sink = { logAuditEvent: vi.fn(async () => 'id-1') };
    await expect(host.recordAuditEvent(sink, event('ledger-post'))).resolves.toBe('recorded');
    expect(sink.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(host)).toBe(true);
  });

  test('#1973: buildAddonHost\'s systemContext names the engine\'s system principal, or core\'s fallback without one', () => {
    const engine = { getManager: (n: string) => (n === 'PolicyInformationPoint' ? { systemPrincipalName: () => 'svc-test' } : null) };
    expect(buildAddonHost('ledger', defaults, undefined, engine).systemContext('ledger: seed')).toMatchObject({ username: 'svc-test', origin: 'boot', reason: 'ledger: seed' });
    expect(buildAddonHost('ledger', defaults).systemContext('ledger: seed').username).toBe('system');
  });

  test('buildAddonHost refuses an undeclared event, as on a site', async () => {
    const host = buildAddonHost('ledger', defaults);
    const sink = { logAuditEvent: vi.fn(async () => 'id-1') };
    expect(() => host.addonAuditEventName('ledger-close')).toThrow(/may record only the audit events it declares/);
    await expect(host.recordAuditEvent(sink, event('ledger-close'))).rejects.toThrow(/'ledger-close' is not one of them/);
    expect(sink.logAuditEvent).not.toHaveBeenCalled();
  });

  test('buildAddonHost: setEnabledForPerson refuses unless the test gives it a setter (#1963)', async () => {
    const ctx = { username: 'alice', roles: ['reader'], isAuthenticated: true };
    await expect(buildAddonHost('ledger', defaults).setEnabledForPerson(ctx, true)).rejects.toThrow(/built without a site/);
    const setter = vi.fn(async () => {});
    await buildAddonHost('ledger', defaults, setter).setEnabledForPerson(ctx, true);
    expect(setter).toHaveBeenCalledWith(ctx, true);
  });

  test('openAddonTestDatabase runs the migrations and records them in the ledger', () => {
    const migrations: Migration[] = [
      { id: '20261017090000', description: 'entries', up: (db) => db.exec('CREATE TABLE ledger_entries (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL)') },
      { id: '20261017090100', description: 'no zero amounts', up: (db) => db.exec("CREATE TRIGGER ledger_no_zero BEFORE INSERT ON ledger_entries WHEN NEW.amount = 0 BEGIN SELECT RAISE(ABORT, 'zero amount'); END") }
    ];
    const db = openAddonTestDatabase<SqliteHandle>('ledger', { migrations, ledgerTable: 'ledger_schema_migrations' });
    try {
      db.prepare('INSERT INTO ledger_entries (amount) VALUES (?)').run(125);
      expect(() => db.prepare('INSERT INTO ledger_entries (amount) VALUES (?)').run(0)).toThrow(/zero amount/);
      const applied = (db.prepare('SELECT id FROM ledger_schema_migrations ORDER BY id').all() as { id: string }[]).map((r) => r.id);
      expect(applied).toEqual(['20261017090000', '20261017090100']);
    } finally {
      db.close();
    }
  });

  test('openAddonTestDatabase refuses what openAddonDatabase refuses', () => {
    expect(() => openAddonTestDatabase('../evil', { migrations: [], ledgerTable: 'evil_schema_migrations' })).toThrow(/not an add-on slug/);
    expect(() => openAddonTestDatabase('accounting-dues', { migrations: [], ledgerTable: 'accounting_schema_migrations' })).toThrow(/must start with 'accounting_dues_'/);
  });

  describe('with the add-on\'s declaration (#1860)', () => {
    const ledger = { migrations: [], ledgerTable: 'ledger_schema_migrations' };
    const declared = (value: unknown) => ({ slug: 'ledger', defaults: { 'ngdpbase.addons.ledger.database': value } });

    test('opens a declared database, encrypt "required" included (in memory, no key)', () => {
      const db = openAddonTestDatabase<SqliteHandle>('ledger', ledger, declared({ owner: 'ledger', ledgerTable: 'ledger_schema_migrations', encrypt: 'required' }));
      db.close();
    });

    test('refuses a missing declaration, another ledger, and a malformed one', () => {
      expect(() => openAddonTestDatabase('ledger', ledger, { slug: 'ledger', defaults: {} })).toThrow(/No add-on declares database 'ledger'/);
      expect(() => openAddonTestDatabase('ledger', ledger, declared({ owner: 'ledger', ledgerTable: 'ledger_other', encrypt: 'optional' })))
        .toThrow(/not with ledger 'ledger_schema_migrations'/);
      expect(() => openAddonTestDatabase('ledger', ledger, declared({ owner: 'ledger', ledgerTable: 'ledger_schema_migrations', encrypt: 'yes' })))
        .toThrow(/is not loaded: .*encrypt must be "required" or "optional"/);
    });
  });

  test('toCsv is ExportManager.toCsv', () => {
    const rows = [['=SUM(A1)', -12550, 'a,"b"'], [null, true, 'line\nbreak']];
    expect(toCsv(['x', 'y', 'z'], rows)).toBe(new ExportManager({} as WikiEngine).toCsv(['x', 'y', 'z'], rows));
    expect(toCsv(['x'], [['=1']])).toBe("x\r\n'=1\r\n");
  });

  test('formatters is the object a plugin gets as context.formatters', () => {
    expect(formatters).toBe(new PluginManager({} as WikiEngine).formatters);
    expect(Object.isFrozen(formatters)).toBe(true);
    expect(formatters.escapeHtml('<b>')).toBe('&lt;b&gt;');
  });
});
