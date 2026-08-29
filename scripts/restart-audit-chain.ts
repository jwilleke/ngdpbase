/**
 * Begin a new audit chain, recording that the old one was abandoned (#1124).
 *
 * A chain break is permanent by design: every record after it is unverifiable,
 * and the verifier stops at the first one. That is correct — but without a way
 * to declare a KNOWN break, the only ways forward are dishonest: edit the log
 * so it verifies, delete it and start fresh, or ignore the verifier until it
 * is ignored permanently.
 *
 * This is the honest way. It writes a marker INTO the log saying the chain was
 * restarted, by whom and why. It does not repair the past: the abandoned
 * records stay in the file and stay unverifiable.
 *
 * Deliberately a command an operator runs, never automatic recovery. A system
 * that silently repairs its own audit chain is worse than one that stays
 * visibly broken.
 *
 * Usage:
 *   npx tsx scripts/restart-audit-chain.ts --reason "..." --actor "..."
 */
import WikiEngine from '../src/WikiEngine.js';

interface AuditManagerLike {
  getAuditPosture?: () => { provider: string; degraded: boolean };
  restartAuditChain?: (reason: string, actor: string) => Promise<string>;
  /** NOT optional: a marker that never reaches disk is worse than not restarting at all. */
  flushAuditQueue: () => Promise<void>;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const reason = arg('reason');
  const actor = arg('actor') ?? process.env.USER ?? 'unknown';

  if (!reason?.trim()) {
    console.error('A chain restart must record a reason.');
    console.error('  npx tsx scripts/restart-audit-chain.ts --reason "records predate the #1119 fix" --actor jim');
    console.error('\nAn unexplained restart is itself a finding, which is why this refuses.');
    process.exit(2);
  }

  const engine = new WikiEngine();
  await engine.initialize();
  const audit = engine.getManager('AuditManager') as AuditManagerLike | null;

  if (!audit?.restartAuditChain) {
    console.error('✗ No audit manager, or it does not support chain restart.');
    process.exit(2);
  }

  const posture = audit.getAuditPosture?.();
  if (posture?.degraded) {
    console.error(`✗ Auditing is degraded (${posture.provider}). Fix that first — restarting a chain that is not being written to achieves nothing.`);
    process.exit(2);
  }

  const id = await audit.restartAuditChain(reason.trim(), actor);

  // The provider queues writes and flushes on a timer. A short-lived command
  // exits long before that, so the marker has to be forced to disk or the
  // restart is recorded nowhere — which is worse than not restarting at all.
  //
  // Declared non-optional deliberately. The first version called `flush?.()`,
  // which does not exist on AuditManager — the method is flushAuditQueue — and
  // optional chaining turned a required step into a silent no-op. Same defect
  // this whole issue chain has been about, committed inside the fix for it.
  await audit.flushAuditQueue();
  console.log(`✓ Audit chain restarted by ${actor}`);
  console.log(`  reason: ${reason.trim()}`);
  console.log(`  marker: ${id}`);
  console.log('\nThe abandoned records remain in the log and remain unverifiable.');
  console.log('Run `npm run audit:verify` — it should now report an explained break and an intact new segment.');
  process.exit(0);
}

void main();
