[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / BackupData

# Interface: BackupData

Defined in: src/managers/BaseManager.ts:31

Backup data structure returned by backup() method

## Extended by

- [`AttachmentBackupData`](../../AttachmentManager/interfaces/AttachmentBackupData.md)

## Indexable

> \[`key`: `string`\]: `unknown`

Allow additional properties

## Properties

### data?

> `optional` __data?__: `unknown`

Defined in: src/managers/BaseManager.ts:39

Manager-specific backup data

***

### managerName

> __managerName__: `string`

Defined in: src/managers/BaseManager.ts:33

Name of the manager that created this backup

***

### note?

> `optional` __note?__: `string`

Defined in: src/managers/BaseManager.ts:48

Optional note about the backup

***

### providerBackup?

> `optional` __providerBackup?__: `unknown`

Defined in: src/managers/BaseManager.ts:45

Provider-specific backup data

***

### providerClass?

> `optional` __providerClass?__: `string` \| `null`

Defined in: src/managers/BaseManager.ts:42

Provider class name (for managers with providers)

***

### timestamp

> __timestamp__: `string`

Defined in: src/managers/BaseManager.ts:36

ISO timestamp when backup was created

***

### warnings?

> `optional` __warnings?__: `string`[]

Defined in: src/managers/BaseManager.ts:55

Parts of this manager's backup that failed while the rest was written
(#1723) — a database that could not be copied, say. BackupManager tells the
admins about each one: a backup is never silently partial.
