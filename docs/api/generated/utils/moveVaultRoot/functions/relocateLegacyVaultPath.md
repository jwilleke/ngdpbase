[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/moveVaultRoot](../README.md) / relocateLegacyVaultPath

# Function: relocateLegacyVaultPath()

> __relocateLegacyVaultPath__(`pagesDirectory`, `filePath`, `layout?`): `string`

Defined in: src/utils/moveVaultRoot.ts:65

Where a path recorded before #1506 lives now: a file under
`pages/private/…` is under `pages/vaults/…` after the move. Anything else is
returned unchanged. A deleted page's `deletedFrom` is the case this serves:
restoring it must put it back inside the vaults, never recreate `private/`.

## Parameters

### pagesDirectory

`string`

### filePath

`string`

### layout?

[`PrivateStoreLayoutOverrides`](../../privateStorePath/type-aliases/PrivateStoreLayoutOverrides.md)

## Returns

`string`
