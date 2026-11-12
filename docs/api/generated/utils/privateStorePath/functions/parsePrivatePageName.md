[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / parsePrivatePageName

# Function: parsePrivatePageName()

> __parsePrivatePageName__(`name`): [`PrivatePageName`](../interfaces/PrivatePageName.md) \| `null`

Defined in: src/utils/privateStorePath.ts:324

The parts of a private page name, or null when `name` is not one. A shared
folder's page, `shared/{folder}/{title}`, reads as the container
[SHARED\_FOLDER\_OWNER](../variables/SHARED_FOLDER_OWNER.md)'s; `vaults/shared-folders/…` is not a name.

## Parameters

### name

`unknown`

## Returns

[`PrivatePageName`](../interfaces/PrivatePageName.md) \| `null`
