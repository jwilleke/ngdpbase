/**
 * A media folder must never reach private storage (#2195).
 *
 * The media scanner indexes every file under its folders, and a file's path
 * names its owner, vault id and file name. A folder that equals, contains or
 * sits inside the vaults or the shared-folder storage would put those paths in
 * the media index, the skip report and the admin notices. MediaManager refuses
 * such a folder, the configuration screen refuses saving one, and the scanner
 * never walks under these roots even if one gets past both.
 *
 * Paths are compared as the filesystem has them: real paths, so a symlink, a
 * trailing slash, `..` or a case difference on a case-insensitive volume all
 * resolve to the same directory. `..` is resolved by the filesystem, after
 * the symlink before it, as the kernel does. A path that does not exist yet
 * is compared as its nearest existing ancestor's real path plus the rest, as
 * typed.
 */
import fs from 'fs';
import path from 'path';
import { LEGACY_PRIVATE_ROOT, privateStoreLayoutFromConfig } from './privateStorePath.js';

/** One place private files are kept, and what to call it in a message. */
export interface PrivateStorageRoot {
  label: string;
  path: string;
}

/** How a media folder overlaps a root: it is the root, holds it, or is inside it. */
export type OverlapRelation = 'equals' | 'contains' | 'is inside';

export interface MediaFolderOverlap {
  folder: string;
  /** 1-based position of the folder in `ngdpbase.media.folders`. */
  position: number;
  root: PrivateStorageRoot;
  relation: OverlapRelation;
}

/** The pages directory key, and its default where the code reads it elsewhere. */
const PAGES_DIR_KEY = 'ngdpbase.page.provider.filesystem.storagedir';
const SHARED_FOLDERS_KEY = 'ngdpbase.shared-folders.storagedir';
/** BasicAttachmentProvider's keys and defaults for the same directories. */
const ATTACHMENTS_DIR_KEY = 'ngdpbase.attachment.provider.basic.storagedir';
const ATTACHMENTS_LEGACY_PRIVATE_KEY = 'ngdpbase.attachment.provider.basic.legacyprivateroot';

/** Minimal configuration surface, so tests need no live engine. */
export interface StorageRootConfig {
  getProperty(key: string, defaultValue: unknown): unknown;
  getResolvedDataPath(key: string, defaultValue: string): string;
}

/**
 * Where private files live: the vaults (shared folders' pages and files are
 * the `shared-folders` container's vault, so they are in here), the legacy
 * `private/` root a site may not have moved yet, the shared folders' key
 * storage, and two places in attachment storage: the old private attachments
 * the migration leaves behind and reads as a fallback, and the thumbnail cache,
 * which holds thumbnails of vault images. Attachment paths are the ones
 * BasicAttachmentProvider resolves.
 */
export function privateStorageRoots(config: StorageRootConfig): PrivateStorageRoot[] {
  const pagesDir = config.getResolvedDataPath(PAGES_DIR_KEY, './data/pages') || './data/pages';
  const layout = privateStoreLayoutFromConfig((k, d) => config.getProperty(k, d));
  const roots: PrivateStorageRoot[] = [{ label: 'vault storage', path: path.join(pagesDir, layout.privateRoot) }];
  if (layout.privateRoot !== LEGACY_PRIVATE_ROOT) {
    roots.push({ label: 'legacy private-store storage', path: path.join(pagesDir, LEGACY_PRIVATE_ROOT) });
  }
  const shared = config.getResolvedDataPath(SHARED_FOLDERS_KEY, './data/shared-folders');
  if (shared) roots.push({ label: 'shared-folder storage', path: shared });
  const attachments = config.getResolvedDataPath(ATTACHMENTS_DIR_KEY, './data/attachments') || './data/attachments';
  const legacyRaw = config.getProperty(ATTACHMENTS_LEGACY_PRIVATE_KEY, 'private');
  const legacy = typeof legacyRaw === 'string' && legacyRaw.length > 0 ? legacyRaw : 'private';
  roots.push({ label: 'private attachment storage', path: path.join(attachments, legacy) });
  roots.push({ label: 'attachment thumbnail cache', path: path.join(attachments, '.thumbs') });
  return roots;
}

/**
 * The real path of `p`, or of its nearest existing ancestor with the rest
 * appended. `p` is not normalized first: `link/..` is the parent of where
 * `link` points, not the directory holding `link` (#2195).
 */
export function realPathOf(p: string): string {
  const abs = path.isAbsolute(p) ? p : `${process.cwd()}${path.sep}${p}`;
  let head = abs;
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(head), ...tail);
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return path.resolve(abs);
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
}

/** Whether `child` is `parent` or under it; both already real paths. */
export function isSameOrUnder(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/** How `folder` overlaps `root`, or null for no overlap. */
export function overlapRelation(folder: string, root: string): OverlapRelation | null {
  const f = realPathOf(folder);
  const r = realPathOf(root);
  if (f === r) return 'equals';
  if (isSameOrUnder(r, f)) return 'contains';
  if (isSameOrUnder(f, r)) return 'is inside';
  return null;
}

/** The first private storage root `folder` overlaps, or null. */
export function findMediaFolderOverlap(folder: string, roots: PrivateStorageRoot[], position = 1): MediaFolderOverlap | null {
  for (const root of roots) {
    const relation = overlapRelation(folder, root.path);
    if (relation) return { folder, position, root, relation };
  }
  return null;
}

/** Each of `folders` that overlaps a root, with its position in the list. */
export function findMediaFolderOverlaps(folders: string[], roots: PrivateStorageRoot[]): MediaFolderOverlap[] {
  return folders
    .map((f, i) => findMediaFolderOverlap(f, roots, i + 1))
    .filter((o): o is MediaFolderOverlap => o !== null);
}

/**
 * The message for a refused folder. It names the folder by its position and
 * the kind of storage. It never echoes the folder: one inside a vault would
 * name the vault's owner and id, and the message reaches admin notices and
 * their email.
 */
export function describeMediaFolderOverlap(o: MediaFolderOverlap): string {
  const where = o.relation === 'is inside' ? 'is inside' : o.relation === 'contains' ? 'contains' : 'is';
  return `Media folder ${o.position} in ngdpbase.media.folders ${where} the ${o.root.label}, so it is not scanned. ` +
    'A media folder must not equal, contain or sit inside private storage; choose one outside it.';
}
