/**
 * Attachment files in a backup, and their staged restore (#1876).
 *
 * The backup document carries the shared pool's metadata; the files
 * themselves go beside it, as two archives (`src/utils/treeArchive.ts`):
 *
 * - `<stem>.attachments.tar` — the shared pool folder
 *   (`ngdpbase.attachment.provider.basic.storagedir`), without its
 *   thumbnails (`.thumbs`, made again on demand) and without the metadata
 *   file, which the document already holds.
 * - `<stem>.vault-attachments.tar` — every vault's files: each
 *   `vaults/{owner}/{store}/attachments/` folder and its `files-index.json`,
 *   relative to the pages folder. The bytes as stored: a sealed vault's
 *   files stay sealed, and nothing is decrypted.
 *
 * Both are written and read as streams, so no file is ever whole in memory.
 * With `NGDPBASE_BACKUP_KEY` set both are encrypted under it (#1561) and
 * named `.tar.enc`; a restore reads them only under the key they were made
 * with; BackupManager names each archive and checks its key (#1985).
 *
 * A restore stages, all or nothing with the rest of a site restore
 * (`src/utils/siteRestore.ts`): the pool is extracted to `<pool>.staged`
 * with the metadata written from the document; each vault's files to
 * `<store>/attachments.staged` and `<store>/files-index.json.staged`. A
 * vault whose files are not all sealed bytes is refused when the vault on
 * this site must be sealed (#1836): a restore never puts plaintext into a
 * sealed vault. A vault the backup has but this site no longer has is not
 * staged, and is named. The next start swaps each staged path in, before
 * the provider reads its metadata.
 */
import { existsSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import logger from '../utils/logger.js';
import { extractTreeArchive, listTreeArchive, readHead, vanishedDuringBackup, vanishedNote, writeTreeArchive } from '../utils/treeArchive.js';
import type { BackupArchiveTarget, ManagerRestoreOptions } from '../managers/BaseManager.js';
import { applyPartAtStart, recordStagedPart, stagedPathFor, type PartOutcome, type StagedSwap } from '../utils/siteRestore.js';
import { isSealedBytes } from '../utils/privateStoreCrypto.js';
import { vaultMustBeSealed } from '../utils/privateStoreFiles.js';
import {
  isSafePathSegment,
  isValidStoreId,
  privateStoreAttachmentsDir,
  privateStoreRoot,
  storeFileIndexPath,
  type PrivateStoreLayout
} from '../utils/privateStorePath.js';

/** Where the attachment files live on this site. */
export interface AttachmentFilePlaces {
  /** The shared pool folder. */
  pool: string;
  /** The shared pool's metadata file (inside the pool by default). */
  metadataFile: string;
  /** The pages folder, which holds the vaults. */
  pagesDirectory: string | null;
  layout: PrivateStoreLayout;
}

/** The files part of AttachmentManager's entry in the backup document. */
export interface AttachmentFilesBackupData {
  format: 1;
  pool: { archive: string; files: number; bytes: number };
  vaults: { archive: string; files: number; bytes: number; stores: string[] };
  /** `backupKeyFingerprint()` of the key both archives are encrypted under; absent when they are not. */
  keyFingerprint?: string;
}

export interface AttachmentFilesBackupOutcome {
  data: AttachmentFilesBackupData;
  /** Parts left out (a symbolic link, a vault folder whose name can't be a path segment), each named. */
  warnings: string[];
}

const THUMBS = '.thumbs';

/** `vaults/{owner}/{store}` for every vault folder on disk whose names are safe path segments; the others are named. */
function vaultStores(places: AttachmentFilePlaces): { stores: Array<{ owner: string; store: string }>; unsafe: string[] } {
  const stores: Array<{ owner: string; store: string }> = [];
  const unsafe: string[] = [];
  if (!places.pagesDirectory) return { stores, unsafe };
  const root = path.join(places.pagesDirectory, places.layout.privateRoot);
  if (!existsSync(root)) return { stores, unsafe };
  for (const owner of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
    if (!isSafePathSegment(owner)) { unsafe.push(owner); continue; }
    let owned;
    try {
      owned = readdirSync(path.join(root, owner), { withFileTypes: true });
    } catch (err) {
      if (vanishedDuringBackup(err)) continue; // #1563: deleted since the listing
      throw err;
    }
    for (const store of owned.filter((e) => e.isDirectory()).map((e) => e.name)) {
      if (!isValidStoreId(store)) continue;
      stores.push({ owner, store });
    }
  }
  return { stores, unsafe };
}

/** Write the attachment files beside the backup document: the pool, then every vault's. Never base64, never whole in memory. */
export async function backupAttachmentFiles(places: AttachmentFilePlaces, archive: (part: string) => BackupArchiveTarget): Promise<AttachmentFilesBackupOutcome> {
  const warnings: string[] = [];
  const metadataRel = path.relative(places.pool, places.metadataFile).split(path.sep).join('/');
  const poolTarget = archive('attachments');
  const poolArchive = poolTarget.archive;
  const backupKey = poolTarget.backupKey;
  const pool = await writeTreeArchive(poolTarget.path, places.pool, {
    backupKey,
    exclude: (rel) => rel === THUMBS || rel.startsWith(`${THUMBS}/`) || rel === metadataRel
  });
  for (const s of pool.skipped) warnings.push(`attachments: ${s} is not a file or a folder, so it was left out`);

  const { stores, unsafe } = vaultStores(places);
  for (const u of unsafe) warnings.push(`vault folder '${u}' is not a user name, so its files were left out`);
  const entries: string[] = [];
  const named: string[] = [];
  for (const { owner, store } of stores) {
    const pagesDirectory = places.pagesDirectory!;
    const dir = privateStoreAttachmentsDir(pagesDirectory, owner, store, places.layout);
    const index = storeFileIndexPath(pagesDirectory, owner, store, places.layout);
    const here = [dir, index].filter((p) => existsSync(p)).map((p) => path.relative(pagesDirectory, p));
    if (here.length === 0) continue;
    entries.push(...here);
    named.push(`${owner}/${store}`);
  }
  const vaultTarget = archive('vault-attachments');
  const vaultArchive = vaultTarget.archive;
  const vaults = await writeTreeArchive(vaultTarget.path, places.pagesDirectory ?? path.dirname(vaultTarget.path), { entries, backupKey });
  for (const s of vaults.skipped) warnings.push(`vault attachments: ${s} is not a file or a folder, so it was left out`);
  const vanished = [...pool.vanished, ...vaults.vanished];
  if (vanished.length > 0) logger.info(`[AttachmentManager] Backup${vanishedNote(vanished)}`);
  return {
    data: {
      format: 1,
      pool: { archive: poolArchive, files: pool.files, bytes: pool.bytes },
      vaults: { archive: vaultArchive, files: vaults.files, bytes: vaults.bytes, stores: named },
      ...(poolTarget.keyFingerprint ? { keyFingerprint: poolTarget.keyFingerprint } : {})
    },
    warnings
  };
}

/** The `vaults/{owner}/{store}` folders an archive holds, read as a stream. */
async function storesInArchive(archive: string, layout: PrivateStoreLayout, backupKey: string | undefined): Promise<Array<{ owner: string; store: string }>> {
  const seen = new Map<string, { owner: string; store: string }>();
  const bad: string[] = [];
  await listTreeArchive(archive, (entry) => {
    const parts = entry.path.replace(/\/$/, '').split('/');
    const folderAbove = entry.type === 'Directory' && parts.length < 4;
    if (parts[0] !== layout.privateRoot || (parts.length < 4 && !folderAbove)) {
      bad.push(`'${entry.path}' is not a vault's files`);
    } else if (parts.length >= 4) {
      const [, owner, store] = parts;
      if (!isSafePathSegment(owner) || !isValidStoreId(store)) bad.push(`'${owner}/${store}' can't be a vault`);
      else seen.set(`${owner}/${store}`, { owner, store });
    }
  }, { backupKey });
  if (bad.length > 0) throw new Error(`the vault files archive holds entries that don't belong in it: ${bad.slice(0, 5).join(', ')}`);
  return [...seen.values()];
}

/** Every regular file under `dir` (or `dir` itself), to check its first bytes. */
function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  if (statSync(dir).isFile()) return [dir];
  return (readdirSync(dir, { recursive: true }) as string[]).map((f) => path.join(dir, f)).filter((f) => statSync(f).isFile());
}

/** The files a vault must not hold in the clear (#1836): any that isn't sealed bytes. */
async function plaintextFiles(paths: string[]): Promise<string[]> {
  const plain: string[] = [];
  for (const file of paths.flatMap(filesUnder)) {
    if (!isSealedBytes(await readHead(file, 64))) plain.push(path.basename(file));
  }
  return plain;
}

/**
 * Stage the attachment files from a backup for the next start, and record
 * the part in the site restore. All or nothing: on any failure every staged
 * path is removed and nothing is recorded.
 *
 * @returns the vaults the backup holds that this site doesn't have (not staged).
 */
export async function stageAttachmentFiles(
  places: AttachmentFilePlaces,
  readArchive: NonNullable<ManagerRestoreOptions['readArchive']>,
  data: AttachmentFilesBackupData,
  metadataJson: string,
  siteRestore: string
): Promise<{ skippedVaults: string[] }> {
  // #1985: BackupManager checks each name (a bare file in the backup directory) and the key.
  const poolArchive = readArchive('AttachmentManager', data?.pool?.archive, data?.keyFingerprint);
  const vaultArchive = readArchive('AttachmentManager', data?.vaults?.archive, data?.keyFingerprint);
  const backupKey = poolArchive.backupKey;
  const swaps: StagedSwap[] = [];
  const skippedVaults: string[] = [];
  try {
    // The shared pool, with its metadata from the document.
    const poolStaged = stagedPathFor(places.pool);
    swaps.push({ live: places.pool, staged: poolStaged });
    await extractTreeArchive(poolArchive.path, poolStaged, { backupKey });
    const metadataRel = path.relative(places.pool, places.metadataFile);
    if (!metadataRel.startsWith('..') && !path.isAbsolute(metadataRel)) {
      const target = path.join(poolStaged, metadataRel);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, metadataJson, { mode: 0o600 });
    } else {
      const staged = stagedPathFor(places.metadataFile);
      writeFileSync(staged, metadataJson, { mode: 0o600 });
      swaps.push({ live: places.metadataFile, staged });
    }

    // Each vault's files, as stored.
    const stores = places.pagesDirectory ? await storesInArchive(vaultArchive.path, places.layout, backupKey) : [];
    for (const { owner, store } of stores) {
      const pagesDirectory = places.pagesDirectory!;
      if (!existsSync(privateStoreRoot(pagesDirectory, owner, store, places.layout))) {
        skippedVaults.push(`${owner}/${store}`);
        continue;
      }
      const dir = privateStoreAttachmentsDir(pagesDirectory, owner, store, places.layout);
      const index = storeFileIndexPath(pagesDirectory, owner, store, places.layout);
      const prefix = `${places.layout.privateRoot}/${owner}/${store}/`;
      const attachmentsRel = `${prefix}${places.layout.attachmentsDir}/`;
      const indexRel = `${prefix}${places.layout.files.storefiles}`;
      const staged: string[] = [];
      if (await archiveHas(vaultArchive.path, attachmentsRel, backupKey)) {
        const dirStaged = stagedPathFor(dir);
        swaps.push({ live: dir, staged: dirStaged });
        await extractTreeArchive(vaultArchive.path, dirStaged, { select: (rel) => rel.startsWith(attachmentsRel), strip: 4, backupKey });
        staged.push(dirStaged);
      }
      if (await archiveHas(vaultArchive.path, indexRel, backupKey)) {
        const tmp = path.join(path.dirname(index), `.${path.basename(index)}.restore`);
        await extractTreeArchive(vaultArchive.path, tmp, { select: (rel) => rel === indexRel, strip: 3, backupKey });
        const indexStaged = stagedPathFor(index);
        rmSync(indexStaged, { force: true });
        renameSync(path.join(tmp, path.basename(index)), indexStaged);
        rmSync(tmp, { recursive: true, force: true });
        swaps.push({ live: index, staged: indexStaged });
        staged.push(indexStaged);
      }
      if (await vaultMustBeSealed(pagesDirectory, owner, store, places.layout)) {
        const plain = await plaintextFiles(staged);
        if (plain.length > 0) {
          throw new Error(`vault ${owner}/${store} must be sealed, but its files in the backup are not (${plain.slice(0, 5).join(', ')}): a restore never puts plaintext into a sealed vault (#1836)`);
        }
      }
    }
    recordStagedPart(siteRestore, { manager: 'AttachmentManager', swaps });
    return { skippedVaults };
  } catch (err) {
    for (const s of swaps) rmSync(s.staged, { recursive: true, force: true });
    throw new Error(`The attachment files were not staged: ${(err as Error).message}`, { cause: err });
  }
}

/** Whether the archive holds an entry at `rel` (or under it, for a folder). */
async function archiveHas(archive: string, rel: string, backupKey: string | undefined): Promise<boolean> {
  let found = false;
  await listTreeArchive(archive, (e) => { if (e.path === rel || e.path.startsWith(rel)) found = true; }, { backupKey });
  return found;
}

/**
 * Put staged attachment files in place, at start, before the metadata is
 * read: only the pool, its metadata file and vault attachment paths may be
 * replaced, whatever the manifest says.
 */
export function applyAttachmentFilesAtStart(places: AttachmentFilePlaces, siteRestore: string): PartOutcome | null {
  const pool = path.resolve(places.pool);
  const metadataFile = path.resolve(places.metadataFile);
  const isVaultPath = (live: string): boolean => {
    if (!places.pagesDirectory) return false;
    const rel = path.relative(path.resolve(places.pagesDirectory), path.resolve(live)).split(path.sep);
    return rel.length === 4 && rel[0] === places.layout.privateRoot && isSafePathSegment(rel[1]) && isValidStoreId(rel[2])
      && (rel[3] === places.layout.attachmentsDir || rel[3] === places.layout.files.storefiles);
  };
  return applyPartAtStart(siteRestore, 'AttachmentManager', {
    allowed: (swap) => {
      const live = path.resolve(swap.live);
      return live === pool || live === metadataFile || isVaultPath(live);
    },
    strays: () => {
      const found = [stagedPathFor(places.pool), stagedPathFor(places.metadataFile)].filter((p) => existsSync(p));
      for (const { owner, store } of vaultStores(places).stores) {
        for (const live of [privateStoreAttachmentsDir(places.pagesDirectory!, owner, store, places.layout), storeFileIndexPath(places.pagesDirectory!, owner, store, places.layout)]) {
          if (existsSync(stagedPathFor(live))) found.push(stagedPathFor(live));
        }
      }
      return found;
    }
  });
}
