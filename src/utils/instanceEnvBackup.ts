/**
 * The instance `.env` in a backup, and its staged restore (#1876, operator
 * plan "one thing to save", 2026-10-20).
 *
 * `<FAST_STORAGE>/.env` holds the keys the site made for itself and the ones
 * the operator put there: the database key, the credentials key, the session
 * secret, the OpenID Connect keys, mail and add-on secrets. A backup carries
 * it, encrypted under the backup key, __without the backup key's own line__:
 * that one key is what the operator saves off the server, and a backup that
 * held it would hold the key to itself.
 *
 * A restore stages it as `<FAST_STORAGE>/.env.staged` with the rest of the
 * site restore. It is applied at the very start of the process
 * (`bootstrap-env.ts`), before the file is loaded, because every key in it is
 * read from the environment from then on. Two lines are always kept from the
 * live file, never taken from the backup:
 *
 * - `NGDPBASE_BACKUP_KEY` — the key this site's backups are made under;
 * - `NGDPBASE_DATABASE_KEY` — the restored databases are staged under the
 *   site's own database key (`DatabaseManager.restore`), so the key they open
 *   with is the live one.
 *
 * Everything here is synchronous and depends on nothing but the filesystem:
 * it runs before the logger, the configuration or any manager exists.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { BACKUP_KEY_ENV } from './backupKey.js';
import { DATABASE_KEY_ENV } from './databaseKey.js';
import { configFilePaths, readConfigFilesSync } from './configFiles.js';
import { applyPartAtStart, gatePart, SITE_RESTORE_MANIFEST_KEY, stagedPathFor } from './siteRestore.js';

/** The part's name in the site restore manifest: BackupManager owns the `.env` part. */
export const INSTANCE_ENV_PART = 'BackupManager';

/** The lines a restore keeps from the live file, never from the backup. */
export const KEPT_ON_RESTORE: readonly string[] = [BACKUP_KEY_ENV, DATABASE_KEY_ENV];

/** The instance `.env`: the one file ngdpbase writes generated secrets into (#1194). */
export function instanceEnvPath(instanceDataDir: string): string {
  return path.join(instanceDataDir, '.env');
}

/**
 * The names the instance `.env` sets, sorted, read the way the boot loads it
 * (`dotenv.parse`, `bootstrap-env.ts`): never a value (#1976).
 */
export function envKeyNames(content: string): string[] {
  return Object.keys(dotenv.parse(content)).sort();
}

/** A short fingerprint of a set of `.env` names (#1976): the first 16 hex digits of a SHA-256 of the sorted names, one per line. */
export function envKeyNamesFingerprint(names: readonly string[]): string {
  return createHash('sha256').update([...names].sort().join('\n')).digest('hex').slice(0, 16);
}

function assigns(line: string, names: readonly string[]): boolean {
  const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
  return m !== null && names.includes(m[1]);
}

/** The file without any line assigning one of `names`. */
export function withoutAssignments(content: string, names: readonly string[]): string {
  return content.split('\n').filter((line) => !assigns(line, names)).join('\n');
}

/** What goes into a backup: the file without the backup key's line. */
export function envForBackup(content: string): string {
  return withoutAssignments(content, [BACKUP_KEY_ENV]);
}

/**
 * The file a restore puts in place: the backup's, without the kept names,
 * then the live file's lines for them (a name the live file does not set
 * stays unset).
 */
export function mergeRestoredEnv(restored: string, live: string): string {
  const kept = live.split('\n').filter((line) => assigns(line, KEPT_ON_RESTORE));
  const body = withoutAssignments(restored, KEPT_ON_RESTORE).replace(/\n*$/, '\n');
  return kept.length === 0 ? body : `${body}# Kept from this site when a backup was restored (#1876): the backup key, and the database key the restored databases were staged under.\n${kept.join('\n')}\n`;
}

/**
 * The site restore manifest's path, read before the configuration exists:
 * `ngdpbase.backup.restore-manifest` from the custom file, else the shipped
 * default, with `${FAST_STORAGE}` (and `./data`) resolved to the instance data
 * folder and `${SLOW_STORAGE}` to its variable — as `getResolvedDataPath`
 * resolves it once the configuration is loaded.
 */
export function siteRestoreFileAtBoot(instanceDataDir: string, env: Record<string, string | undefined> = process.env, cwd: string = process.cwd()): string {
  let value = '${FAST_STORAGE}/site-restore.json';
  try {
    const files = readConfigFilesSync(configFilePaths({ ...env, FAST_STORAGE: instanceDataDir }, cwd));
    const configured = files.customConfig[SITE_RESTORE_MANIFEST_KEY] ?? files.defaultConfig?.[SITE_RESTORE_MANIFEST_KEY];
    if (typeof configured === 'string' && configured.trim()) value = configured.trim();
  } catch { /* a configuration that can't be read: the default, as the boot will find out itself */ }
  const resolved = value
    .replace(/^\$\{(FAST_STORAGE|INSTANCE_DATA_FOLDER)\}/, instanceDataDir)
    .replace(/^\$\{SLOW_STORAGE\}/, env.SLOW_STORAGE ?? instanceDataDir)
    .replace(/^\.\/data(?=\/|$)/, instanceDataDir);
  return resolved.includes('${') ? path.join(instanceDataDir, path.basename(resolved)) : resolved;
}

export interface EnvRestoreOutcome {
  /** The file before and after, when the restore was applied: the boot reloads the environment from them. */
  applied?: { before: string; after: string };
  refused?: string;
}

/**
 * Put a staged `.env` in place at the start of the process, when the whole
 * site restore is there to apply (`siteRestore.ts`). The live file is kept as
 * `.env.pre-restore`; the kept lines are carried over first. Null when there
 * is nothing to do.
 */
export function applyInstanceEnvAtStart(instanceDataDir: string, siteFile: string): EnvRestoreOutcome | null {
  const live = instanceEnvPath(instanceDataDir);
  const staged = stagedPathFor(live);
  const gate = gatePart(siteFile, INSTANCE_ENV_PART);
  const before = existsSync(live) ? readFileSync(live, 'utf8') : '';
  if (gate.decision === 'apply' && gate.part.swaps.length === 1 && path.resolve(gate.part.swaps[0].live) === path.resolve(live) && existsSync(staged)) {
    writeFileSync(staged, mergeRestoredEnv(readFileSync(staged, 'utf8'), before), { mode: 0o600 });
  }
  const outcome = applyPartAtStart(siteFile, INSTANCE_ENV_PART, {
    allowed: (swap) => path.resolve(swap.live) === path.resolve(live),
    strays: () => (existsSync(staged) ? [staged] : [])
  });
  if (!outcome) return null;
  if (outcome.refused) return { refused: outcome.refused };
  return { applied: { before, after: existsSync(live) ? readFileSync(live, 'utf8') : '' } };
}
