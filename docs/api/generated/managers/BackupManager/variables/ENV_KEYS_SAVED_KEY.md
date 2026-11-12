[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackupManager](../README.md) / ENV\_KEYS\_SAVED\_KEY

# Variable: ENV\_KEYS\_SAVED\_KEY

> `const` __ENV\_KEYS\_SAVED\_KEY__: `"ngdpbase.backup.env-keys-saved"` = `'ngdpbase.backup.env-keys-saved'`

Defined in: src/managers/BackupManager.ts:393

The config key that records the names (never the values) the instance
`.env` set when an admin last confirmed it is saved off the server (#1976),
sorted. Null until the first check records the baseline. The names, not
only their fingerprint, so the reminder can say which keys were added or
removed.
