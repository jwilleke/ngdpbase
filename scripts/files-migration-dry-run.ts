#!/usr/bin/env tsx
/**
 * Files migration dry run (#1859, epic #1851).
 *
 * What copying today's attachments into files WOULD do, read through the
 * files door (`FileManager`, opened read-only): counts and sizes, owners
 * (with the configured owner mapping), name clashes per place with the
 * `-###` names they would get, the pages whose links would be rewritten,
 * and each vault's files as counts. It writes nothing: no file under the
 * data folders is created, changed or touched. Safe to run while the site
 * is up, and as often as wanted.
 *
 * The values are configuration (`ngdpbase.files.migration.*` in
 * app-custom-config.json): `owner-map`, `default-owner`,
 * `clash-suffix-digits`.
 *
 * Usage:
 *   npm run files:migration:dry
 *   npm run files:migration:dry -- --as jim     # who is running it (default: the shell user)
 */

// Loads .env (root and <FAST_STORAGE>/.env) before anything else evaluates,
// so the instance's data folders are the ones read (#1091).
import '../src/bootstrap-env.js';
import os from 'os';
import FileManager from '../src/managers/FileManager.js';
import { jobContextFromOperator } from '../src/context/JobContext.js';
import { formatFileMigrationReport } from '../src/utils/fileMigrationPlan.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--as');
  const operator = i !== -1 && argv[i + 1] ? argv[i + 1] : os.userInfo().username;
  const ctx = jobContextFromOperator(operator, 'files migration dry run (#1859)');

  const files = await FileManager.openForOperator();
  const report = await files.migrationDryRun(ctx);
  process.stdout.write(formatFileMigrationReport(report, [
    `Files migration dry run, ${new Date().toLocaleString()}, run by ${operator}`
  ]) + '\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`files migration dry run failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
