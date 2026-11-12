[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreMigrations](../README.md) / storeMigrationDone

# Function: storeMigrationDone()

> __storeMigrationDone__(`ctx`, `where`, `id`): `Promise`\<`boolean`\>

Defined in: src/utils/privateStoreMigrations.ts:54

Has this store had the migration `id`?

## Parameters

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### where

[`StoreMigrationTarget`](../interfaces/StoreMigrationTarget.md)

### id

`string`

## Returns

`Promise`\<`boolean`\>

false when the record is missing or unreadable — running a
  migration a second time is safe, and skipping one that never ran is not.
