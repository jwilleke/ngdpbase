[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AttachmentManager](../README.md) / UploadOptions

# Interface: UploadOptions

Defined in: src/managers/AttachmentManager.ts:215

What else a write carries (#2148). None of it decides where the file goes:
that is the place the caller passed to `FileManager.put`.

## Extends

- [`PutOptions`](PutOptions.md)

## Properties

### description?

> `optional` __description?__: `string`

Defined in: src/managers/AttachmentManager.ts:163

#### Inherited from

[`PutOptions`](PutOptions.md).[`description`](PutOptions.md#description)

***

### heldIds?

> `optional` __heldIds?__: `Set`\<`string`\>

Defined in: src/managers/AttachmentManager.ts:197

The ids files on the site held when the caller's run began, from
heldFileIds, read once per run (#2188). With it, a restore checks
the set instead of every store's folder on disk, and adds the id it
stores to it.

#### Inherited from

[`PutOptions`](PutOptions.md).[`heldIds`](PutOptions.md#heldids)

***

### importedFrom?

> `optional` __importedFrom?__: `string`

Defined in: src/managers/AttachmentManager.ts:180

An import's own file name, when the user gave the file another (#2130):
recorded beside `filename` on the upload's audit record. A sealed store's
record names the file by id only, so it is not recorded there.

#### Inherited from

[`PutOptions`](PutOptions.md).[`importedFrom`](PutOptions.md#importedfrom)

***

### keep?

> `optional` __keep?__: [`OriginalKeep`](../../../ice/types/interfaces/OriginalKeep.md)

Defined in: src/managers/AttachmentManager.ts:174

An import's keep at upload (#2061): the `OriginalKeep` the engine handed
the receiver's `keepOriginal`, passed on unchanged. Honoured only while
the engine holds it open, for a file going into its user's own vault of a
system-category the receiver's add-on declares: there the receiver's
declared types are allowed beyond the site's allow-list, and the file is
served as a download. Anywhere else it changes nothing.

#### Inherited from

[`PutOptions`](PutOptions.md).[`keep`](PutOptions.md#keep)

***

### pageName?

> `optional` __pageName?__: `string`

Defined in: src/managers/AttachmentManager.ts:162

The page that shows the file, recorded as a mention (and on the audit
record of an unsealed place). Never the place: a page only links to a file.

#### Inherited from

[`PutOptions`](PutOptions.md).[`pageName`](PutOptions.md#pagename)

***

### private?

> `optional` __private?__: `boolean`

Defined in: src/managers/AttachmentManager.ts:222

Private-store destination (#1396): the upload dialog's checkbox. Decides
only when `pageName` is not a private page — an upload onto a private page
is always private, in that page's author's store (#1398). Absent or false
otherwise keeps the public attachments pool.

***

### restoreIds?

> `optional` __restoreIds?__: readonly `string`[]

Defined in: src/managers/AttachmentManager.ts:190

A takeout import's file (#2188): the ids it had, the one to try first
first, so a page still linking `/attachments/{id}` finds it again. The
file is stored under the first that is free (restoreIdIsFree);
when none is, it gets a new id, as any upload does. Honoured only in a
vault, never a shared folder or the shared pool; the import passes it
only for one of its user's own stores. The stored id is in the returned
metadata either way.

#### Inherited from

[`PutOptions`](PutOptions.md).[`restoreIds`](PutOptions.md#restoreids)

***

### store?

> `optional` __store?__: `string`

Defined in: src/managers/AttachmentManager.ts:224

Store id when private with no private page; default from ConfigurationManager defaultstoreid

***

### wikiContext?

> `optional` __wikiContext?__: [`default`](../../../context/WikiContext/classes/default.md)

Defined in: src/managers/AttachmentManager.ts:165

WikiContext for the current request — audit IP fallback

#### Inherited from

[`PutOptions`](PutOptions.md).[`wikiContext`](PutOptions.md#wikicontext)
