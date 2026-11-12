[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteLocation](../README.md) / refuseNetworkFilesystem

# Function: refuseNetworkFilesystem()

> __refuseNetworkFilesystem__(`databaseFile`, `statfs?`, `platform?`): `void`

Defined in: src/providers/sqliteLocation.ts:54

Throws, naming the path and the filesystem, when `databaseFile` would be opened on a network
filesystem. A file that does not exist yet is judged by the nearest directory that does, since
that is where SQLite will create it.

## Parameters

### databaseFile

`string`

### statfs?

(`path`) => [`StatFsLike`](../interfaces/StatFsLike.md)

### platform?

`string` = `process.platform`

## Returns

`void`
