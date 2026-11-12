[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / PrivateStoreLayout

# Type Alias: PrivateStoreLayout

> __PrivateStoreLayout__ = `object`

Defined in: src/utils/privateStorePath.ts:63

## Properties

### attachmentsDir

> __attachmentsDir__: `string`

Defined in: src/utils/privateStorePath.ts:69

Non-page files inside a store: `{store}/{attachmentsDir}/{uuid}.ext` (#1400)

***

### commentsDir

> __commentsDir__: `string`

Defined in: src/utils/privateStorePath.ts:73

A page's comments: `{store}/{commentsDir}/{uuid}/{id}.json` (#1839)

***

### defaultStoreId

> __defaultStoreId__: `string`

Defined in: src/utils/privateStorePath.ts:65

***

### deletedDir

> __deletedDir__: `string`

Defined in: src/utils/privateStorePath.ts:67

***

### files

> __files__: [`PrivateStoreLayoutFiles`](PrivateStoreLayoutFiles.md)

Defined in: src/utils/privateStorePath.ts:74

***

### footnotesDir

> __footnotesDir__: `string`

Defined in: src/utils/privateStorePath.ts:71

A page's footnotes: `{store}/{footnotesDir}/{uuid}.json` (#1839)

***

### privateRoot

> __privateRoot__: `string`

Defined in: src/utils/privateStorePath.ts:64

***

### sealedVaults

> __sealedVaults__: readonly `string`[]

Defined in: src/utils/privateStorePath.ts:83

The vault ids whose kind is sealed: the system-category entries that
declare the vault with `encrypt: true` (#1834). Read from configuration
with the rest of the layout, so every store I/O decision — which already
carries the layout — consults the kind as well as the vault's
`store.json`, and a sealed kind's vault without a sealed `store.json`
fails closed instead of being read and written in the clear.

***

### versionsDir

> __versionsDir__: `string`

Defined in: src/utils/privateStorePath.ts:66
