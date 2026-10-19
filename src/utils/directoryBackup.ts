/**
 * Backup and staged restore for a manager whose data is one folder of files
 * (#1876): role membership (`roles/`), persons, organizations, and the
 * footnotes and comments of public pages. The owning manager calls these from
 * its own `backup()`, `restore()` and `initialize()`; nothing else touches its
 * folder.
 *
 * - `backup()` writes the folder as `<stem>.<part>.tar` beside the backup
 *   document (`treeArchive.ts`), streamed, bytes as stored, and the
 *   manager's entry in the document names it.
 * - `restore()` extracts that archive to `<folder>.staged` and records the
 *   swap in the site restore manifest. It never writes into the folder.
 * - `initialize()` applies the swap before the manager reads the folder, when
 *   the whole site restore is there to apply (`siteRestore.ts`).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { BackupData, ManagerBackupOptions, ManagerRestoreOptions } from '../managers/BaseManager.js';
import logger from './logger.js';
import { extractTreeArchive, writeTreeArchive } from './treeArchive.js';
import { applyPartAtStart, recordStagedPart, siteRestoreFile, stagedPathFor, type PartOutcome } from './siteRestore.js';

/** A folder part's `data` in the backup document. */
export interface DirectoryBackupData {
  format: 1;
  /** The archive beside the document: `<stem>.<part>.tar`. */
  archive: string;
  files: number;
  bytes: number;
}

/** Whether `name` is a bare archive name in the backup directory, never a path. */
export function isArchiveName(name: unknown): name is string {
  return typeof name === 'string' && name.endsWith('.tar') && path.basename(name) === name && !name.startsWith('.');
}

/**
 * Back the folder up beside the document BackupManager is writing. Throws
 * outside BackupManager: the files go beside a document, never into it.
 */
export async function backupDirectoryPart(manager: string, part: string, folder: string | null, options?: ManagerBackupOptions): Promise<BackupData> {
  const base = { managerName: manager, timestamp: new Date().toISOString() };
  if (!options?.directory || !options.stem) {
    throw new Error(`${manager} writes its files beside the backup document, so it is backed up through BackupManager (#1876)`);
  }
  if (!folder) return { ...base, data: null, note: `${manager} has no folder configured` };
  const archive = `${options.stem}.${part}.tar`;
  const outcome = await writeTreeArchive(path.join(options.directory, archive), folder);
  const data: DirectoryBackupData = { format: 1, archive, files: outcome.files, bytes: outcome.bytes };
  const warnings = outcome.skipped.map((s) => `${s} in ${folder} is not a file or a folder, so it was left out`);
  for (const w of warnings) logger.error(`[${manager}] ${w}`);
  logger.info(`[${manager}] Backed up ${outcome.files} file(s), ${(outcome.bytes / 1024).toFixed(1)} KB, as ${archive} (#1876)`);
  return { ...base, data, ...(warnings.length > 0 ? { warnings } : {}) };
}

/**
 * Stage the folder from a backup for the next start: the archive is
 * extracted to `<folder>.staged`, and the swap recorded in the site restore.
 * Throws — staging nothing — outside a site restore, for a backup without
 * this part, or for an archive that is missing or unsafe.
 */
export async function stageDirectoryPart(manager: string, folder: string | null, backupData: BackupData, options?: ManagerRestoreOptions): Promise<void> {
  if (!options?.siteRestore || !options.directory) {
    throw new Error(`${manager}'s restore is staged with the rest of the site, so it is restored through BackupManager (#1876)`);
  }
  if (!folder) throw new Error(`${manager} has no folder configured; nothing was staged`);
  const data = backupData?.data as DirectoryBackupData | null | undefined;
  if (!data || data.format !== 1) {
    throw new Error(`The backup holds no ${manager} files (it was taken before they were backed up, #1876); nothing was staged`);
  }
  if (!isArchiveName(data.archive)) {
    throw new Error(`The backup names ${manager}'s archive '${String(data.archive)}', which is not a file in the backup directory; nothing was staged`);
  }
  const staged = stagedPathFor(folder);
  const { files } = await extractTreeArchive(path.join(options.directory, data.archive), staged);
  recordStagedPart(options.siteRestore, { manager, swaps: [{ live: folder, staged }] });
  logger.warn(`[${manager}] ${files} file(s) staged as ${path.basename(staged)} — applied at the next start with the rest of the site restore (#1876)`);
}

/**
 * Put a staged restore of the folder in place, at start, before the manager
 * reads it. Loud when something was staged but not applied.
 */
export function applyDirectoryPartAtStart(manager: string, folder: string, configManager: Parameters<typeof siteRestoreFile>[0]): PartOutcome | null {
  const outcome = applyPartAtStart(siteRestoreFile(configManager), manager, {
    allowed: (swap) => path.resolve(swap.live) === path.resolve(folder),
    strays: () => (existsSync(stagedPathFor(folder)) ? [stagedPathFor(folder)] : [])
  });
  if (!outcome) return null;
  if (outcome.refused) logger.error(`[${manager}] A staged restore was NOT applied: ${outcome.refused} (#1876)`);
  for (const a of outcome.applied) logger.warn(`[${manager}] Restore applied: ${a.live} (previous kept as ${path.basename(a.kept)}) (#1876)`);
  return outcome;
}
