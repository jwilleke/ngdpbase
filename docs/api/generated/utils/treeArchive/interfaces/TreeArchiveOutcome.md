[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/treeArchive](../README.md) / TreeArchiveOutcome

# Interface: TreeArchiveOutcome

Defined in: src/utils/treeArchive.ts:36

## Properties

### bytes

> __bytes__: `number`

Defined in: src/utils/treeArchive.ts:40

Their bytes.

***

### files

> __files__: `number`

Defined in: src/utils/treeArchive.ts:38

Regular files written.

***

### skipped

> __skipped__: `string`[]

Defined in: src/utils/treeArchive.ts:42

Entries left out because they are not a file or a folder (a symbolic link), relative to the root.

***

### vanished

> __vanished__: `string`[]

Defined in: src/utils/treeArchive.ts:44

Entries that were there when the folder was listed and were deleted before they were read (#1563), relative to the root.
