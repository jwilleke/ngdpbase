[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/backupKey](../README.md) / BACKUP\_KEY\_ENV

# Variable: BACKUP\_KEY\_ENV

> `const` __BACKUP\_KEY\_ENV__: `"NGDPBASE_BACKUP_KEY"` = `'NGDPBASE_BACKUP_KEY'`

Defined in: src/utils/backupKey.ts:15

The environment variable holding the key every backup is encrypted under.
Its own secret, not the database key: the copy that travels and the copy
that stays should not fall to the same compromise. Never a config key.
