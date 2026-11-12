[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/DatabaseManager](../README.md) / checkAddonDatabaseRequest

# Function: checkAddonDatabaseRequest()

> __checkAddonDatabaseRequest__(`owner`, `options`): `void`

Defined in: src/managers/DatabaseManager.ts:138

The request rules (addonDatabaseRules): the owner is a canonical slug, and
the ledger table starts with its prefix. `openAddonDatabase` applies them,
and so does the test kit's in-memory database
(`@jwilleke/ngdpbase-types/testing`, #1865), so a test refuses what a site
refuses.

## Parameters

### owner

`string`

### options

[`AddonDatabaseOptions`](../interfaces/AddonDatabaseOptions.md)

## Returns

`void`
