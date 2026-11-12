[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteBackup](../README.md) / ExportOutcome

# Interface: ExportOutcome

Defined in: src/providers/sqliteBackup.ts:53

## Properties

### failed

> __failed__: `object`[]

Defined in: src/providers/sqliteBackup.ts:56

Databases that could not be copied; the others still are. Each is named, never dropped silently.

#### error

> __error__: `string`

#### name

> __name__: `string`

***

### written

> __written__: `object`[]

Defined in: src/providers/sqliteBackup.ts:54

#### name

> __name__: `string`

#### sizeBytes

> __sizeBytes__: `number`

#### tables

> __tables__: `number`

#### target

> __target__: `string`
