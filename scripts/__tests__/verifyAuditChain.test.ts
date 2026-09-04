import { execFileSync } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { stampRecord, GENESIS_HASH } from '../../src/utils/auditChain';

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

function run(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('npx', ['tsx', 'scripts/verify-audit-chain.ts', ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd()
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
