[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteLocation](../README.md) / networkFilesystemAt

# Function: networkFilesystemAt()

> __networkFilesystemAt__(`target`, `statfs?`, `platform?`): \{ `name`: `string`; `probe`: `string`; `type`: `number`; \} \| `null`

Defined in: src/providers/sqliteLocation.ts:31

The network filesystem `target` would live on, or null (#1714: shared by the SQLite and file stores).

## Parameters

### target

`string`

### statfs?

(`path`) => [`StatFsLike`](../interfaces/StatFsLike.md)

### platform?

`string` = `process.platform`

## Returns

\{ `name`: `string`; `probe`: `string`; `type`: `number`; \} \| `null`
