[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/sqliteMigrations](../README.md) / addColumnWithDefault

# Function: addColumnWithDefault()

> __addColumnWithDefault__(`db`, `table`, `column`, `type`, `defaultValue`): `void`

Defined in: src/providers/sqliteMigrations.ts:42

ADD COLUMN with a default AND a backfill of existing rows, in one statement pair — the yourphr#528
spelling. SQLite's ADD COLUMN ... DEFAULT only applies the default to rows created afterwards
on some historic versions and to reads via the schema on others; the explicit UPDATE removes
the ambiguity for every row that already exists.

## Parameters

### db

`Database`

### table

`string`

### column

`string`

### type

`"TEXT"` \| `"INTEGER"` \| `"REAL"`

### defaultValue

`string` \| `number`

## Returns

`void`
