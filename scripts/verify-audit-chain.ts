/**
 * Verify the audit log's hash chain (#1119).
 *
 * A chain that can only be checked by the code that wrote it is a circular
 * argument, so this reads the log as data and reports what it finds. It is the
 * thing to run in front of an assessor, and the thing to run after suspecting
 * an audit log has been edited.
 *
 * Usage:
 *   npx tsx scripts/verify-audit-chain.ts [path/to/audit.log] [--head <hash>] [--witness <path>]
 *
 * With no path it reads FAST_STORAGE/logs/audit.log, matching the shipped
 * default for ngdpbase.audit.provider.file.logdirectory.
 *
 * Truncation detection requires something OUTSIDE the file to compare against:
 * records removed from the end break no link, so the log cannot see its own
 * tail being cut. Three sources, in precedence order (#1161):
 *
 *   1. --head <hash>       an assessor's own head, from outside this machine.
 *                          Highest precedence deliberately: somebody supplying
 *                          a head from outside is the strongest case and must
 *                          not be overridden by whatever the machine has on
 *                          disk.
 *   2. --witness <path>    a witness file held somewhere the config does not
 *                          name — a retention-locked store, a colleague's copy.
 *   3. the configured      ngdpbase.audit.chain-witness.destination, published
 *      witness             by the instance itself (#1138).
 *
 * With none of them, an intact chain is reported as VERIFIED-BUT-UNWITNESSED
 * and exits 3 rather than 0. That distinction is the point: "this log verifies"
 * and "nothing can tell whether records were removed from the end" are
 * different statements, and mapping the second to success would tell an
 * operator their log is fine when nothing can say so.
 *
 * Exit codes: 0 verified with a witness, 1 broken, 2 could not read the log,
 * 3 chain intact but truncation undetectable.
 */
import fs from 'fs-extra';
import path from 'path';
import { verifyLog } from '../src/utils/auditChain.js';
import { assessWitness, type ChainWitness } from '../src/utils/auditHeadWitness.js';

const WITNESS_KEY = 'ngdpbase.audit.chain-witness.destination';

/**
 * Where the instance was told to publish its head.
 *
 * Read straight from the configuration files rather than through
 * ConfigurationManager: this script exists to check the log WITHOUT the
 * application, and booting the thing under examination to ask it where its
 * evidence lives would be the circular argument the chain design rejects.
 */
async function configuredWitnessPath(): Promise<string | null> {
  const candidates = [
    path.join(process.env.FAST_STORAGE ?? './data', 'config', 'app-custom-config.json'),
    path.join(process.cwd(), 'config', 'app-default-config.json')
  ];
  for (const file of candidates) {
    try {
      if (!(await fs.pathExists(file))) continue;
      const cfg = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
      const value = cfg[WITNESS_KEY];
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    } catch {
      // A malformed config file is not this script's problem to report; the
      // absence of a witness is reported below either way.
    }
  }
  return null;
}

/** The most recently published head, or null. */
async function readWitness(file: string): Promise<ChainWitness | null> {
  try {
    const lines = (await fs.readFile(file, 'utf8')).trim().split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]) as ChainWitness;
      } catch {
        // Skip a truncated final line and take the last COMPLETE record.
      }
    }
  } catch {
    return null;
  }
  return null;
}

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
  const witnessIndex = args.indexOf('--witness');
  const witnessArg = witnessIndex >= 0 ? args[witnessIndex + 1] : undefined;
  // The index of each flag's VALUE, so it is not mistaken for the log path.
  // Guarded on the flag being present: indexOf returns -1 when it is absent,
  // and -1 + 1 is 0 — which silently excluded the first positional argument.
  // Passing a log path without --head therefore never worked, and fell back to
  // the default path while appearing to accept the argument.
  const valueIndexes = new Set<number>();
  if (headIndex >= 0) valueIndexes.add(headIndex + 1);
  if (witnessIndex >= 0) valueIndexes.add(witnessIndex + 1);
  const positional = args.filter((a, i) => !a.startsWith('--') && !valueIndexes.has(i));

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

  const verdict = verifyLog(records);
  const head = records[records.length - 1].hash as string;

  // #1124: a log may contain deliberate discontinuities. Reporting each
  // segment separately is the difference between "somebody tampered with this"
  // and "this was restarted on purpose, here is who and why".
  verdict.segments.forEach((segment, i) => {
    const label = `segment ${i + 1}`;
    const meta = segment.restart?.metadata as Record<string, unknown> | undefined;
    if (segment.restart) {
      console.log(`  ${label} begins at a RESTART marker — ${String(meta?.actor)}: ${String(meta?.reason)}`);
    }
    if (segment.verdict.ok) {
      console.log(`  ✓ ${label}: ${segment.verdict.checked} record(s) intact`);
    } else if (segment.explained) {
      console.log(`  ~ ${label}: broken at ${segment.verdict.brokenAt} (${segment.verdict.reason}) — EXPLAINED by the restart that follows`);
    } else {
      console.error(`  ✗ ${label}: broken at ${segment.verdict.brokenAt} — ${segment.verdict.reason}`);
    }
    if (segment.mismatchedPrevious) {
      console.error(`  ✗ ${label}: its restart marker names a previous head that does not match. This is a finding.`);
    }
  });

  if (verdict.segments.length > 1) {
    console.log(`  ${verdict.segments.length} segments — a log restarted repeatedly is worth asking about.`);
  }

  if (!verdict.ok) {
    console.error('✗ The log did not verify.');
    process.exit(1);
  }

  console.log(`✓ Chain verified. head ${head}`);

  // #1161: an assessor's own head outranks anything the machine holds. Someone
  // supplying a head from outside is the strongest case available, and the
  // machine under examination must not be able to override it.
  if (expectedHead) {
    if (head !== expectedHead) {
      console.error(`✗ The head does not match --head: expected ${expectedHead}, log ends at ${head}.`);
      console.error('  Records were removed from the END. The remaining records still verify against');
      console.error('  each other, which is why only a head from outside the log can see this.');
      process.exit(1);
    }
    console.log('✓ Head matches --head. Truncation would have been detected.');
    process.exit(0);
  }

  const witnessPath = witnessArg ?? (await configuredWitnessPath());
  if (!witnessPath) {
    console.error('⚠️  VERIFIED, BUT UNWITNESSED.');
    console.error('  The chain is intact, and nothing can tell whether records were removed from');
    console.error('  the END — removing them breaks no link. Those are different statements, so');
    console.error('  this is NOT reported as success.');
    console.error(`  Publish the head off-box by setting ${WITNESS_KEY}, or pass --head / --witness.`);
    process.exit(3);
  }

  const witness = await readWitness(witnessPath);
  if (!witness) {
    console.error(`⚠️  VERIFIED, BUT UNWITNESSED. No usable head found in ${witnessPath}.`);
    console.error('  Truncation of the most recent records is NOT detectable.');
    process.exit(3);
  }

  const assessment = assessWitness(
    witness,
    records.map((r) => ({ seq: r.seq as number, hash: r.hash as string }))
  );
  console.log(`Witness: ${witnessPath} (seq ${witness.seq}, published ${witness.publishedAt})`);

  if (assessment.verdict === 'intact') {
    console.log('✓ The log is consistent with the published head. Truncation would have been detected.');
    process.exit(0);
  }

  console.error(`✗ ${assessment.reason ?? assessment.verdict}`);
  process.exit(1);
}

void main();
