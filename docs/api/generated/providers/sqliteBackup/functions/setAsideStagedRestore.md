[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteBackup](../README.md) / setAsideStagedRestore

# Function: setAsideStagedRestore()

> __setAsideStagedRestore__(`applicationFile`, `reason`): [`ApplyOutcome`](../interfaces/ApplyOutcome.md)

Defined in: src/providers/sqliteBackup.ts:404

Set a staged restore aside without applying any of it (#1876): every
`*.db.staged` beside the application database and the manifest become
`*.incomplete`. Used when the site restore it belongs to is not applied.

## Parameters

### applicationFile

`string`

### reason

`string`

## Returns

[`ApplyOutcome`](../interfaces/ApplyOutcome.md)
