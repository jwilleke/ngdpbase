[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sharedFolderAccess](../README.md) / sharedFolderPermissionFor

# Function: sharedFolderPermissionFor()

> __sharedFolderPermissionFor__(`action`): `string` \| `null`

Defined in: src/utils/sharedFolderAccess.ts:53

The folder permission an action on a folder's page or file asks:
`shared-folder-read` for a read, `shared-folder-file` for a write, and null
for anything else — sharing it by link, exporting it, raw edits — which is
refused in a folder.

## Parameters

### action

`string`

## Returns

`string` \| `null`
