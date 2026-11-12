[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / privateStoreNotesDir

# Function: privateStoreNotesDir()

> __privateStoreNotesDir__(`pagesDirectory`, `creator`, `store`, `kind`, `layout?`): `string`

Defined in: src/utils/privateStorePath.ts:623

Where a vault page's footnotes or comments are kept (#1839): a folder of
the vault, `{privateroot}/{user}/{store}/{footnotesDir|commentsDir}`, so
they are written through the vault's store I/O and sealed exactly when its
pages are. A public page's are in the managers' own folders.

## Parameters

### pagesDirectory

`string`

### creator

`string`

### store

`string`

### kind

`"footnotes"` \| `"comments"`

### layout?

[`PrivateStoreLayoutOverrides`](../type-aliases/PrivateStoreLayoutOverrides.md)

## Returns

`string`
