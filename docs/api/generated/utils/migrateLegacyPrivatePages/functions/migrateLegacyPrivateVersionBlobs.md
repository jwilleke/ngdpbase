[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/migrateLegacyPrivatePages](../README.md) / migrateLegacyPrivateVersionBlobs

# Function: migrateLegacyPrivateVersionBlobs()

> __migrateLegacyPrivateVersionBlobs__(`pagesDirectory`, `layout?`): `Promise`\<\{ `moved`: `number`; \}\>

Defined in: src/utils/migrateLegacyPrivatePages.ts:69

Move `{pages}/{versionsdir}/{privateroot}/{uuid}/` into
`{privateroot}/{user}/{store}/{versionsdir}/{uuid}/` (#1383).

Creator/store come from the live page file after [migrateLegacyPrivatePages](migrateLegacyPrivatePages.md).

## Parameters

### pagesDirectory

`string`

### layout?

[`PrivateStoreLayoutOverrides`](../../privateStorePath/type-aliases/PrivateStoreLayoutOverrides.md)

## Returns

`Promise`\<\{ `moved`: `number`; \}\>
