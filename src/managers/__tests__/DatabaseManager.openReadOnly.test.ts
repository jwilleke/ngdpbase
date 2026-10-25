/**
 * #2076 — DatabaseManager.openReadOnly: a foreign SQLite or SQLCipher file
 * opened read-only for an add-on's migration, from the configured folder only,
 * by a job with a reason or an admin, with its key from an environment
 * reference, every open recorded, and at most N open.
 */
vi.unmock('../../providers/SqliteDatabaseProvider');

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3-multiple-ciphers';
import DatabaseManager, { DATABASE_KEY_ENV } from '../DatabaseManager';
import type { ActorContext } from '../../context/ActorContext';
import { jobContextFromRequest, jobContextFromSystem } from '../../context/JobContext';

const KEY_VAR = 'NGDPBASE_TEST_2076_FOREIGN_KEY';

/** A file at `file` with one table of two rows, encrypted under `key` when given. */
function writeFixture(file: string, key = ''): void {
  const db = new Database(file);
  if (key) {
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key='${key}'`);
  }
  db.exec("CREATE TABLE records (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO records (body) VALUES ('a'), ('b'); PRAGMA user_version = 7;");
  db.close();
}

describe('DatabaseManager.openReadOnly (#2076)', () => {
  let dir: string;
  let foreign: string;
  let audits: Array<Record<string, unknown>>;
  let auditFails: boolean;
  let admins: Set<string>;
  const key = randomUUID();

  const SYSTEM = jobContextFromSystem('system', 'phr: migrate yourPHR records');
  const ADMIN = { username: 'admin', isAuthenticated: true, roles: ['admin'] } as unknown as ActorContext;
  const READER = { username: 'reader', isAuthenticated: true, roles: ['reader'] } as unknown as ActorContext;

  const started = async (props: Record<string, unknown> = {}): Promise<DatabaseManager> => {
    const all: Record<string, unknown> = { 'ngdpbase.database.foreign-read.dir': foreign, ...props };
    const configManager = {
      getProperty: (k: string, def: unknown) => (k in all ? all[k] : def),
      getResolvedDataPath: (k: string, def: string) => (k in all ? all[k] as string : def),
      getAddonDatabaseDeclarations: () => []
    };
    const auditManager = { logAuditEvent: async (e: Record<string, unknown>) => { if (auditFails) throw new Error('audit sink down'); audits.push(e); }, flushAuditQueue: async () => undefined };
    const pdp = { permits: async (ctx: { username?: string }, action: string) => action === 'admin-system' && admins.has(ctx.username ?? '') };
    const managers: Record<string, unknown> = { ConfigurationManager: configManager, AuditManager: auditManager, PolicyDecisionPoint: pdp };
    const manager = new DatabaseManager({ getManager: (n: string) => managers[n] ?? null });
    await manager.initialize();
    return manager;
  };

  beforeEach(() => {
    // Under the test's own folder; teardown removes only this directory.
    dir = fs.mkdtempSync(path.join(__dirname, 'tmp-2076-'));
    foreign = path.join(dir, 'foreign');
    fs.mkdirSync(foreign);
    writeFixture(path.join(foreign, 'plain.db'));
    writeFixture(path.join(foreign, 'records.db'), key);
    audits = [];
    auditFails = false;
    admins = new Set(['admin']);
    process.env[KEY_VAR] = key;
  });

  afterEach(() => {
    delete process.env[KEY_VAR];
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a job with a reason reads a plain file; the open is recorded with the file and the purpose', async () => {
    const manager = await started();
    const db = await manager.openReadOnly(SYSTEM, { path: 'plain.db', purpose: 'phr: migrate yourPHR records', addon: 'phr' });
    expect(db.prepare('SELECT body FROM records ORDER BY id').all()).toEqual([{ body: 'a' }, { body: 'b' }]);
    expect(db.prepare('SELECT * FROM pragma_user_version').get()).toEqual({ user_version: 7 });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      eventType: 'database-open-readonly', user: 'system', result: 'success',
      resource: fs.realpathSync(path.join(foreign, 'plain.db')), resourceType: 'database',
      metadata: { purpose: 'phr: migrate yourPHR records', encrypted: false, addon: 'phr', reason: 'phr: migrate yourPHR records' }
    });
    db.close();
    expect(db.open).toBe(false);
    await manager.shutdown();
  });

  test('a SQLCipher file opens with its key from a $NAME reference; the key is never recorded or logged', async () => {
    const manager = await started();
    const db = await manager.openReadOnly(ADMIN, { path: path.join(foreign, 'records.db'), keyRef: `$${KEY_VAR}`, purpose: 'admin: check the export' });
    expect(db.prepare('SELECT count(*) AS n FROM records').get()).toEqual({ n: 2 });
    expect(JSON.stringify(audits)).not.toContain(key);
    expect(audits[0]).toMatchObject({ user: 'admin', metadata: { encrypted: true } });
    await manager.shutdown();
  });

  test('a literal key, an unset variable, the site\'s own keys and a wrong key are refused without echoing the key', async () => {
    const manager = await started();
    const open = (keyRef: string) => manager.openReadOnly(SYSTEM, { path: 'records.db', keyRef, purpose: 'migrate' });
    const literal = await open(key).catch((e: Error) => e);
    expect(literal).toBeInstanceOf(Error);
    expect((literal as Error).message).toMatch(/environment reference/);
    expect((literal as Error).message).not.toContain(key);
    await expect(open('$NGDPBASE_TEST_2076_UNSET')).rejects.toThrow(/NGDPBASE_TEST_2076_UNSET.*not set/);
    await expect(open(`$${DATABASE_KEY_ENV}`)).rejects.toThrow(/site's own key/);
    await expect(open('$NGDPBASE_BACKUP_KEY')).rejects.toThrow(/site's own key/);
    process.env[KEY_VAR] = randomUUID();
    await expect(open(`$${KEY_VAR}`)).rejects.toThrow(/key does not open it/);
    await expect(manager.openReadOnly(SYSTEM, { path: 'records.db', purpose: 'migrate' })).rejects.toThrow(/may be encrypted: pass keyRef/);
    expect(audits).toHaveLength(0);
    await manager.shutdown();
  });

  test('the handle refuses writes, pragmas, ATTACH and VACUUM INTO, and the file is unchanged', async () => {
    const manager = await started();
    const file = path.join(foreign, 'plain.db');
    const before = fs.readFileSync(file);
    const db = await manager.openReadOnly(SYSTEM, { path: 'plain.db', purpose: 'migrate' });
    for (const sql of [
      "INSERT INTO records (body) VALUES ('c')",
      'DELETE FROM records',
      'PRAGMA user_version = 9',
      "PRAGMA key = 'x'",
      'PRAGMA journal_mode = DELETE',
      'pragma user_version',
      `ATTACH DATABASE '${path.join(foreign, 'records.db')}' AS other`,
      `VACUUM INTO '${path.join(dir, 'copy.db')}'`,
      'CREATE TABLE more (x)',
      '/* a comment */ PRAGMA user_version = 9',
      '-- a comment\nDROP TABLE records',
      'WITH x AS (SELECT 1) DELETE FROM records',
      'SELECT 1; DELETE FROM records'
    ]) {
      expect(() => db.prepare(sql), sql).toThrow();
    }
    expect(db.prepare('/* lead */ -- line\n  select count(*) AS n FROM records').get()).toEqual({ n: 2 });
    expect(fs.existsSync(path.join(dir, 'copy.db'))).toBe(false);
    db.close();
    expect(fs.readFileSync(file).equals(before)).toBe(true);
    await manager.shutdown();
  });

  test('only a job with a reason or an admin may open one', async () => {
    const manager = await started();
    const req = { path: 'plain.db', purpose: 'migrate' };
    await expect(manager.openReadOnly(READER, req)).rejects.toThrow(/admin-system/);
    await expect(manager.openReadOnly(jobContextFromSystem('system', ''), req)).rejects.toThrow(/admin-system/);
    // A job a visitor's request queued is not the system's: it is asked as the requester.
    await expect(manager.openReadOnly(jobContextFromRequest({ username: 'reader' }), req)).rejects.toThrow(/admin-system/);
    const asAdmin = await manager.openReadOnly(jobContextFromRequest({ username: 'admin' }), req);
    asAdmin.close();
    await expect(manager.openReadOnly(SYSTEM, { path: 'plain.db', purpose: '  ' })).rejects.toThrow(/purpose/);
    expect(audits).toHaveLength(1);
    await manager.shutdown();
  });

  test('off when the folder is not set, and only files inside it: no traversal, no symbolic-link escape, no own database', async () => {
    const off = await started({ 'ngdpbase.database.foreign-read.dir': '' });
    await expect(off.openReadOnly(SYSTEM, { path: 'plain.db', purpose: 'migrate' })).rejects.toThrow(/off: set ngdpbase\.database\.foreign-read\.dir/);
    await off.shutdown();

    writeFixture(path.join(dir, 'outside.db'));
    fs.symlinkSync(path.join(dir, 'outside.db'), path.join(foreign, 'link.db'));
    const manager = await started();
    const open = (p: string) => manager.openReadOnly(SYSTEM, { path: p, purpose: 'migrate' });
    await expect(open('../outside.db')).rejects.toThrow(/outside ngdpbase\.database\.foreign-read\.dir/);
    await expect(open(path.join(dir, 'outside.db'))).rejects.toThrow(/outside/);
    await expect(open('link.db')).rejects.toThrow(/outside/);
    await expect(open('missing.db')).rejects.toThrow(/No file missing\.db/);
    await expect(open('.')).rejects.toThrow(/outside/);
    await manager.shutdown();

    // The site's own application database is never opened as foreign, even when it sits in the folder.
    process.env[DATABASE_KEY_ENV] = randomUUID();
    try {
      const site = await started({ 'ngdpbase.database.provider': 'sqlite', 'ngdpbase.database.file': path.join(foreign, 'ngdpbase.db') });
      await expect(site.openReadOnly(SYSTEM, { path: 'ngdpbase.db', purpose: 'migrate' })).rejects.toThrow(/this site's own databases/);
      await site.shutdown();
    } finally {
      delete process.env[DATABASE_KEY_ENV];
    }
    expect(audits.filter((a) => a.eventType === 'database-open-readonly')).toEqual([]);
  });

  test('at most max-open at once; closing frees a place; shutdown closes what is left', async () => {
    const manager = await started({ 'ngdpbase.database.foreign-read.max-open': 2 });
    const req = { path: 'plain.db', purpose: 'migrate' };
    const [a, b] = await Promise.all([manager.openReadOnly(SYSTEM, req), manager.openReadOnly(SYSTEM, req)]);
    await expect(manager.openReadOnly(SYSTEM, req)).rejects.toThrow(/max-open allows \(2\)/);
    a.close();
    a.close();
    const c = await manager.openReadOnly(SYSTEM, req);
    await manager.shutdown();
    expect(b.open).toBe(false);
    expect(c.open).toBe(false);
    expect(() => b.prepare('SELECT 1')).toThrow(/closed/);
  });

  test('a max-open that is not a whole number, 1 or more, refuses, naming the key', async () => {
    for (const bad of [0, 1.5, '4', null]) {
      const manager = await started({ 'ngdpbase.database.foreign-read.max-open': bad });
      await expect(manager.openReadOnly(SYSTEM, { path: 'plain.db', purpose: 'migrate' })).rejects.toThrow(/max-open/);
      await manager.shutdown();
    }
  });

  test('an open that cannot be recorded is closed and refused', async () => {
    const manager = await started({ 'ngdpbase.database.foreign-read.max-open': 1 });
    auditFails = true;
    await expect(manager.openReadOnly(SYSTEM, { path: 'plain.db', purpose: 'migrate' })).rejects.toThrow(/audit sink down/);
    auditFails = false;
    // Its place was given back: the one allowed open still succeeds.
    const db = await manager.openReadOnly(SYSTEM, { path: 'plain.db', purpose: 'migrate' });
    expect(db.open).toBe(true);
    await manager.shutdown();
  });
});
