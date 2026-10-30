/**
 * The file record (#1852, epic #1851): one shape for every file the site
 * keeps, read through `FileManager`, the one door.
 *
 * The decisions behind it are the epic's decision log
 * (https://github.com/jwilleke/ngdpbase/issues/1851#issuecomment-6236003946);
 * the practice is docs/guides/storage-developer-guide.md.
 *
 * It is not a new vocabulary. `AssetRecord` (src/types/Asset.ts) is already
 * the internal, schema.org-named shape for a stored file (docs/schemas.md
 * Decision 11), so the record takes its fields from there by name and adds
 * only what an asset record does not say: where the file lives, who owns it,
 * and its system-category. A field that changes in `AssetRecord` changes
 * here too; there is no second copy to drift.
 */

import type { AssetRecord } from './Asset.js';

/**
 * Where a file lives: the public area, one user's vault, or one shared
 * folder. A file is unique by its place plus its name; the same name may
 * exist in two places.
 *
 * Each place is named by the identifiers the site already uses: a vault by
 * its owner's username and its vault id (`pages/vaults/{owner}/{vault}/`), a
 * shared folder by its name (`/shared/{folder}`, SharedFolderManager). The
 * shared folders' internal container (`SHARED_FOLDER_OWNER`) is never a
 * vault owner here: a folder is always `{ kind: 'shared-folder' }` (#2148).
 */
export type FilePlace =
  | { kind: 'public' }
  | { kind: 'vault'; owner: string; vault: string }
  | { kind: 'shared-folder'; folder: string };

/**
 * One file, as the door shows it.
 *
 * From `AssetRecord`, unchanged in meaning:
 * - `id`: the stable identity, kept across renames and moves.
 * - `filename`: the file's name, the one links use (`[Annual Report.pdf]`),
 *   unique within its place.
 * - `name`: the human title, when one was given (schema.org `name`).
 * - `description`, `keywords`: descriptive metadata.
 * - `encodingFormat`: the media type (`application/pdf`, `image/png`…).
 * - `contentSize`, `url`, `mentions` (the pages that show it).
 * - `dateCreated` / `author`: when and by whom it was created, as recorded
 *   (the uploader; a legacy record may say `Unknown`).
 * - `dateModified` / `editor`: when and by whom it last changed.
 *
 * Added here:
 * - `place`: public, a vault, or a shared folder.
 * - `owner`: the user it belongs to. A vault's files are the vault owner's.
 *   A public file's owner is its uploader when the record names a user, or
 *   `null` when it does not (`Unknown`, empty, an email used as a name):
 *   the migration gives those an owner from configuration.
 * - `systemCategory`: the category whose rules apply. Per file, never by
 *   type. A public file today is the default category's; a vault file is
 *   the category that declares its vault, or `null` when none does.
 */
export type FileRecord = Pick<AssetRecord,
  | 'id'
  | 'filename'
  | 'name'
  | 'description'
  | 'keywords'
  | 'encodingFormat'
  | 'contentSize'
  | 'url'
  | 'mentions'
  | 'dateCreated'
  | 'author'
  | 'dateModified'
  | 'editor'
> & {
  place: FilePlace;
  owner: string | null;
  systemCategory: string | null;
};

/**
 * What the operator inventory shows of one vault (#1859's dry run). Counts
 * only: a vault's names, owners and metadata belong to its owner and never
 * leave the door. A sealed vault can't be read without its owner's key, so
 * only what is on disk is counted (bytes as stored, sealed) and its clashes
 * are unknown (`null`).
 */
export interface VaultFileSummary {
  owner: string;
  vault: string;
  systemCategory: string | null;
  /** Whether its index could be read. False for a sealed vault (no key here) or one refused as not yet opened. */
  readable: boolean;
  files: number;
  bytes: number;
  /** Files that would get a `-###` suffix in this vault; `null` when it can't be read. */
  clashes: number | null;
}

/** Everything the site keeps as files, for the operator (#1859): the public files in full, each vault as counts. */
export interface FileInventory {
  publicFiles: FileRecord[];
  vaults: VaultFileSummary[];
}
