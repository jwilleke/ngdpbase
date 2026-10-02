/**
 * #1536 — the application database: SQLCipher at rest, the migration ledger
 * (once, transactional, newer-build refusal), and the integrity check.
 * Every test works in its own temp directory and removes only that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import SqliteDatabaseProvider from '../SqliteDatabaseProvider';
import { addColumnWithDefault, runMigrations, type Migration } from '../sqliteMigrations';

const KEY = 'test-key-not-a-secret';
const CREATE: Migration = { id: '20261002120000', description: 'notes table', up: (db) => db.exec('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)') };
const COUNTER: Migration = { id: '20261002130000', description: 'notes counter', up: (db) => addColumnWithDefault(db, 'notes', 'hits', 'INTEGER', 0) };

describe('SqliteDatabaseProvider (#1536)', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ngdpbase-1536-'));
    file = path.join(dir, 'app.db');
  });

  afterEach(() => {
    // Only the per-test temp directory — never a live data tree.
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('with a key the file is encrypted: no SQLite header, and the plaintext is not on disk', () => {
    const p = new SqliteDatabaseProvider(file, KEY, [CREATE]);
    p.handle.prepare('INSERT INTO notes (body) VALUES (?)').run('a very findable phrase');
    p.close();
    const bytes = fs.readFileSync(file);
    expect(bytes.subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3');
    expect(bytes.includes(Buffer.from('a very findable phrase'))).toBe(false);
    expect(new SqliteDatabaseProvider(file, KEY, [CREATE]).storage().encrypted).toBe(true);
  });

  test('the wrong key refuses to open, rather than reading garbage', () => {
    new SqliteDatabaseProvider(file, KEY, [CREATE]).close();
    expect(() => new SqliteDatabaseProvider(file, 'another-key', [CREATE])).toThrow();
  });

  test('without a key the file is plain SQLite', () => {
    new SqliteDatabaseProvider(file, '', [CREATE]).close();
    expect(fs.readFileSync(file).subarray(0, 15).toString('latin1')).toBe('SQLite format 3');
  });

  test('migrations run once each, in order, and are recorded', () => {
    const first = new SqliteDatabaseProvider(file, KEY, [CREATE]);
    expect(first.migrations).toEqual({ applied: [CREATE.id], skipped: 0 });
    first.close();
    const second = new SqliteDatabaseProvider(file, KEY, [CREATE, COUNTER]);
    expect(second.migrations).toEqual({ applied: [COUNTER.id], skipped: 1 });
    second.close();
  });

  test('addColumnWithDefault backfills rows that already exist (yourphr#528)', () => {
    const p = new SqliteDatabaseProvider(file, KEY, [CREATE]);
    p.handle.prepare('INSERT INTO notes (body) VALUES (?)').run('old row');
    p.close();
    const q = new SqliteDatabaseProvider(file, KEY, [CREATE, COUNTER]);
    expect(q.handle.prepare('SELECT hits FROM notes').get()).toEqual({ hits: 0 });
    q.close();
  });

  test('a failing migration is rolled back and named, and the database refuses to open', () => {
    const broken: Migration = { id: '20261002140000', description: 'broken', up: (db) => { db.exec('CREATE TABLE half (x)'); throw new Error('boom'); } };
    expect(() => new SqliteDatabaseProvider(file, KEY, [CREATE, broken])).toThrow(/migration 20261002140000 \(broken\) failed and was rolled back: boom/);
    const p = new SqliteDatabaseProvider(file, KEY, [CREATE]);
    expect(p.handle.prepare("SELECT name FROM sqlite_master WHERE name = 'half'").get()).toBeUndefined();
    p.close();
  });

  test('a database from a newer build is refused, naming the unknown migration', () => {
    new SqliteDatabaseProvider(file, KEY, [CREATE, COUNTER]).close();
    expect(() => new SqliteDatabaseProvider(file, KEY, [CREATE])).toThrow(/newer than this build.*20261002130000/);
  });

  test('a ledger out of order or with a malformed id is refused before anything runs', () => {
    expect(() => new SqliteDatabaseProvider(file, KEY, [COUNTER, CREATE])).toThrow(/strictly ascending/);
    expect(() => new SqliteDatabaseProvider(file, KEY, [{ ...CREATE, id: '2026-10-02' }])).toThrow(/YYYYMMDDHHMMSS/);
  });

  test('runs in WAL mode, fsynced, and passes its integrity check', () => {
    const p = new SqliteDatabaseProvider(file, KEY, [CREATE]);
    expect(p.handle.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(p.integrityOk()).toBe(true);
    expect(p.getDurability()).toEqual({ bufferedForMs: 0, bufferedRecords: 0, fsync: true });
    p.close();
  });

  test('the ledger table name must be a plain name', () => {
    const p = new SqliteDatabaseProvider(file, KEY, []);
    expect(() => runMigrations(p.handle, [], 'x; DROP TABLE y')).toThrow(/not a plain name/);
    p.close();
  });
});
