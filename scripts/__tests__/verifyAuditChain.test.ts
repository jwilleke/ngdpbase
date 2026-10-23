import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { stampRecord, GENESIS_HASH } from '../../src/utils/auditChain';
import SqliteDatabaseProvider from '../../src/providers/SqliteDatabaseProvider';
import DATABASE_MIGRATIONS from '../../src/providers/databaseMigrations';

/**
 * #1161 — the verifier is "the thing to run in front of an assessor", and
 * truncation detection was only reachable by someone who already had the right
 * head to paste. These drive the REAL script, including its exit codes,
 * because that is what an operator and any automation actually consume.
 */
let dir: string;

/** A short, valid chain plus the head that witnesses it. */
function buildChain(count: number): { lines: string[]; head: { seq: number; hash: string } } {
  const lines: string[] = [];
  let prev = GENESIS_HASH;
  let last = { seq: 0, hash: GENESIS_HASH };
  for (let i = 1; i <= count; i++) {
    const stamped = stampRecord({ eventType: 'page-edit', user: 'x' }, i, prev);
    prev = stamped.hash as string;
    last = { seq: i, hash: prev };
    lines.push(JSON.stringify(stamped));
  }
  return { lines, head: last };
}

function run(args: string[], env: Record<string, string> = {}): { code: number; out: string } {
  try {
    const out = execFileSync('npx', ['tsx', 'scripts/verify-audit-chain.ts', ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd(), env: { ...process.env, ...env }
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-chain-'));
});
afterEach(async () => {
  // Only this test's own temp directory. Never a data directory.
  await fs.remove(dir);
});

describe('#1161 the verifier reads a witness', () => {
  test('an intact log with a matching witness verifies', async () => {
    const { lines, head } = buildChain(5);
    const log = path.join(dir, 'audit.log');
    const wit = path.join(dir, 'head.jsonl');
    await fs.writeFile(log, lines.join('\n') + '\n');
    await fs.writeFile(wit, JSON.stringify({ ...head, instance: 't', publishedAt: '2026-09-01T00:00:00Z' }) + '\n');

    const { code, out } = run([log, '--witness', wit]);
    expect(code).toBe(0);
    expect(out).toMatch(/consistent with the published head/i);
  }, 30_000);

  test('a TRUNCATED log fails, and says how many records went', async () => {
    // The whole point: the remaining records still verify against each other,
    // so only the witness can see this.
    const { lines, head } = buildChain(5);
    const log = path.join(dir, 'audit.log');
    const wit = path.join(dir, 'head.jsonl');
    await fs.writeFile(log, lines.slice(0, 3).join('\n') + '\n');
    await fs.writeFile(wit, JSON.stringify({ ...head, instance: 't', publishedAt: '2026-09-01T00:00:00Z' }) + '\n');

    const { code, out } = run([log, '--witness', wit]);
    expect(code).toBe(1);
    expect(out).toMatch(/2 record\(s\) were removed from the end/);
  }, 30_000);

  test('an intact log with NO witness exits 3, not 0', async () => {
    // "This log verifies" and "nothing can tell whether records were removed
    // from the end" are different statements. Reporting the second as success
    // would tell an operator their log is fine when nothing can say so.
    const { lines } = buildChain(5);
    const log = path.join(dir, 'audit.log');
    await fs.writeFile(log, lines.join('\n') + '\n');

    const { code, out } = run([log]);
    expect(code).toBe(3);
    expect(out).toMatch(/UNWITNESSED/);
  }, 30_000);

  test('--head outranks a witness file that disagrees', async () => {
    // An assessor supplying a head from outside is the strongest case and must
    // not be overridden by whatever the machine has on disk.
    const { lines, head } = buildChain(5);
    const log = path.join(dir, 'audit.log');
    const wit = path.join(dir, 'head.jsonl');
    await fs.writeFile(log, lines.join('\n') + '\n');
    await fs.writeFile(wit, JSON.stringify({ seq: 99, hash: 'bogus', instance: 't', publishedAt: 'x' }) + '\n');

    const { code } = run([log, '--head', head.hash, '--witness', wit]);
    expect(code).toBe(0);
  }, 30_000);

  test('a log path is honoured without --head', async () => {
    // Pre-existing bug found while building this: indexOf returns -1 when
    // --head is absent, and -1 + 1 is 0, so the first positional argument was
    // silently dropped and the default path used instead.
    const { lines } = buildChain(3);
    const log = path.join(dir, 'somewhere-else.log');
    await fs.writeFile(log, lines.join('\n') + '\n');

    const { out } = run([log]);
    expect(out).toContain(log);
  }, 30_000);
});

describe('#1537 --database reads the database audit log without booting the app', () => {
  const KEY = 'test-key-not-a-secret';

  /** A database holding `count` chained rows; the first `pruned` removed behind a checkpoint, as retention leaves them. */
  function buildDatabase(file: string, count: number, options: { key?: string; pruned?: number } = {}): { head: { seq: number; hash: string } } {
    const { lines, head } = buildChain(count);
    const db = new SqliteDatabaseProvider(file, options.key ?? '', DATABASE_MIGRATIONS);
    const insert = db.handle.prepare(`INSERT INTO audit_events (id, seq, prev_hash, hash, timestamp, event_type, user, record)
      VALUES (?, ?, ?, ?, '2026-10-22T00:00:00.000Z', 'page-edit', 'x', ?)`);
    lines.forEach((line, i) => {
      const r = JSON.parse(line) as { seq: number; prevHash: string; hash: string };
      insert.run(`e${i}`, r.seq, r.prevHash, r.hash, line);
    });
    const pruned = options.pruned ?? 0;
    if (pruned > 0) {
      const last = JSON.parse(lines[pruned - 1]) as { seq: number; hash: string };
      db.handle.prepare('DELETE FROM audit_events WHERE row_id <= ?').run(pruned);
      db.handle.prepare(`INSERT INTO audit_checkpoints (through_row, seq, hash, removed, cutoff, retention_days, created_at)
        VALUES (?, ?, ?, ?, '2026-10-01', 90, '2026-10-22')`).run(pruned, last.seq, last.hash, pruned);
    }
    db.close();
    return { head };
  }

  test('an intact chain verifies from its checkpoint, against --head', async () => {
    const file = path.join(dir, 'app.db');
    const { head } = buildDatabase(file, 6, { pruned: 2 });

    const { code, out } = run(['--database', file, '--head', head.hash]);
    expect(out).toMatch(/retention checkpoint at seq 2/);
    expect(out).toMatch(/segment 1: 4 record\(s\) intact/);
    expect(code).toBe(0);
  }, 30_000);

  test('with no witness an intact chain exits 3', async () => {
    const file = path.join(dir, 'app.db');
    buildDatabase(file, 3);
    const { code, out } = run(['--database', file]);
    expect(code).toBe(3);
    expect(out).toMatch(/UNWITNESSED/);
  }, 30_000);

  test('an edited row fails', async () => {
    const file = path.join(dir, 'app.db');
    const { head } = buildDatabase(file, 4, { pruned: 1 });
    const db = new SqliteDatabaseProvider(file, '', DATABASE_MIGRATIONS);
    const row = db.handle.prepare('SELECT row_id, record FROM audit_events WHERE seq = 3').get() as { row_id: number; record: string };
    db.handle.prepare('UPDATE audit_events SET record = ? WHERE row_id = ?').run(JSON.stringify({ ...JSON.parse(row.record) as object, user: 'mallory' }), row.row_id);
    db.close();

    const { code, out } = run(['--database', file, '--head', head.hash]);
    expect(code).toBe(1);
    expect(out).toMatch(/hash does not match/);
  }, 30_000);

  test('an encrypted database is read under NGDPBASE_DATABASE_KEY, and refused without it', async () => {
    const file = path.join(dir, 'app.db');
    const { head } = buildDatabase(file, 3, { key: KEY });
    expect(run(['--database', file, '--head', head.hash], { NGDPBASE_DATABASE_KEY: KEY }).code).toBe(0);
    const without = run(['--database', file, '--head', head.hash], { NGDPBASE_DATABASE_KEY: '' });
    expect(without.code).toBe(2);
    expect(without.out).toMatch(/NGDPBASE_DATABASE_KEY/);
  }, 30_000);
});
