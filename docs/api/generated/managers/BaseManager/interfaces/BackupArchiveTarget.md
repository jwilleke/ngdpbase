[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / BackupArchiveTarget

# Interface: BackupArchiveTarget

Defined in: src/managers/BaseManager.ts:149

One more archive beside the backup document, named and keyed by
BackupManager (#1985): for a manager whose files are not one declared
folder (the attachment pool and vaults, the audit log among the
application logs). Encrypted under the backup key when it is set.

## Properties

### archive

> __archive__: `string`

Defined in: src/managers/BaseManager.ts:151

Its file name, `<stem>.<part>.tar` or `.tar.enc`: what the entry records.

***

### backupKey?

> `optional` __backupKey?__: `string`

Defined in: src/managers/BaseManager.ts:154

***

### keyFingerprint?

> `optional` __keyFingerprint?__: `string`

Defined in: src/managers/BaseManager.ts:155

***

### path

> __path__: `string`

Defined in: src/managers/BaseManager.ts:153

Where to write it.
