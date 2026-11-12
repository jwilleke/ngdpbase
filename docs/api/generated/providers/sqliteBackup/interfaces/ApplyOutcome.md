[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteBackup](../README.md) / ApplyOutcome

# Interface: ApplyOutcome

Defined in: src/providers/sqliteBackup.ts:330

## Properties

### applied

> __applied__: `object`[]

Defined in: src/providers/sqliteBackup.ts:332

Databases now on the restored copy, each with where its previous file was kept.

#### kept

> __kept__: `string`

#### live

> __live__: `string`

#### name

> __name__: `string`

***

### refused?

> `optional` __refused?__: `string`

Defined in: src/providers/sqliteBackup.ts:334

Why nothing was applied; the staged files were set aside as `*.incomplete`.
