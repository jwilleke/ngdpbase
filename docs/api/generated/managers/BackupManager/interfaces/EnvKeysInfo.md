[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / EnvKeysInfo

# Interface: EnvKeysInfo

Defined in: src/managers/BackupManager.ts:427

What Admin → Backup shows about the instance `.env` key set (#1976): names only, never a value.

## Properties

### added

> __added__: `string`[]

Defined in: src/managers/BackupManager.ts:435

Names set now that were not when an admin last confirmed.

***

### fingerprint

> __fingerprint__: `string`

Defined in: src/managers/BackupManager.ts:431

Their fingerprint, posted back with the confirmation so a stale page is refused.

***

### holdsBackupKey

> __holdsBackupKey__: `boolean`

Defined in: src/managers/BackupManager.ts:439

The file holds this site's current backup key, so a saved copy is a saved key too.

***

### holdsSharedFoldersKey

> __holdsSharedFoldersKey__: `boolean`

Defined in: src/managers/BackupManager.ts:441

The file holds this site's current shared-folders key (#2124), so a saved copy is a saved key too.

***

### names

> __names__: `string`[]

Defined in: src/managers/BackupManager.ts:429

The names the file sets now, sorted.

***

### recorded

> __recorded__: `boolean`

Defined in: src/managers/BackupManager.ts:433

Whether a set has been recorded at all: false only before the first check.

***

### removed

> __removed__: `string`[]

Defined in: src/managers/BackupManager.ts:437

Names an admin confirmed that the file no longer sets.
