[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / StoreDeletedEntry

# Interface: StoreDeletedEntry

Defined in: src/types/Provider.ts:754

A deleted page in a private store (#1459): its entry in the store's OWN
trash record, `{store}/deleted-index.json`, beside the page index and
written through the same store I/O — so it is sealed exactly when the store
is, and a deleted private page is recorded nowhere else. Never in the global
`page-index.json` and never in `pages/deleted/`.

It is the live index entry it was, plus who removed it and when: restore
puts that entry straight back, so nothing about the page has to be guessed
or re-derived from the file.

## Extends

- [`StorePageEntry`](../type-aliases/StorePageEntry.md)

## Properties

### addon?

> `optional` __addon?__: `string`

Defined in: src/utils/privateStoreCatalogs.ts:41

#### Inherited from

`StorePageEntry.addon`

***

### audienceRoles?

> `optional` __audienceRoles?__: `string`[]

Defined in: src/utils/privateStoreCatalogs.ts:39

#### Inherited from

`StorePageEntry.audienceRoles`

***

### author?

> `optional` __author?__: `string`

Defined in: src/utils/privateStoreCatalogs.ts:37

#### Inherited from

`StorePageEntry.author`

***

### created?

> `optional` __created?__: `string`

Defined in: src/utils/privateStoreCatalogs.ts:35

#### Inherited from

`StorePageEntry.created`

***

### creator

> __creator__: `string`

Defined in: src/utils/privateStoreCatalogs.ts:32

#### Inherited from

`StorePageEntry.creator`

***

### currentVersion

> __currentVersion__: `number`

Defined in: src/utils/privateStoreCatalogs.ts:30

#### Inherited from

`StorePageEntry.currentVersion`

***

### deletedAt

> __deletedAt__: `string`

Defined in: src/types/Provider.ts:756

When the page was deleted (ISO 8601)

***

### deletedBy

> __deletedBy__: `string`

Defined in: src/types/Provider.ts:758

Username that deleted it

***

### editor

> __editor__: `string`

Defined in: src/utils/privateStoreCatalogs.ts:36

#### Inherited from

`StorePageEntry.editor`

***

### filename?

> `optional` __filename?__: `string`

Defined in: src/utils/privateStoreCatalogs.ts:29

#### Inherited from

`StorePageEntry.filename`

***

### hasVersions

> __hasVersions__: `boolean`

Defined in: src/utils/privateStoreCatalogs.ts:38

#### Inherited from

`StorePageEntry.hasVersions`

***

### isPrivate

> __isPrivate__: `true`

Defined in: src/utils/privateStoreCatalogs.ts:40

#### Inherited from

`StorePageEntry.isPrivate`

***

### lastModified

> __lastModified__: `string`

Defined in: src/utils/privateStoreCatalogs.ts:34

#### Inherited from

`StorePageEntry.lastModified`

***

### location

> __location__: `"private"`

Defined in: src/utils/privateStoreCatalogs.ts:31

#### Inherited from

`StorePageEntry.location`

***

### slug?

> `optional` __slug?__: `string`

Defined in: src/utils/privateStoreCatalogs.ts:28

#### Inherited from

`StorePageEntry.slug`

***

### store

> __store__: `string`

Defined in: src/utils/privateStoreCatalogs.ts:33

#### Inherited from

`StorePageEntry.store`

***

### title

> __title__: `string`

Defined in: src/utils/privateStoreCatalogs.ts:26

#### Inherited from

`StorePageEntry.title`

***

### uuid

> __uuid__: `string`

Defined in: src/utils/privateStoreCatalogs.ts:27

#### Inherited from

`StorePageEntry.uuid`
