[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/DatabaseManager](../README.md) / DatabaseBackupEntry

# Interface: DatabaseBackupEntry

Defined in: src/managers/DatabaseManager.ts:77

One database in a backup, as DatabaseManager's entry in the backup document lists it.

## Properties

### file

> __file__: `string`

Defined in: src/managers/DatabaseManager.ts:83

The encrypted file beside the backup document: `<stem>.<name>.db`.

***

### kind

> __kind__: `"addon"` \| `"application"`

Defined in: src/managers/DatabaseManager.ts:80

***

### name

> __name__: `string`

Defined in: src/managers/DatabaseManager.ts:79

`application`, or `addon-<owner>`.

***

### owner?

> `optional` __owner?__: `string`

Defined in: src/managers/DatabaseManager.ts:81

***

### sizeBytes

> __sizeBytes__: `number`

Defined in: src/managers/DatabaseManager.ts:84

***

### tables

> __tables__: `number`

Defined in: src/managers/DatabaseManager.ts:85
