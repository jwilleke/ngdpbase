[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / StoredBackup

# Interface: StoredBackup

Defined in: src/managers/BackupManager.ts:76

A backup in the backup directory, as Admin → Backup lists it for download and restore (#1723).

## Extends

- [`BackupFileInfo`](BackupFileInfo.md)

## Properties

### created

> __created__: `Date`

Defined in: src/managers/BackupManager.ts:108

#### Inherited from

[`BackupFileInfo`](BackupFileInfo.md).[`created`](BackupFileInfo.md#created)

***

### databases

> __databases__: `string`[]

Defined in: src/managers/BackupManager.ts:78

The database files beside the document, by name (`application`, `addon-<owner>`).

***

### encrypted

> __encrypted__: `boolean`

Defined in: src/managers/BackupManager.ts:84

Whether the document is encrypted under the backup key (#1561): its name ends `.enc`.

***

### filename

> __filename__: `string`

Defined in: src/managers/BackupManager.ts:105

#### Inherited from

[`BackupFileInfo`](BackupFileInfo.md).[`filename`](BackupFileInfo.md#filename)

***

### files

> __files__: `string`[]

Defined in: src/managers/BackupManager.ts:82

Every file beside the document, by filename: what a download carries with it.

***

### modified

> __modified__: `Date`

Defined in: src/managers/BackupManager.ts:109

#### Inherited from

[`BackupFileInfo`](BackupFileInfo.md).[`modified`](BackupFileInfo.md#modified)

***

### parts

> __parts__: `string`[]

Defined in: src/managers/BackupManager.ts:80

The file archives beside the document, by part (`attachments`, `roles`, …) (#1876).

***

### path

> __path__: `string`

Defined in: src/managers/BackupManager.ts:106

#### Inherited from

[`BackupFileInfo`](BackupFileInfo.md).[`path`](BackupFileInfo.md#path)

***

### size

> __size__: `number`

Defined in: src/managers/BackupManager.ts:107

#### Inherited from

[`BackupFileInfo`](BackupFileInfo.md).[`size`](BackupFileInfo.md#size)

***

### totalSize

> __totalSize__: `number`

Defined in: src/managers/BackupManager.ts:86

The document and every file beside it together, in bytes.
