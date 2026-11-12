[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AttachmentManager](../README.md) / PutOptions

# Interface: PutOptions

Defined in: src/managers/AttachmentManager.ts:157

What else a write carries (#2148). None of it decides where the file goes:
that is the place the caller passed to `FileManager.put`.

## Extended by

- [`UploadOptions`](UploadOptions.md)

## Properties

### description?

> `optional` __description?__: `string`

Defined in: src/managers/AttachmentManager.ts:163

***

### heldIds?

> `optional` __heldIds?__: `Set`\<`string`\>

Defined in: src/managers/AttachmentManager.ts:197

The ids files on the site held when the caller's run began, from
heldFileIds, read once per run (#2188). With it, a restore checks
the set instead of every store's folder on disk, and adds the id it
stores to it.

***

### importedFrom?

> `optional` __importedFrom?__: `string`

Defined in: src/managers/AttachmentManager.ts:180

An import's own file name, when the user gave the file another (#2130):
recorded beside `filename` on the upload's audit record. A sealed store's
record names the file by id only, so it is not recorded there.

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

***

### pageName?

> `optional` __pageName?__: `string`

Defined in: src/managers/AttachmentManager.ts:162

The page that shows the file, recorded as a mention (and on the audit
record of an unsealed place). Never the place: a page only links to a file.

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

***

### wikiContext?

> `optional` __wikiContext?__: [`default`](../../../context/WikiContext/classes/default.md)

Defined in: src/managers/AttachmentManager.ts:165

WikiContext for the current request — audit IP fallback
