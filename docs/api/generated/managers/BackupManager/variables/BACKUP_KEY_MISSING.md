[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / BACKUP\_KEY\_MISSING

# Variable: BACKUP\_KEY\_MISSING

> `const` __BACKUP\_KEY\_MISSING__: `"NGDPBASE_BACKUP_KEY is not set, so backups are NOT encrypted: the document (password hashes, settings with their secrets) and the file archives beside it are in the clear, and the credentials store, the databases and the instance .env are left out"`

Defined in: src/managers/BackupManager.ts:365

BackupManager's fault, and the dashboard banner, while there is no backup key (#1561, #1912).
