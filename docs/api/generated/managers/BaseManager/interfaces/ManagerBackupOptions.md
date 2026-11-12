[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / ManagerBackupOptions

# Interface: ManagerBackupOptions

Defined in: src/managers/BaseManager.ts:68

What BackupManager hands each manager's `backup()` (#1723): who asked, and
where the backup document is being written. A manager whose data is too
large for the JSON document (the databases) writes its own files into
`directory`, each named `<stem>.<something>`, and references them from its
entry; BackupManager prunes them with the document.

## Properties

### archive?

> `optional` __archive?__: (`part`) => [`BackupArchiveTarget`](BackupArchiveTarget.md)

Defined in: src/managers/BaseManager.ts:85

One more archive beside the document, named and keyed by BackupManager
(#1985), for a manager whose files are not a declared folder. A declared
folder or file (`backupFolders()`) needs none of this.

#### Parameters

##### part

`string`

#### Returns

[`BackupArchiveTarget`](BackupArchiveTarget.md)

***

### ctx

> __ctx__: [`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Defined in: src/managers/BaseManager.ts:69

***

### directory

> __directory__: `string`

Defined in: src/managers/BaseManager.ts:71

The backup directory the document is written to.

***

### safetyBackup?

> `optional` __safetyBackup?__: `boolean`

Defined in: src/managers/BaseManager.ts:79

The backup a restore takes of the live data first (#1892 D2). A database
that can't be opened is left out and recorded in the manager's data, not
failed: the restore keeps its file beside the restored one instead.

***

### stem

> __stem__: `string`

Defined in: src/managers/BaseManager.ts:73

The document's filename without `.json.gz` / `.json`.
