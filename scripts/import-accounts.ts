#!/usr/bin/env tsx
/**
 * Bring accounts from another system onto this site (#2075).
 *
 * Reads a JSON or CSV list of `{ username, email, displayName?, roles?,
 * isTest?, createdAt? }` and hands it to `UserManager.importAccounts`, which
 * checks every row and creates each account through `createUser`: the
 * username kept, no password and no passkey carried over, an identity record
 * made as for any account. Each creation is recorded as `user-create` by the
 * system principal, with a reason naming the file and the operator; the run is
 * summed up as `user-import`.
 *
 * By default a DRY RUN: nothing is written or recorded, and the report says
 * what would be created and why each other row would not. `--apply` creates.
 * An existing username is skipped and left as it is, so a second run is safe.
 *
 * Usage:
 *   npm run accounts:import -- accounts.csv                       # dry run
 *   npm run accounts:import -- accounts.csv --apply --operator jim
 *   npm run accounts:import -- accounts.json --apply --invite --operator jim
 *   (a built install: node dist/scripts/import-accounts.js accounts.csv ...)
 *
 * Options:
 *   --apply          create the accounts; without it nothing is changed
 *   --invite         send each created account the invitation to set up its
 *                    sign-in (needs working email; the report says who was not invited)
 *   --allow-admin    let a row carry the admin role (otherwise such a row is refused)
 *   --operator <n>   who is running it, for the record (default: $USER)
 *
 * It boots the site's engine on the instance's data (run it from the instance
 * directory, with the environment the server uses; `.env` is loaded as the app
 * loads it). The site must be STOPPED: a running server holds the user store
 * and the credentials store in memory and would overwrite what this writes.
 * It refuses to run while the server's PID lock names a live process.
 *
 * CSV: a header row naming the columns; `roles` holds role names separated by
 * `;` or `|`; `isTest` is true/false (or yes/no, 1/0); an empty cell is absent.
 */
// Loads the instance .env (FAST_STORAGE, keys) before anything reads it (#1609).
import '../src/bootstrap-env.js';
import fs from 'fs';
import path from 'path';
import { pidLockPath } from '../src/utils/pidLock.js';

/** One CSV record into cells: commas, double-quoted cells, `""` for a quote. */
function splitCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      record.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(cell); cell = '';
      if (record.some((v) => v.trim() !== '')) records.push(record);
      record = [];
    } else {
      cell += c;
    }
  }
  record.push(cell);
  if (record.some((v) => v.trim() !== '')) records.push(record);
  return records;
}

const TRUE_WORDS = ['true', 'yes', '1'];
const FALSE_WORDS = ['false', 'no', '0'];

/** A CSV cell as the import reads it: roles a list, isTest a boolean when it is one of the words. */
function csvValue(column: string, cell: string): unknown {
  const value = cell.trim();
  if (column === 'roles') return value.split(/[;|]/).map((r) => r.trim()).filter((r) => r !== '');
  if (column === 'isTest') {
    const word = value.toLowerCase();
    return TRUE_WORDS.includes(word) ? true : FALSE_WORDS.includes(word) ? false : value;
  }
  return value;
}

/**
 * The rows of an import file: a JSON array, or CSV with a header row. The
 * rows are not checked here; `UserManager.importAccounts` checks every one.
 */
export function parseAccountFile(text: string, fileName: string): unknown[] {
  if (fileName.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`${fileName} is not a JSON list of accounts`);
    return parsed;
  }
  // A byte-order mark (U+FEFF) a spreadsheet may write is not part of the first column's name.
  const [header, ...records] = splitCsv(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  if (!header) return [];
  const columns = header.map((h) => h.trim());
  return records.map((cells) => {
    const row: Record<string, unknown> = {};
    columns.forEach((column, i) => {
      const cell = cells[i] ?? '';
      if (column !== '' && cell.trim() !== '') row[column] = csvValue(column, cell);
    });
    return row;
  });
}

/** The PID of a live server started from `dir` (its own lock, or server.sh's), or null. */
export function runningServerPid(dir: string): number | null {
  for (const file of [pidLockPath(dir), path.join(dir, '.ngdpbase.pid')]) {
    let pid: number;
    try { pid = Number(fs.readFileSync(file, 'utf8').trim()); } catch { continue; }
    if (!pid) continue;
    try { process.kill(pid, 0); return pid; } catch { /* not running */ }
  }
  return null;
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const valued = new Set(['--operator']);
  const file = argv.find((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1] ?? ''));
  if (!file) {
    console.error('Usage: npm run accounts:import -- <accounts.csv|accounts.json> [--apply] [--invite] [--allow-admin] [--operator <name>]');
    process.exit(2);
  }
  const apply = argv.includes('--apply');
  const options = { apply, invite: argv.includes('--invite'), allowAdmin: argv.includes('--allow-admin') };
  const operator = arg(argv, 'operator') ?? process.env.USER ?? 'unknown';
  const rows = parseAccountFile(fs.readFileSync(file, 'utf8'), file);

  const pid = runningServerPid(process.cwd());
  if (pid) {
    console.error(`✗ A server from this directory is running (PID ${pid}). Stop the site first: it holds the user store in memory and would overwrite the imported accounts.`);
    process.exit(2);
  }

  const { default: WikiEngine } = await import('../src/WikiEngine.js');
  const { systemContext } = await import('../src/context/bootActions.js');
  const engine = new WikiEngine();
  await engine.initialize();
  const users = engine.getManager('UserManager') as import('../src/managers/UserManager.js').default | null;
  const audit = engine.getManager('AuditManager') as { flushAuditQueue?: () => Promise<void> } | null;
  if (!users) {
    console.error('✗ UserManager is not available.');
    process.exit(2);
  }

  const source = `${path.basename(file)} by ${operator}`;
  // The system principal acts, at an operator's command; the reason names both.
  const ctx = { ...systemContext(engine, `account import from ${path.resolve(file)}, run by ${operator}`), origin: 'operator' as const };
  const report = await users.importAccounts(rows, { ...options, source }, ctx);
  await audit?.flushAuditQueue?.();

  const c = report.counts;
  console.log(`\nAccount import from ${file}${apply ? '' : ' (DRY RUN: nothing changed; --apply creates)'}`);
  for (const e of report.entries) {
    const what = { create: 'would create', created: 'created', skipped: 'skipped', refused: 'REFUSED', failed: 'FAILED' }[e.status];
    const detail = [e.roles ? `roles: ${e.roles.join(', ')}` : '', e.reason ?? '', ...(e.notes ?? [])].filter(Boolean).join('; ');
    const invite = e.invitation ? ` [invitation: ${e.invitation.outcome.replace('-', ' ')}${e.invitation.reason ? ` (${e.invitation.reason})` : ''}]` : '';
    console.log(`  row ${String(e.row).padStart(3)}  ${what.padEnd(12)} ${e.username || '(no username)'}${detail ? `  ${detail}` : ''}${invite}`);
  }
  console.log(`\n${c.rows} row(s): ${apply ? `${c.created} created` : `${c.create} to create`}, ${c.skipped} skipped (already exist), ${c.refused} refused, ${c.failed} failed.`);
  if (options.invite) {
    console.log(report.invitationsUnavailable
      ? `No invitations: ${report.invitationsUnavailable}`
      : `Invitations: ${c.invited} sent, ${c.notInvited} not sent.`);
  }
  if (apply) console.log('Start the site again to serve the new accounts.');

  await engine.shutdown().catch(() => undefined);
  process.exit(c.refused + c.failed > 0 ? 1 : 0);
}

if (process.argv[1] && /import-accounts\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    console.error('✗ import-accounts failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
