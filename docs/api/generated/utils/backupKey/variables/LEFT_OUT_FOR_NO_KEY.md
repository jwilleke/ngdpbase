[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/backupKey](../README.md) / LEFT\_OUT\_FOR\_NO\_KEY

# Variable: LEFT\_OUT\_FOR\_NO\_KEY

> `const` __LEFT\_OUT\_FOR\_NO\_KEY__: `"NGDPBASE_BACKUP_KEY is not set, so "`

Defined in: src/utils/backupKey.ts:32

How every part left out of a backup for want of the key says so: the
message starts with this. BackupManager recognises such a part by it
(`isLeftOutForNoKey`): those are covered by its banner and one-time
notice, never a notice per backup (operator, #1912).
