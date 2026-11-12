[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/mediaFolderOverlap](../README.md) / privateStorageRoots

# Function: privateStorageRoots()

> __privateStorageRoots__(`config`): [`PrivateStorageRoot`](../interfaces/PrivateStorageRoot.md)[]

Defined in: src/utils/mediaFolderOverlap.ts:61

Where private files live: the vaults (shared folders' pages and files are
the `shared-folders` container's vault, so they are in here), the legacy
`private/` root a site may not have moved yet, the shared folders' key
storage, and two places in attachment storage: the old private attachments
the migration leaves behind and reads as a fallback, and the thumbnail cache,
which holds thumbnails of vault images. Attachment paths are the ones
BasicAttachmentProvider resolves.

## Parameters

### config

[`StorageRootConfig`](../interfaces/StorageRootConfig.md)

## Returns

[`PrivateStorageRoot`](../interfaces/PrivateStorageRoot.md)[]
