[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / BACKUP\_KEY\_SAVED\_KEY

# Variable: BACKUP\_KEY\_SAVED\_KEY

> `const` __BACKUP\_KEY\_SAVED\_KEY__: `"ngdpbase.backup.key-saved-fingerprint"` = `'ngdpbase.backup.key-saved-fingerprint'`

Defined in: src/managers/BackupManager.ts:379

The config key that records an admin's confirmation that the backup key is
saved off the server (#1876): the fingerprint of the key they saved. A
different key (a new one made, or one replaced) asks again.
