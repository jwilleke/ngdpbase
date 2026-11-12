[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteMigrations](../README.md) / Migration

# Interface: Migration

Defined in: src/providers/sqliteMigrations.ts:22

## Properties

### description

> __description__: `string`

Defined in: src/providers/sqliteMigrations.ts:25

***

### id

> __id__: `string`

Defined in: src/providers/sqliteMigrations.ts:24

Dated, sortable: YYYYMMDDHHMMSS. The registry must be strictly ascending.

***

### up

> __up__: (`db`) => `void`

Defined in: src/providers/sqliteMigrations.ts:26

#### Parameters

##### db

`Database`

#### Returns

`void`
