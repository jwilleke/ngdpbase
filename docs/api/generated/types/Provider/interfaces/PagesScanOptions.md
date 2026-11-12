[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / PagesScanOptions

# Interface: PagesScanOptions

Defined in: src/types/Provider.ts:148

Options for [PageProvider.getPagesByEditor](PageProvider.md#getpagesbyeditor) / [PageProvider.getPagesSharedWith](PageProvider.md#getpagessharedwith) (#640 Phase 2).

## Properties

### limit?

> `optional` __limit?__: `number`

Defined in: src/types/Provider.ts:150

Maximum number of entries returned. Default 1000.

***

### references?

> `optional` __references?__: `string`[]

Defined in: src/types/Provider.ts:158

The stored values that name the user (#2097), as [GetPagesByCreatorOptions.references](GetPagesByCreatorOptions.md#references):
`getPagesByEditor` compares `editor` against them, `getPagesSharedWith` leaves out pages
whose `author` is one of them. Set by PageManager.

***

### sortBy?

> `optional` __sortBy?__: `"lastModified-desc"` \| `"title-asc"`

Defined in: src/types/Provider.ts:152

Sort order. Default `lastModified-desc`.
