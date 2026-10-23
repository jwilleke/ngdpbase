/**
 * BackupManager's folder and file parts (#1876, #1985). Imported by
 * BackupManager alone (`scripts/check-backup-boundary.ts`): a manager
 * declares where its data lives (`BaseManager.backupFolders()`), an add-on's
 * `dataPath` counts for it, and BackupManager does the rest through here.
 *
 * - __Backup__: each declared folder is written as `<stem>.<part>.tar` beside
 *   the backup document (`treeArchive.ts`), streamed, bytes as stored, and
 *   the manager's entry records it. With `NGDPBASE_BACKUP_KEY` set it is
 *   encrypted under it (#1561) and named `<stem>.<part>.tar.enc`. A declared
 *   file is the same with the one file in the archive; one that requires the
 *   key is left out without it (the credentials store).
 * - __Restore__: each part's archive is extracted beside the live path, as
 *   `<path>.staged`, and the swaps are recorded in the site restore
 *   manifest. Nothing is written into the live data.
 * - __At start__: the staged copy is put in place before the owner reads it,
 *   when the whole site restore is there to apply (`siteRestore.ts`), and
 *   only for the paths the owner declares.
 *
 * The archive names and the entry shapes are those every backup since
 * v5.21 has (#1985 keeps them), so a backup made before the declarations
 * restores, and one made after can be restored by v5.25.0.
 */
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  BackupArchiveTarget, BackupData, BackupFolder, BackupFilePart, BackupPartRecord, ManagerBackupOptions, ManagerRestoreOptions, SiteRestoreStaging, StagedRestoreAtStart,
  StagedSwap
} from '../managers/BaseManager.js';
import logger from './logger.js';
import { extractTreeArchive, vanishedNote, writeTreeArchive } from './treeArchive.js';
import { applyPartAtStart, readSiteRestore, siteRestoreFile, stagedPathFor } from './siteRestore.js';
import { BACKUP_KEY_ENV, backupKeyFingerprint, currentBackupKey, LEFT_OUT_FOR_NO_KEY } from './backupKey.js';
import { ENCRYPTED_SUFFIX } from './backupCrypto.js';

/** A folder or file part's record in the backup document (the name every backup since v5.21 used). */
export type DirectoryBackupData = BackupPartRecord;

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

/** `ManagerBackupOptions.archive`: one more archive beside the document, for a manager whose files are not a declared part. */
export function archiveWriter(directory: string, stem: string): (part: string) => BackupArchiveTarget {
  return (part) => {
    const target = archiveTarget(stem, part);
    return { ...target, path: path.join(directory, target.archive) };
  };
}

/** `ManagerRestoreOptions.readArchive`: an archive the backup names, checked, and the key to read it under. */
export function archiveReader(directory: string): NonNullable<ManagerRestoreOptions['readArchive']> {
  return (manager, archive, keyFingerprint) => {
    if (!isArchiveName(archive)) {
      throw new Error(`The backup names ${manager}'s archive '${String(archive)}', which is not a file in the backup directory; nothing was staged`);
    }
    return { path: path.join(directory, archive), backupKey: archiveReadKey(manager, { keyFingerprint }) };
  };
}

function requireBackupManager(manager: string, options?: ManagerBackupOptions): asserts options is ManagerBackupOptions {
  if (!options?.directory || !options.stem) {
    throw new Error(`${manager} writes its files beside the backup document, so it is backed up through BackupManager (#1876)`);
  }
}

function isFilePart(part: BackupFolder): part is BackupFilePart {
  return 'file' in part;
}

/** The live path a declared part names: its folder or its file. */
export function livePathOf(part: BackupFolder): string | null {
  return isFilePart(part) ? part.file : part.folder;
}

/** What backing up a manager's declared parts wrote: each part's record (null when left out), and what to tell admins. */
export interface DeclaredPartsBackup {
  records: Record<string, BackupPartRecord | null>;
  warnings: string[];
  notes: string[];
}

/**
 * Back up a manager's declared parts beside the document BackupManager is
 * writing. Throws outside BackupManager: the files go beside a document,
 * never into it. A part that fails throws, and the manager's entry is then
 * an error, as when its own `backup()` throws.
 */
export async function backupDeclaredParts(manager: string, declared: BackupFolder[], options: ManagerBackupOptions | undefined): Promise<DeclaredPartsBackup> {
  requireBackupManager(manager, options);
  const out: DeclaredPartsBackup = { records: {}, warnings: [], notes: [] };
  for (const part of declared) {
    if (isFilePart(part)) await backupFilePart(manager, part, options, out);
    else await backupFolderPart(manager, part, options, out);
  }
  return out;
}

async function backupFolderPart(manager: string, part: Extract<BackupFolder, { folder: unknown }>, options: ManagerBackupOptions, out: DeclaredPartsBackup): Promise<void> {
  if (!part.folder) {
    out.records[part.part] = null;
    out.notes.push(`${manager} has no folder configured`);
    return;
  }
  const target = archiveTarget(options.stem, part.part);
  const outcome = await writeTreeArchive(path.join(options.directory, target.archive), part.folder, { backupKey: target.backupKey, exclude: part.exclude });
  out.records[part.part] = { format: 1, archive: target.archive, files: outcome.files, bytes: outcome.bytes, ...(target.keyFingerprint ? { keyFingerprint: target.keyFingerprint } : {}) };
  const warnings = outcome.skipped.map((s) => `${s} in ${part.folder} is not a file or a folder, so it was left out`);
  for (const w of warnings) logger.error(`[${manager}] ${w}`);
  out.warnings.push(...warnings);
  logger.info(`[${manager}] Backed up ${outcome.files} file(s), ${(outcome.bytes / 1024).toFixed(1)} KB, as ${target.archive} (#1876)${vanishedNote(outcome.vanished)}`);
}

/**
 * One file, encrypted under the backup key, as `<stem>.<part>.tar.enc`. With
 * `requireKey` and no key the file is left out: its record is null and a
 * warning says why (#1876: the credentials store is never in a backup
 * unencrypted).
 */
async function backupFilePart(manager: string, part: BackupFilePart, options: ManagerBackupOptions, out: DeclaredPartsBackup): Promise<void> {
  if (!part.file) {
    out.records[part.part] = null;
    out.notes.push(`${manager} has no ${part.what} configured`);
    return;
  }
  const target = archiveTarget(options.stem, part.part);
  if (part.requireKey && !target.backupKey) {
    const warning = `${LEFT_OUT_FOR_NO_KEY}the ${part.what} was left out: it is only ever backed up encrypted under the backup key (#1876)`;
    logger.error(`[${manager}] ${warning}`);
    out.records[part.part] = null;
    out.warnings.push(warning);
    return;
  }
  const entries = existsSync(part.file) ? [path.basename(part.file)] : [];
  const outcome = await writeTreeArchive(path.join(options.directory, target.archive), path.dirname(part.file), { backupKey: target.backupKey, entries });
  logger.info(`[${manager}] Backed up the ${part.what} (${outcome.files} file, ${(outcome.bytes / 1024).toFixed(1)} KB) as ${target.archive} (#1876)${vanishedNote(outcome.vanished)}`);
  out.records[part.part] = { format: 1, archive: target.archive, files: outcome.files, bytes: outcome.bytes, ...(target.keyFingerprint ? { keyFingerprint: target.keyFingerprint } : {}) };
}

/**
 * Put the declared parts' records into a manager's entry, in the shape
 * every backup has had: the entry's `data` is the record when the manager
 * has no data of its own and declares one part (roles, persons, …, an
 * add-on's folder); otherwise each record is `data[<part>]` beside the
 * manager's own data (the credentials store beside the provider list).
 */
export function placePartRecords(entry: BackupData, declared: BackupFolder[], parts: DeclaredPartsBackup): BackupData {
  const own = entry.data;
  const data = declared.length === 1 && (own === null || own === undefined)
    ? parts.records[declared[0].part] ?? null
    : { ...(own && typeof own === 'object' ? own as Record<string, unknown> : {}), ...parts.records };
  const warnings = [...(entry.warnings ?? []), ...parts.warnings];
  const note = [entry.note, ...parts.notes].filter(Boolean).join('; ');
  return { ...entry, data, ...(warnings.length > 0 ? { warnings } : {}), ...(note ? { note } : {}) };
}

/** A declared part's record in a manager's entry, read the way `placePartRecords` wrote it. */
export function partRecordIn(entry: BackupData | undefined, declared: BackupFolder[], part: string): unknown {
  const data = entry?.data;
  if (declared.length === 1 && isPartRecord(data)) return data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>)[part] : undefined;
}

function isPartRecord(value: unknown): value is BackupPartRecord {
  return Boolean(value) && typeof value === 'object' && (value as BackupPartRecord).format === 1 && 'archive' in (value as object);
}

function requireSiteRestore(manager: string, options?: ManagerRestoreOptions): asserts options is ManagerRestoreOptions & { siteRestore: SiteRestoreStaging } {
  if (!options?.siteRestore || !options.directory) {
    throw new Error(`${manager}'s restore is staged with the rest of the site, so it is restored through BackupManager (#1876)`);
  }
}

/** The archive a part's record names, checked: format, a bare name, and the key it needs. */
function readablePart(manager: string, record: unknown): { data: BackupPartRecord; backupKey?: string } {
  if (!isPartRecord(record)) {
    throw new Error(`The backup holds no ${manager} files (it was taken before they were backed up, #1876); nothing was staged`);
  }
  if (!isArchiveName(record.archive)) {
    throw new Error(`The backup names ${manager}'s archive '${String(record.archive)}', which is not a file in the backup directory; nothing was staged`);
  }
  return { data: record, backupKey: archiveReadKey(manager, record) };
}

/**
 * Stage a manager's declared parts from its entry in a backup, for the next
 * start: each archive is extracted to `<path>.staged`, and the swaps are
 * recorded in the site restore together. Throws — staging nothing, and
 * removing what it extracted — outside a site restore, for a backup without
 * a part that is not optional, or for an archive that is missing, unsafe,
 * or under another key. Returns the parts the backup left out.
 */
export async function stageDeclaredParts(manager: string, declared: BackupFolder[], entry: BackupData | undefined, options: ManagerRestoreOptions | undefined): Promise<{ leftOut: string[] }> {
  requireSiteRestore(manager, options);
  const swaps: StagedSwap[] = [];
  const leftOut: string[] = [];
  try {
    for (const part of declared) {
      const record = partRecordIn(entry, declared, part.part);
      const live = livePathOf(part);
      if (!isPartRecord(record) && (part.optional || isFilePart(part))) {
        logger.warn(`[${manager}] The backup holds no ${part.part} part (left out when it was taken); this site's is kept, and named as not restored (#1876)`);
        leftOut.push(part.part);
        continue;
      }
      if (!live) throw new Error(`${manager} has no ${isFilePart(part) ? part.what : 'folder'} configured; nothing was staged`);
      const { data, backupKey } = readablePart(manager, record);
      const staged = stagedPathFor(live);
      swaps.push({ live, staged });
      if (isFilePart(part)) await stageOneFile(live, path.join(options.directory, data.archive), backupKey, part.whenAbsent);
      else await extractTreeArchive(path.join(options.directory, data.archive), staged, { backupKey });
    }
    if (swaps.length > 0) options.siteRestore.record(swaps);
  } catch (err) {
    for (const s of swaps) rmSync(s.staged, { recursive: true, force: true });
    throw err;
  }
  for (const s of swaps) logger.warn(`[${manager}] ${path.basename(s.live)} staged as ${path.basename(s.staged)} — applied at the next start with the rest of the site restore (#1876)`);
  return { leftOut };
}

/**
 * One file from its archive as `<file>.staged`. When the file was absent at
 * backup time the archive holds nothing, and `whenAbsent` is staged in its
 * place (an empty store), so the restore still puts the site back as it was.
 */
async function stageOneFile(file: string, archive: string, backupKey: string | undefined, whenAbsent: string): Promise<void> {
  const staged = stagedPathFor(file);
  const tmp = `${staged}.extract`;
  try {
    const name = path.basename(file);
    const { files } = await extractTreeArchive(archive, tmp, { backupKey, select: (rel) => rel === name });
    rmSync(staged, { force: true });
    if (files === 1) renameSync(path.join(tmp, name), staged);
    else writeFileSync(staged, whenAbsent, { mode: 0o600 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Stage one file from a backup for the next start and record the swap: the
 * instance `.env`, BackupManager's own part.
 */
export async function stageFilePart(manager: string, file: string, data: BackupPartRecord, options: ManagerRestoreOptions | undefined, { whenAbsent }: { whenAbsent: string }): Promise<void> {
  await stageDeclaredParts(manager, [{ part: 'file', file, what: path.basename(file), whenAbsent }], { managerName: manager, timestamp: '', data }, options);
}

/**
 * Put a staged restore of a manager's declared parts in place, at start,
 * before the manager reads them. Only the paths it declares may be
 * replaced, whatever the manifest says; a staged copy no committed restore
 * names (an interrupted staging) is set aside. Loud when something was
 * staged but not applied. Null when there was nothing to do.
 */
export function applyDeclaredPartsAtStart(manager: string, declared: BackupFolder[], configManager: Parameters<typeof siteRestoreFile>[0]): StagedRestoreAtStart | null {
  const lives = declared.map(livePathOf).filter((p): p is string => Boolean(p)).map((p) => path.resolve(p));
  if (lives.length === 0) return null;
  const file = siteRestoreFile(configManager);
  let backupTakenAt: string | undefined;
  try {
    const manifest = readSiteRestore(file);
    if (manifest?.state === 'staged' && manifest.parts.some((p) => p.manager === manager && !p.status)) backupTakenAt = manifest.backup;
  } catch { /* the gate below says so */ }
  const outcome = applyPartAtStart(file, manager, {
    allowed: (swap) => lives.includes(path.resolve(swap.live)),
    strays: () => lives.map(stagedPathFor).filter((p) => existsSync(p))
  });
  if (!outcome) return null;
  if (outcome.refused) logger.error(`[${manager}] A staged restore was NOT applied: ${outcome.refused} (#1876)`);
  for (const a of outcome.applied) logger.warn(`[${manager}] Restore applied: ${a.live} (previous kept as ${path.basename(a.kept)}) (#1876)`);
  return { ...outcome, ...(backupTakenAt ? { backupTakenAt } : {}) };
}
