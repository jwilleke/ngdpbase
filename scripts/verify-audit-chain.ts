/**
 * Verify the audit log's hash chain (#1119).
 *
 * A chain that can only be checked by the code that wrote it is a circular
 * argument, so this reads the log as data and reports what it finds. It is the
 * thing to run in front of an assessor, and the thing to run after suspecting
 * an audit log has been edited.
 *
 * Usage:
 *   npx tsx scripts/verify-audit-chain.ts [path/to/audit.log] [--head <hash>]
 *
 * With no path it reads FAST_STORAGE/logs/audit.log, matching the shipped
 * default for ngdpbase.audit.provider.file.logdirectory.
 *
 * --head supplies the chain head from somewhere the log cannot reach — an
 * off-box anchor, a previous run's output. Without it, records removed from
 * the END of the log break no link and cannot be detected. That is a real
 * limit, not an oversight: truncation detection requires something outside
 * the file to compare against.
 *
 * Exit codes: 0 verified, 1 broken, 2 could not read the log.
 */
import fs from 'fs-extra';
import path from 'path';
import { verifyChain } from '../src/utils/auditChain.js';

interface Parsed {
  records: Record<string, unknown>[];
  unstamped: number;
  unparseable: number;
}

/** Read a JSONL audit log, tolerating the records that predate chaining. */
async function readLog(file: string): Promise<Parsed> {
  const contents = await fs.readFile(file, 'utf8');
  const records: Record<string, unknown>[] = [];
  let unstamped = 0;
  let unparseable = 0;

  for (const line of contents.split('\n')) {
    if (!line.trim()) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
      unparseable++;
      continue;
    }
    // Records written before #1119 carry no seq. They are not a chain break —
    // they are history from before there was a chain, and saying so is more
    // useful than reporting thousands of failures.
    if (typeof parsed.seq !== 'number') {
      unstamped++;
      continue;
    }
    records.push(parsed);
  }

  return { records, unstamped, unparseable };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const headIndex = args.indexOf('--head');
  const expectedHead = headIndex >= 0 ? args[headIndex + 1] : undefined;
  const positional = args.filter((a, i) => !a.startsWith('--') && i !== headIndex + 1);

  const file = positional[0]
    ?? path.join(process.env.FAST_STORAGE ?? './data', 'logs', 'audit.log');

  if (!(await fs.pathExists(file))) {
    console.error(`✗ No audit log at ${file}`);
    process.exit(2);
  }

  const { records, unstamped, unparseable } = await readLog(file);
  console.log(`Audit log: ${file}`);
  if (unstamped > 0) {
    console.log(`  ${unstamped} record(s) predate chaining (#1119) — not verifiable, not a break`);
  }
  if (unparseable > 0) {
    console.log(`  ⚠️  ${unparseable} unparseable line(s) — a truncated final line is a kill mid-write; more than one is worth investigating`);
  }
  if (records.length === 0) {
    console.log('  No chained records yet. Nothing to verify.');
    process.exit(0);
  }

  const verdict = verifyChain(records, expectedHead ? { expectedHead } : {});
  const head = records[records.length - 1].hash as string;

  if (verdict.ok) {
    console.log(`✓ Chain intact across ${verdict.checked} record(s)`);
    console.log(`  seq ${records[0].seq} → ${records[records.length - 1].seq}`);
    console.log(`  head ${head}`);
    if (!expectedHead) {
      console.log('  Note: no --head supplied, so truncation of the most recent records is NOT detectable.');
    }
    process.exit(0);
  }

  console.error(`✗ Chain BROKEN after ${verdict.checked} record(s)`);
  if (verdict.brokenAt !== undefined) {
    const bad = records[verdict.brokenAt - 1];
    console.error(`  at record ${verdict.brokenAt} (seq ${String(bad?.seq)}, id ${String(bad?.id)}, ${String(bad?.timestamp)})`);
  }
  console.error(`  ${verdict.reason}`);
  process.exit(1);
}

void main();
