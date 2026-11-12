[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / privateStoreAttachmentsDir

# Function: privateStoreAttachmentsDir()

> __privateStoreAttachmentsDir__(`pagesDirectory`, `creator`, `store?`, `layout?`): `string`

Defined in: src/utils/privateStorePath.ts:494

Folder for a store's non-page files: `{privateroot}/{user}/{store}/{attachmentsdir}` (#1386).
Never the store root — an uploaded `.md` there would scan as a page.

## Parameters

### pagesDirectory

`string`

### creator

`string`

### store?

`string`

### layout?

[`PrivateStoreLayoutOverrides`](../type-aliases/PrivateStoreLayoutOverrides.md)

## Returns

`string`
