[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / ManagerRestoreOptions

# Interface: ManagerRestoreOptions

Defined in: src/managers/BaseManager.ts:194

What BackupManager hands each manager's `restore()` (#1723): who asked, and the directory the backup document was read from.

## Properties

### ctx

> __ctx__: [`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Defined in: src/managers/BaseManager.ts:195

***

### directory

> __directory__: `string`

Defined in: src/managers/BaseManager.ts:196

***

### readArchive?

> `optional` __readArchive?__: (`manager`, `archive`, `keyFingerprint`) => `object`

Defined in: src/managers/BaseManager.ts:221

An archive the backup names, checked by BackupManager (#1985): a bare
file name in the backup directory, read under the key its fingerprint
names. Throws, naming `manager`, for anything else. For a manager that
stages its own files (attachments, the audit log).

#### Parameters

##### manager

`string`

##### archive

`unknown`

##### keyFingerprint

`string` \| `undefined`

#### Returns

`object`

##### backupKey?

> `optional` __backupKey?__: `string`

##### path

> __path__: `string`

***

### replaceStaged?

> `optional` __replaceStaged?__: `boolean`

Defined in: src/managers/BaseManager.ts:204

Replace what an earlier restore staged and the restart has not applied
yet (#1723, D5). Without it a manager that stages refuses, so a staged
restore is never replaced silently.

***

### safetyBackup?

> `optional` __safetyBackup?__: `string`

Defined in: src/managers/BaseManager.ts:206

The backup of the live data BackupManager took just before this restore (#1723, D6), by filename.

***

### siteRestore?

> `optional` __siteRestore?__: [`SiteRestoreStaging`](SiteRestoreStaging.md)

Defined in: src/managers/BaseManager.ts:214

Present when this restore is staged as part of a whole-site restore
(#1876): a manager whose restore is staged (`restoreIsStaged()`) stages
its files beside its live ones and records its part through it; the
next start applies every part or none. BackupManager keeps the record
(#1986).

***

### source?

> `optional` __source?__: `string`

Defined in: src/managers/BaseManager.ts:198

The backup document's filename.
