[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / StoreFileEntry

# Interface: StoreFileEntry

Defined in: src/types/Provider.ts:682

A file in a private store (#1400, #1460, docs/private-stores.md
"Stores are self-contained"). Listed in the store's OWN index, beside
`store.json` — never in the global `attachment-metadata.json` — and sealed
with the store DEK when the store is encrypted. #1460: every private store
keeps its files this way, encrypted or not.

## Properties

### author?

> `optional` __author?__: `string`

Defined in: src/types/Provider.ts:703

***

### contentSize

> __contentSize__: `number`

Defined in: src/types/Provider.ts:699

***

### dateCreated

> __dateCreated__: `string`

Defined in: src/types/Provider.ts:704

***

### dateModified

> __dateModified__: `string`

Defined in: src/types/Provider.ts:705

***

### description

> __description__: `string`

Defined in: src/types/Provider.ts:702

***

### download?

> `optional` __download?__: `true`

Defined in: src/types/Provider.ts:712

An import's kept original (#2061): always served as a download
(`Content-Disposition: attachment`, `nosniff`), never shown inline.

***

### encodingFormat

> __encodingFormat__: `string`

Defined in: src/types/Provider.ts:698

***

### fileName

> __fileName__: `string`

Defined in: src/types/Provider.ts:695

Name on disk inside `{store}/attachments/`: `{id}{ext}` for a new upload,
and for a migrated file the name it already had — #1460 moves bytes, it
does not rename them. Says nothing about the file either way.

***

### fingerprint

> __fingerprint__: `string`

Defined in: src/types/Provider.ts:701

SHA-256 of the plaintext: duplicate detection within this store only.

***

### id

> __id__: `string`

Defined in: src/types/Provider.ts:689

The file's id, and the base of its name on disk. A random UUID for a new
upload; a record #1460's migration moved out of the shared index keeps the
id it already had, because that id is its `/attachments/{id}` URL on every
page that references it.

***

### mentions

> __mentions__: `string`[]

Defined in: src/types/Provider.ts:707

Pages the file was uploaded onto.

***

### name

> __name__: `string`

Defined in: src/types/Provider.ts:697

The name it was uploaded with. Only inside the store's index.
