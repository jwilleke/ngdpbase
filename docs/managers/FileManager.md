---
name: FileManager
description: "The one door for files (epic #1851). First step, read-only: today's attachments shown as file records, and the migration dry run"
dateModified: '2026-10-20'
category: managers
code: src/managers/FileManager.ts
relatedModules: [AttachmentManager, AssetManager, PolicyDecisionPoint, PolicyInformationPoint]
---

# FileManager

The door for every file the site keeps, decided in epic [#1851](https://github.com/jwilleke/ngdpbase/issues/1851) ([decision log](https://github.com/jwilleke/ngdpbase/issues/1851#issuecomment-6236003946)). In the decision log it is "the door and the only writer of files". This first step ([#1852](https://github.com/jwilleke/ngdpbase/issues/1852)) only __reads__: it shows today's attachments as file records, and nothing is written, moved or renamed. What exists now and what comes later is in the [storage developer guide](../guides/storage-developer-guide.md#files-one-record-one-door).

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
| `place` | `{ kind: 'public' }` or `{ kind: 'vault', owner, vault }` |
| `owner` | Who it belongs to: the vault's owner, or the public file's uploader when the record names a user; `null` when it does not (`Unknown`, empty, an email used as a name) |
| `systemCategory` | Public files: the default category. Vault files: the category that declares the vault, or `null` |

## API

Every call carries the caller's context.

- `list(ctx, { place? })`: every file `ctx` may read, newest first.
- `get(id, ctx)`: one file, or `null`.
- `findByName(filename, ctx, place?)`: the files with that name, one per place.

What a viewer sees is decided by the existing rules: the public place needs `asset-read` from the PDP; vault files are read through AttachmentManager's own vault reads (`readableVaultAssetRecords`), so the container rule decides, owner or delegate, never a role, administrators included. No new permission: files use `asset-*`, pages `page-*` (decision log).

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

## Known gaps

Listed in the [storage developer guide](../guides/storage-developer-guide.md#known-gaps).
