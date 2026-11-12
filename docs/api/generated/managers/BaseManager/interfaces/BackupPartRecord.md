[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / BackupPartRecord

# Interface: BackupPartRecord

Defined in: src/managers/BaseManager.ts:93

A folder or file part's record in a manager's entry of the backup document
(#1876, #1985): the archive beside the document and what it holds. The
shape every backup since v5.21 writes; a restore reads it as it is.

## Properties

### archive

> __archive__: `string`

Defined in: src/managers/BaseManager.ts:96

The archive beside the document: `<stem>.<part>.tar`, or `.tar.enc` when encrypted.

***

### bytes

> __bytes__: `number`

Defined in: src/managers/BaseManager.ts:98

***

### files

> __files__: `number`

Defined in: src/managers/BaseManager.ts:97

***

### format

> __format__: `1`

Defined in: src/managers/BaseManager.ts:94

***

### keyFingerprint?

> `optional` __keyFingerprint?__: `string`

Defined in: src/managers/BaseManager.ts:100

`backupKeyFingerprint()` of the key the archive is encrypted under; absent when it is not encrypted.
