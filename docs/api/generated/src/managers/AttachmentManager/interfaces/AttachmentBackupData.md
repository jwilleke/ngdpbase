[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/managers/AttachmentManager](../README.md) / AttachmentBackupData

# Interface: AttachmentBackupData

Defined in: [src/managers/AttachmentManager.ts:100](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L100)

Attachment backup data

## Extends

- [`BackupData`](../../BaseManager/interfaces/BackupData.md)

## Indexable

\[`key`: `string`\]: `unknown`

Allow additional properties

## Properties

### data?

> `optional` __data__: `null`

Defined in: [src/managers/AttachmentManager.ts:103](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L103)

Manager-specific backup data

#### Overrides

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`data`](../../BaseManager/interfaces/BackupData.md#data)

***

### managerName

> __managerName__: `string`

Defined in: [src/managers/BaseManager.ts:25](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L25)

Name of the manager that created this backup

#### Inherited from

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`managerName`](../../BaseManager/interfaces/BackupData.md#managername)

***

### note?

> `optional` __note__: `string`

Defined in: [src/managers/BaseManager.ts:40](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L40)

Optional note about the backup

#### Inherited from

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`note`](../../BaseManager/interfaces/BackupData.md#note)

***

### providerBackup?

> `optional` __providerBackup__: `unknown`

Defined in: [src/managers/AttachmentManager.ts:102](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L102)

Provider-specific backup data

#### Overrides

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`providerBackup`](../../BaseManager/interfaces/BackupData.md#providerbackup)

***

### providerClass

> __providerClass__: `string` \| `null`

Defined in: [src/managers/AttachmentManager.ts:101](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/AttachmentManager.ts#L101)

Provider class name (for managers with providers)

#### Overrides

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`providerClass`](../../BaseManager/interfaces/BackupData.md#providerclass)

***

### timestamp

> __timestamp__: `string`

Defined in: [src/managers/BaseManager.ts:28](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/managers/BaseManager.ts#L28)

ISO timestamp when backup was created

#### Inherited from

[`BackupData`](../../BaseManager/interfaces/BackupData.md).[`timestamp`](../../BaseManager/interfaces/BackupData.md#timestamp)
