[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/attachmentFilesBackup](../README.md) / AttachmentFilesBackupData

# Interface: AttachmentFilesBackupData

Defined in: src/providers/attachmentFilesBackup.ts:60

The files part of AttachmentManager's entry in the backup document.

## Properties

### format

> __format__: `1`

Defined in: src/providers/attachmentFilesBackup.ts:61

***

### keyFingerprint?

> `optional` __keyFingerprint?__: `string`

Defined in: src/providers/attachmentFilesBackup.ts:65

`backupKeyFingerprint()` of the key both archives are encrypted under; absent when they are not.

***

### pool

> __pool__: `object`

Defined in: src/providers/attachmentFilesBackup.ts:62

#### archive

> __archive__: `string`

#### bytes

> __bytes__: `number`

#### files

> __files__: `number`

***

### vaults

> __vaults__: `object`

Defined in: src/providers/attachmentFilesBackup.ts:63

#### archive

> __archive__: `string`

#### bytes

> __bytes__: `number`

#### files

> __files__: `number`

#### stores

> __stores__: `string`[]
