[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/DatabaseManager](../README.md) / DatabaseBackupData

# Interface: DatabaseBackupData

Defined in: src/managers/DatabaseManager.ts:89

DatabaseManager's `data` in a backup document.

## Properties

### absent

> __absent__: `string`[]

Defined in: src/managers/DatabaseManager.ts:95

Declared databases with no file yet (an add-on that never opened it).

***

### databases

> __databases__: [`DatabaseBackupEntry`](DatabaseBackupEntry.md)[]

Defined in: src/managers/DatabaseManager.ts:93

***

### failed

> __failed__: `object`[]

Defined in: src/managers/DatabaseManager.ts:97

Databases that could not be copied; the backup carries the others.

#### error

> __error__: `string`

#### name

> __name__: `string`

***

### format

> __format__: `1`

Defined in: src/managers/DatabaseManager.ts:90

***

### keyFingerprint?

> `optional` __keyFingerprint?__: `string`

Defined in: src/managers/DatabaseManager.ts:92

`backupKeyFingerprint()` of the key the files are encrypted under.

***

### leftOut?

> `optional` __leftOut?__: `object`

Defined in: src/managers/DatabaseManager.ts:103

# 1892 D2: in a restore's safety backup taken while the application
database can't be opened, the databases left out and why. The restore
keeps their files beside the restored ones, as `*.pre-restore`.

#### databases

> __databases__: `string`[]

#### reason

> __reason__: `string`
