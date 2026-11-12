[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/File](../README.md) / FileRecord

# Type Alias: FileRecord

> __FileRecord__ = `Pick`\<[`AssetRecord`](../../Asset/interfaces/AssetRecord.md), `"id"` \| `"filename"` \| `"name"` \| `"description"` \| `"keywords"` \| `"encodingFormat"` \| `"contentSize"` \| `"url"` \| `"mentions"` \| `"dateCreated"` \| `"author"` \| `"dateModified"` \| `"editor"`\> & `object`

Defined in: src/types/File.ts:60

One file, as the door shows it.

From `AssetRecord`, unchanged in meaning:

- `id`: the stable identity, kept across renames and moves.
- `filename`: the file's name, the one links use (`[Annual Report.pdf]`),
  unique within its place.
- `name`: the human title, when one was given (schema.org `name`).
- `description`, `keywords`: descriptive metadata.
- `encodingFormat`: the media type (`application/pdf`, `image/png`…).
- `contentSize`, `url`, `mentions` (the pages that show it).
- `dateCreated` / `author`: when and by whom it was created, as recorded
  (the uploader; a legacy record may say `Unknown`).
- `dateModified` / `editor`: when and by whom it last changed.

Added here:

- `place`: public, a vault, or a shared folder.
- `owner`: the user it belongs to. A vault's files are the vault owner's.
  A public file's owner is its uploader when the record names a user, or
  `null` when it does not (`Unknown`, empty, an email used as a name):
  the migration gives those an owner from configuration.
- `systemCategory`: the category whose rules apply. Per file, never by
  type. A public file today is the default category's; a vault file is
  the category that declares its vault, or `null` when none does.

## Type Declaration

### owner

> __owner__: `string` \| `null`

### place

> __place__: [`FilePlace`](FilePlace.md)

### systemCategory

> __systemCategory__: `string` \| `null`
