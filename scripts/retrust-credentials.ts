#!/usr/bin/env tsx
/**
 * Re-trust credential rows that failed verification (#1633).
 *
 * When NGDPBASE_CREDENTIALS_KEY is lost or changed, every passkey and verified
 * email address in the credentials store fails its signature check: none of
 * them can sign anyone in, and AuthManager reports them as a security event.
 * They are kept in quarantine, unchanged. If the operator knows why — the key
 * was rotated, or the instance .env was restored without it — this command
 * re-signs them under the current key, so people keep their sign-in methods.
 *
 * Deliberately a command an operator runs on the server, never a web button:
 * re-signing whatever is in the file would bless a planted row too. If you do
 * NOT know why the rows were rejected, do not run this — treat it as a
 * possible attempt to plant a way into an account.
 *
 * Usage:
 *   npx tsx scripts/retrust-credentials.ts --reason "restored .env without the credentials key" --actor jim
 */
// Loads the instance .env (FAST_STORAGE, keys) before anything reads it (#1609).
import '../src/bootstrap-env.js';
import WikiEngine from '../src/WikiEngine.js';
import { jobContextFromOperator, type JobContext } from '../src/context/JobContext.js';

interface AuthManagerLike {
  retrustRejectedCredentials(reason: string, ctx: JobContext): Promise<{ trusted: number; remaining: number }>;
}
interface AuditManagerLike {
  /** NOT optional: a security event that never reaches disk is worse than not acting. */
  flushAuditQueue: () => Promise<void>;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const reason = arg('reason')?.trim();
  const actor = arg('actor') ?? process.env.USER ?? 'unknown';
  if (!reason) {
    console.error('Re-trusting credentials must record a reason.');
    console.error('  npx tsx scripts/retrust-credentials.ts --reason "restored .env without the credentials key" --actor jim');
    process.exit(2);
  }

  const engine = new WikiEngine();
  await engine.initialize();
  const auth = engine.getManager('AuthManager') as AuthManagerLike | null;
  const audit = engine.getManager('AuditManager') as AuditManagerLike | null;
  if (!auth || !audit) {
    console.error('✗ AuthManager or AuditManager is not available.');
    process.exit(2);
  }

  const result = await auth.retrustRejectedCredentials(reason, jobContextFromOperator(actor, `operator command: ${reason}`));
  await audit.flushAuditQueue();
  console.log(`✓ ${result.trusted} credential row(s) re-trusted by ${actor}`);
  if (result.remaining > 0) console.log(`  ${result.remaining} row(s) stay quarantined: malformed, or a duplicate of a trusted credential.`);
  console.log('  Restart the server so it loads the re-signed rows.');
  process.exit(0);
}

void main();
