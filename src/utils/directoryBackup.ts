/**
 * Backup and staged restore for a manager whose data is one folder of files
 * (#1876): role membership (`roles/`), persons, organizations, the footnotes
 * and comments of public pages, file-based job state, and an add-on's
 * `dataPath`; or one file (the credentials store). The owning manager calls
 * these from its own `backup()`, `restore()` and `initialize()`; nothing else
 * touches its data.
 *
 * - `backup()` writes the folder as `<stem>.<part>.tar` beside the backup
 *   document (`treeArchive.ts`), streamed, bytes as stored, and the
 *   manager's entry in the document names it. With `NGDPBASE_BACKUP_KEY` set
 *   it is encrypted under it (#1561) and named `<stem>.<part>.tar.enc`.
 * - `restore()` extracts that archive to `<folder>.staged` and records the
 *   swap in the site restore manifest. It never writes into the folder.
 * - `initialize()` applies the swap before the manager reads the folder, when
 *   the whole site restore is there to apply (`siteRestore.ts`).
 */
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BackupData, ManagerBackupOptions, ManagerRestoreOptions } from '../managers/BaseManager.js';
import logger from './logger.js';
import { extractTreeArchive, writeTreeArchive } from './treeArchive.js';
import { applyPartAtStart, recordStagedPart, siteRestoreFile, stagedPathFor, type PartOutcome } from './siteRestore.js';
import { BACKUP_KEY_ENV, backupKeyFingerprint, currentBackupKey, LEFT_OUT_FOR_NO_KEY } from './backupKey.js';
import { ENCRYPTED_SUFFIX } from './backupCrypto.js';

/** A folder part's `data` in the backup document. */
export interface DirectoryBackupData {
  format: 1;
  /** The archive beside the document: `<stem>.<part>.tar`, or `.tar.enc` when encrypted. */
  archive: string;
  files: number;
  bytes: number;
  /** `backupKeyFingerprint()` of the key the archive is encrypted under; absent when it is not encrypted. */
  keyFingerprint?: string;
}

/** Whether `name` is a bare archive name in the backup directory, never a path. */
export function isArchiveName(name: unknown): name is string {
  return typeof name === 'string' && (name.endsWith('.tar') || name.endsWith(`.tar${ENCRYPTED_SUFFIX}`)) && path.basename(name) === name && !name.startsWith('.');
}

/**
 * The name and key for one archive of a backup: encrypted under the backup
 * key when it is set (#1561), plain otherwise. BackupManager says, once per
 * backup, that a backup without the key is not encrypted.
 */
export function archiveTarget(stem: string, part: string): { archive: string; backupKey?: string; keyFingerprint?: string } {
  const key = currentBackupKey();
  if (!key) return { archive: `${stem}.${part}.tar` };
  return { archive: `${stem}.${part}.tar${ENCRYPTED_SUFFIX}`, backupKey: key, keyFingerprint: backupKeyFingerprint(key) };
}

/**
 * The key to read an archive of a backup with, checked against the
 * fingerprint the backup recorded: a backup made under another key is
 * refused before anything is staged. None for a backup that was not
 * encrypted, which is then read as the plain archive it says it is.
 */
export function archiveReadKey(manager: string, data: { keyFingerprint?: string }): string | undefined {
  if (!data.keyFingerprint) return undefined;
  const key = currentBackupKey();
  if (!key) throw new Error(`${manager}'s files in this backup are encrypted under the backup key, and ${BACKUP_KEY_ENV} is not set; nothing was staged`);
  const now = backupKeyFingerprint(key);
  if (now !== data.keyFingerprint) {
    throw new Error(`${manager}'s files in this backup were made with a different backup key (fingerprint ${data.keyFingerprint}; ${BACKUP_KEY_ENV} now has ${now}). Set ${BACKUP_KEY_ENV} to the key it was made with; nothing was staged`);
  }
  return key;
}

function requireBackupManager(manager: string, options?: ManagerBackupOptions): asserts options is ManagerBackupOptions {
  if (!options?.directory || !options.stem) {
    throw new Error(`${manager} writes its files beside the backup document, so it is backed up through BackupManager (#1876)`);
  }
}

/**
 * Back the folder up beside the document BackupManager is writing. Throws
 * outside BackupManager: the files go beside a document, never into it.
 * `exclude` leaves out a path relative to the folder (posix form).
 */
export async function backupDirectoryPart(
  manager: string,
  part: string,
  folder: string | null,
  options?: ManagerBackupOptions,
  extra: { exclude?: (relative: string) => boolean } = {}
): Promise<BackupData> {
  const base = { managerName: manager, timestamp: new Date().toISOString() };
  requireBackupManager(manager, options);
  if (!folder) return { ...base, data: null, note: `${manager} has no folder configured` };
  const target = archiveTarget(options.stem, part);
  const outcome = await writeTreeArchive(path.join(options.directory, target.archive), folder, { backupKey: target.backupKey, exclude: extra.exclude });
  const data: DirectoryBackupData = { format: 1, archive: target.archive, files: outcome.files, bytes: outcome.bytes, ...(target.keyFingerprint ? { keyFingerprint: target.keyFingerprint } : {}) };
  const warnings = outcome.skipped.map((s) => `${s} in ${folder} is not a file or a folder, so it was left out`);
  for (const w of warnings) logger.error(`[${manager}] ${w}`);
  logger.info(`[${manager}] Backed up ${outcome.files} file(s), ${(outcome.bytes / 1024).toFixed(1)} KB, as ${target.archive} (#1876)${vanishedNote(outcome.vanished)}`);
  return { ...base, data, ...(warnings.length > 0 ? { warnings } : {}) };
}

/** The log's note of entries deleted while they were backed up (#1563): skipped, not a failure. */
export function vanishedNote(vanished: string[]): string {
  return vanished.length > 0 ? `; ${vanished.length} entr${vanished.length === 1 ? 'y' : 'ies'} deleted during the backup skipped (${vanished.slice(0, 5).join(', ')})` : '';
}

/** The archive a backup's entry names, checked: format, a bare name, and the key it needs. */
function readablePart(manager: string, backupData: BackupData): { data: DirectoryBackupData; backupKey?: string } {
  const data = backupData?.data as DirectoryBackupData | null | undefined;
  if (!data || data.format !== 1) {
    throw new Error(`The backup holds no ${manager} files (it was taken before they were backed up, #1876); nothing was staged`);
  }
  if (!isArchiveName(data.archive)) {
    throw new Error(`The backup names ${manager}'s archive '${String(data.archive)}', which is not a file in the backup directory; nothing was staged`);
  }
  return { data, backupKey: archiveReadKey(manager, data) };
}

function requireSiteRestore(manager: string, options?: ManagerRestoreOptions): asserts options is ManagerRestoreOptions & { siteRestore: string } {
  if (!options?.siteRestore || !options.directory) {
    throw new Error(`${manager}'s restore is staged with the rest of the site, so it is restored through BackupManager (#1876)`);
  }
}

/**
 * Stage the folder from a backup for the next start: the archive is
 * extracted to `<folder>.staged`, and the swap recorded in the site restore.
 * Throws — staging nothing — outside a site restore, for a backup without
 * this part, or for an archive that is missing, unsafe, or under another key.
 */
export async function stageDirectoryPart(manager: string, folder: string | null, backupData: BackupData, options?: ManagerRestoreOptions): Promise<void> {
  requireSiteRestore(manager, options);
  if (!folder) throw new Error(`${manager} has no folder configured; nothing was staged`);
  const { data, backupKey } = readablePart(manager, backupData);
  const staged = stagedPathFor(folder);
  const { files } = await extractTreeArchive(path.join(options.directory, data.archive), staged, { backupKey });
  recordStagedPart(options.siteRestore, { manager, swaps: [{ live: folder, staged }] });
  logger.warn(`[${manager}] ${files} file(s) staged as ${path.basename(staged)} — applied at the next start with the rest of the site restore (#1876)`);
}

/**
 * Put a staged restore of the folder in place, at start, before the manager
 * reads it. Loud when something was staged but not applied.
 */
export function applyDirectoryPartAtStart(manager: string, folder: string, configManager: Parameters<typeof siteRestoreFile>[0]): PartOutcome | null {
  return applyPathPartAtStart(manager, folder, configManager);
}

/** Apply a part that swaps exactly one path (a folder or a file), loud when it was not applied. */
function applyPathPartAtStart(manager: string, live: string, configManager: Parameters<typeof siteRestoreFile>[0]): PartOutcome | null {
  const outcome = applyPartAtStart(siteRestoreFile(configManager), manager, {
    allowed: (swap) => path.resolve(swap.live) === path.resolve(live),
    strays: () => (existsSync(stagedPathFor(live)) ? [stagedPathFor(live)] : [])
  });
  if (!outcome) return null;
  if (outcome.refused) logger.error(`[${manager}] A staged restore was NOT applied: ${outcome.refused} (#1876)`);
  for (const a of outcome.applied) logger.warn(`[${manager}] Restore applied: ${a.live} (previous kept as ${path.basename(a.kept)}) (#1876)`);
  return outcome;
}

// ---- One file (the credentials store) -------------------------------------

/**
 * Back one file up beside the document, encrypted under the backup key, as
 * `<stem>.<part>.tar.enc`. With `requireKey` and no key the file is left out:
 * `data` is null and a warning says why, so BackupManager reports the backup
 * incomplete (#1876: the credentials store is never in a backup unencrypted).
 */
export async function backupFilePart(
  manager: string,
  part: string,
  file: string | null,
  options: ManagerBackupOptions | undefined,
  { requireKey, what }: { requireKey: boolean; what: string }
): Promise<{ data: DirectoryBackupData | null; warnings: string[]; note?: string }> {
  requireBackupManager(manager, options);
  if (!file) return { data: null, warnings: [], note: `${manager} has no ${what} configured` };
  const target = archiveTarget(options.stem, part);
  if (requireKey && !target.backupKey) {
    const warning = `${LEFT_OUT_FOR_NO_KEY}the ${what} was left out: it is only ever backed up encrypted under the backup key (#1876)`;
    logger.error(`[${manager}] ${warning}`);
    return { data: null, warnings: [warning] };
  }
  const entries = existsSync(file) ? [path.basename(file)] : [];
  const outcome = await writeTreeArchive(path.join(options.directory, target.archive), path.dirname(file), { backupKey: target.backupKey, entries });
  logger.info(`[${manager}] Backed up the ${what} (${outcome.files} file, ${(outcome.bytes / 1024).toFixed(1)} KB) as ${target.archive} (#1876)${vanishedNote(outcome.vanished)}`);
  return {
    data: { format: 1, archive: target.archive, files: outcome.files, bytes: outcome.bytes, ...(target.keyFingerprint ? { keyFingerprint: target.keyFingerprint } : {}) },
    warnings: []
  };
}

/**
 * Stage one file from a backup as `<file>.staged`, and record the swap. When
 * the file was absent at backup time the archive holds nothing, and
 * `whenAbsent` is staged in its place (an empty store), so the restore still
 * puts the site back as it was.
 */
export async function stageFilePart(manager: string, file: string, data: DirectoryBackupData, options: ManagerRestoreOptions | undefined, { whenAbsent }: { whenAbsent: string }): Promise<void> {
  requireSiteRestore(manager, options);
  const { backupKey } = readablePart(manager, { managerName: manager, timestamp: '', data });
  const staged = stagedPathFor(file);
  const tmp = `${staged}.extract`;
  try {
    const name = path.basename(file);
    const { files } = await extractTreeArchive(path.join(options.directory, data.archive), tmp, { backupKey, select: (rel) => rel === name });
    rmSync(staged, { force: true });
    if (files === 1) renameSync(path.join(tmp, name), staged);
    else writeFileSync(staged, whenAbsent, { mode: 0o600 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  recordStagedPart(options.siteRestore, { manager, swaps: [{ live: file, staged }] });
  logger.warn(`[${manager}] ${path.basename(file)} staged — applied at the next start with the rest of the site restore (#1876)`);
}

/** Put a staged restore of one file in place, at start, before the manager reads it. */
export function applyFilePartAtStart(manager: string, file: string, configManager: Parameters<typeof siteRestoreFile>[0]): PartOutcome | null {
  return applyPathPartAtStart(manager, file, configManager);
}
