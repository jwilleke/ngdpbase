[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / BACKUP\_KEY\_MISSING\_PLAIN

# Variable: BACKUP\_KEY\_MISSING\_PLAIN

> `const` __BACKUP\_KEY\_MISSING\_PLAIN__: `"Backups are not encrypted, and some data (the databases and saved secrets) is left out of them, because no backup key is set. This is set in the server's settings, outside this page."` = `"Backups are not encrypted, and some data (the databases and saved secrets) is left out of them, because no backup key is set. This is set in the server's settings, outside this page."`

Defined in: src/managers/BackupManager.ts:370

What the dashboard says while there is no backup key (#2354): plain words, one thing to do.
The key is set outside the app, so there is nothing to link to.
