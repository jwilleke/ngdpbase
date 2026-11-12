[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AttachmentManager](../README.md) / AttachmentBackupData

# Interface: AttachmentBackupData

Defined in: src/managers/AttachmentManager.ts:280

Attachment backup data

## Extends

- [`BackupData`](../../BaseManager/interfaces/BackupData.md)

## Indexable

> \[`key`: `string`\]: `unknown`

Allow additional properties

## Properties

### data?

> `optional` __data?__: `null`

Defined in: src/managers/AttachmentManager.ts:285

Manager-specific backup data

#### Overrides

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`data`](../../BaseManager/interfaces/BackupData.md#data)

***

### files?

> `optional` __files?__: [`AttachmentFilesBackupData`](../../../providers/attachmentFilesBackup/interfaces/AttachmentFilesBackupData.md)

Defined in: src/managers/AttachmentManager.ts:284

The files themselves, as archives beside the document (#1876).

***

### managerName

> __managerName__: `string`

Defined in: src/managers/BaseManager.ts:33

Name of the manager that created this backup

#### Inherited from

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`managerName`](../../BaseManager/interfaces/BackupData.md#managername)

***

### note?

> `optional` __note?__: `string`

Defined in: src/managers/BaseManager.ts:48

Optional note about the backup

#### Inherited from

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`note`](../../BaseManager/interfaces/BackupData.md#note)

***

### providerBackup?

> `optional` __providerBackup?__: `unknown`

Defined in: src/managers/AttachmentManager.ts:282

Provider-specific backup data

#### Overrides

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`providerBackup`](../../BaseManager/interfaces/BackupData.md#providerbackup)

***

### providerClass

> __providerClass__: `string` \| `null`

Defined in: src/managers/AttachmentManager.ts:281

Provider class name (for managers with providers)

#### Overrides

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`providerClass`](../../BaseManager/interfaces/BackupData.md#providerclass)

***

### timestamp

> __timestamp__: `string`

Defined in: src/managers/BaseManager.ts:36

ISO timestamp when backup was created

#### Inherited from

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`timestamp`](../../BaseManager/interfaces/BackupData.md#timestamp)

***

### warnings?

> `optional` __warnings?__: `string`[]

Defined in: src/managers/BaseManager.ts:55

Parts of this manager's backup that failed while the rest was written
(#1723) — a database that could not be copied, say. BackupManager tells the
admins about each one: a backup is never silently partial.

#### Inherited from

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`warnings`](../../BaseManager/interfaces/BackupData.md#warnings)
