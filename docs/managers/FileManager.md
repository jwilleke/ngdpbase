---
name: FileManager
description: "The one door for files (epic #1851): today's attachments read as file records, the one write door (put, every file vetted by ICE) and its record, the places a user may write to, the Upload file dialog, and the migration dry run"
dateModified: '2026-10-30'
category: managers
code: src/managers/FileManager.ts
relatedModules: [AttachmentManager, AssetManager, ImportManager, SharedFolderManager, PolicyDecisionPoint, PolicyInformationPoint]
---

# FileManager

The door for every file the site keeps, decided in epic [#1851](https://github.com/jwilleke/ngdpbase/issues/1851) ([decision log](https://github.com/jwilleke/ngdpbase/issues/1851#issuecomment-6236003946); the 2026-10-30 decisions are in [planning/files.md](../planning/files.md)). It __reads__ today's attachments as file records ([#1852](https://github.com/jwilleke/ngdpbase/issues/1852)) and __writes__ through one door, `put`, into the place the caller chose ([#2148](https://github.com/jwilleke/ngdpbase/issues/2148)), after ICE has vetted the file, and records it ([#2149](https://github.com/jwilleke/ngdpbase/issues/2149)). It owns the Upload file dialog. AttachmentManager is the storage underneath, and records nothing itself. What exists now and what comes later is in the [storage developer guide](../guides/storage-developer-guide.md#files-one-record-one-door).

## The record

`FileRecord` (`src/types/File.ts`) takes its fields from `AssetRecord` by name (`Pick`), since `AssetRecord` is already the internal schema.org shape for a stored file ([schemas.md](../schemas.md) Decision 11), and adds three:

| Field | Meaning |
| --- | --- |
| `id` | Stable identity, kept across renames and moves |
| `filename` | The name links use, unique within its place |
| `name`, `description`, `keywords` | Descriptive metadata (`name` is the title) |
| `encodingFormat`, `contentSize`, `url` | Media type, size, where it is served today |
| `mentions` | The pages that show it |
| `dateCreated`, `author` | Created when and by whom, as recorded |
| `dateModified`, `editor` | Last changed when and by whom |
| `place` | A `FilePlace`, below |
| `owner` | Who it belongs to: the vault's owner, or the public file's uploader when the record names a user; `null` when it does not (`Unknown`, empty, an email used as a name) |
| `systemCategory` | Public files: the default category. Vault files: the category that declares the vault, or `null` |

## The place

`FilePlace` (`src/types/File.ts`) is the one declaration of where a file lives, named by the identifiers the site already uses:

- `{ kind: 'public' }`: the public place (today's shared pool);
- `{ kind: 'vault', owner, vault }`: a user's vault, `pages/vaults/{owner}/{vault}/`;
- `{ kind: 'shared-folder', folder }`: a shared folder, `/shared/{folder}` ([SharedFolderManager](SharedFolderManager.md)). The folders' internal container (`SHARED_FOLDER_OWNER`) is never a vault owner here; `put` refuses a vault named by it.

## API

Every call carries the caller's context.

### Reading

- `list(ctx, { place? })`: every file `ctx` may read, newest first.
- `get(id, ctx)`: one file, or `null`.
- `findByName(filename, ctx, place?)`: the files with that name, one per place.

What a viewer sees is decided by the existing rules: the public place needs `asset-read` from the PDP; vault files are read through AttachmentManager's own vault reads (`readableVaultAssetRecords`), so the container rule decides, owner or delegate, never a role, administrators included. No new permission: files use `asset-*`, pages `page-*` (decision log).

### Writing a file (#2148)

- `placesWritableBy(ctx): Promise<FilePlace[]>`: the places `ctx` may put a file in, in this order: the public place when the PDP grants `asset-upload`; each of the user's own vaults the vault rule lets them upload to (their default vault, and every vault they already have); each shared folder where they hold `shared-folder-file`. A place they may not write to is never listed. Each place is asked exactly as `put` asks it, so what is offered is what the door allows. An affordance: nothing is recorded.
- `put(ctx, place, file, options?): Promise<PutResult>`: the one write door. `file` is `{ bytes, info: { originalName, mimeType, size } }` (`PutFile`); `options` (`PutOptions`) carries `description`, `pageName` (the page that shows it, recorded as a mention; never the place), `keep`, `importedFrom` and `wikiContext`. In order:
  - the place is checked to be one (`Not a place a file can be put in` otherwise);
  - the permission for that place is asked, and a refusal (`Permission denied: …`, which a route answers 401 or 403) stores nothing and records no upload: the public place asks `asset-upload` of the PDP; a vault asks `AttachmentManager.mayInVault` (the container rule, then `asset-upload` with the vault, so `vault-owner` decides and no role reaches in); a shared folder asks `SharedFolderManager.mayInFolder` (`shared-folder-file` on `shared/{folder}`, false for a folder that does not exist);
  - ICE vets it (#2149): `ImportManager.vetFile` reads the type from the bytes (#1624) and has the format's shim clean it (`core.svg`: scripts, `foreignObject`, `on…` handlers, `javascript:` links; `core.csv`: HTML in cells, a formula cell gets a leading `'`). The cleaned copy is what is stored. A cleaner that fails refuses the file (`IceVetRefused`) and nothing is stored. Without an ImportManager, `put` refuses: no file is kept unvetted;
  - `AttachmentManager.storeInPlace` stores it as the place requires: nobody uploads anonymously (#1926), a vault or folder keeps it in its own store, sealed when the store is (a sealed vault without its key in the session is refused, never written in the clear). It returns the metadata and what the record says, and records nothing;
  - this door records `asset-upload` (`continue`), a sealed place's file by id and store only (#2048), with `cleaned`, the notes of what vetting removed (kinds and counts, never content), when there were any. It returns the metadata, plus `cleaned` when there were notes, so the caller can tell the user.
- `recordFileEvent(op, ctx, detail, wikiContext?)`: writes the `asset-upload` or `asset-delete` record (operator, 2026-10-30, #2149: the owner records). A delete is critical: a record that cannot be written throws, tagged `AUDIT_WRITE_FAILED`, before anything is deleted. A sealed store's owner is named by identity `@id`, the username beside it (#2041). AttachmentManager's delete door calls it, until deleting is this door's.

### The Upload file dialog (#2149)

- `uploadPlaces(ctx, { path?, pageName? })`: the places `placesWritableBy` lists, each with a key (`public`, `vault:<id>`, `folder:<name>`) and the words the user reads ("Public files", "Your private files", "Your `category` vault", "Shared folder: `name`"), and `defaultKey`: where the user is working (a shared folder's list `/shared/<name>` or one of its pages; a page in one of their own vaults, by its name), when that is offered, else `public` when offered, else the first. Never inferred from whether a page exists.
- `placeForKey(ctx, key)`: the place a key names, only when `placesWritableBy` offers it to `ctx`; otherwise `null`. A vault key is always the user's own vault.
- Routes: `GET /files/places?path=&page=` answers the dialog; `POST /files/upload` (multipart `file`, `place`, `description`) resolves the key and calls `put`, answering `{ attachmentId, name, url, encodingFormat, cleaned }`; a key not offered is refused (403, or 401 when nobody is signed in), a file that could not be checked 422.
- The dialog is `showUploadFile()` in `views/header.ejs`: in the user menu (Upload file), the editor's Upload button and the asset picker. It has no Private tick and no "attach to this page"; it gives the link to copy, and in the editor inserts it at the cursor.
- `placeForPageUpload(ctx, { pageName?, private?, store? }): Promise<FilePlace>`: where today's page-tied upload goes, kept until [#2149](https://github.com/jwilleke/ngdpbase/issues/2149) and [#2150](https://github.com/jwilleke/ngdpbase/issues/2150) move its callers to a place the user chose: onto a shared folder's page, that folder (saved or not, #2125); onto a vault page, that page's vault, by someone the page lets edit it (#1398); with the Private tick, the uploader's own vault (`store`, or their default; a share visitor is refused); otherwise the public place. `AttachmentManager.uploadAttachment` is this followed by `put`, so in-engine callers (NCM image localization, thumbnails, the folder import, the takeout) and the old `/attachments/upload` route all write through the one door. The dialog does not use it.

## The operator inventory and the dry run

`FileManager.openForOperator()` opens a read-only door from the command line: the real `ConfigurationManager` and an `AttachmentManager` whose provider is opened `{ readOnly: true }` (index loaded; no restore applied, no folder created, no start-up migration). Only that instance answers `inventory(ctx)` and `migrationDryRun(ctx)`, and only for an operator context (`jobContextFromOperator`). The engine's own instance refuses them, so no route reaches them.

- `inventory(ctx)`: the public files in full, and each vault as counts (files, bytes, how many clash renames), never its names. A sealed vault is counted on disk; its clashes are unknown without the owner's key.
- `migrationDryRun(ctx)`: the inventory planned by `planFileMigration` (`src/utils/fileMigrationPlan.ts`) with the configured values.

Run it with `npm run files:migration:dry` (`-- --as <name>` names who ran it). It writes nothing; a test proves the data folder is byte-identical afterwards.

## Configuration

| Property | Default | Meaning |
| --- | --- | --- |
| `ngdpbase.files.migration.owner-map` | `{}` | Recorded uploader → username, applied first |
| `ngdpbase.files.migration.default-owner` | `admin` | Owner of a public file whose record names no user |
| `ngdpbase.files.migration.clash-suffix-digits` | `3` | Width of the `-###` suffix |

The write door adds no setting of its own (a cleaning shim is switched by ICE's `ngdpbase.import.shims.<id>.enabled`): the places come from `ngdpbase.system-category` (the default vault), the policies in `ngdpbase.access.policies`, and the shared folders SharedFolderManager holds.

## Known gaps

Listed in the [storage developer guide](../guides/storage-developer-guide.md#known-gaps).
