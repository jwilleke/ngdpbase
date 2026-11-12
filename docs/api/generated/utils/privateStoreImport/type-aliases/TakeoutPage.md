[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreImport](../README.md) / TakeoutPage

# Type Alias: TakeoutPage

> __TakeoutPage__ = `object`

Defined in: src/utils/privateStoreImport.ts:25

One page of a takeout.

## Properties

### archivePath

> __archivePath__: `string`

Defined in: src/utils/privateStoreImport.ts:27

Where it was in the archive — how the report names a page that failed.

***

### body

> __body__: `string`

Defined in: src/utils/privateStoreImport.ts:34

***

### metadata

> __metadata__: `Record`\<`string`, `unknown`\>

Defined in: src/utils/privateStoreImport.ts:33

The frontmatter, as written.

***

### title

> __title__: `string`

Defined in: src/utils/privateStoreImport.ts:29

From the frontmatter, else the file's name.

***

### uuid?

> `optional` __uuid?__: `string`

Defined in: src/utils/privateStoreImport.ts:31

From the frontmatter. Absent for a page written by hand.
