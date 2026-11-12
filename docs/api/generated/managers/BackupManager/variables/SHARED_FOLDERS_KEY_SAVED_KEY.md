[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / SHARED\_FOLDERS\_KEY\_SAVED\_KEY

# Variable: SHARED\_FOLDERS\_KEY\_SAVED\_KEY

> `const` __SHARED\_FOLDERS\_KEY\_SAVED\_KEY__: `"ngdpbase.backup.shared-folders-key-saved-fingerprint"` = `'ngdpbase.backup.shared-folders-key-saved-fingerprint'`

Defined in: src/managers/BackupManager.ts:406

The config key that records an admin's confirmation that the shared-folders
key is saved off the server (#2124, epic #1775 decision 1): its fingerprint,
recorded when they confirm a downloaded `.env` that holds it. A different
key asks again.
