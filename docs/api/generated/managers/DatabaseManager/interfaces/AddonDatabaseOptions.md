[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/DatabaseManager](../README.md) / AddonDatabaseOptions

# Interface: AddonDatabaseOptions

Defined in: src/managers/DatabaseManager.ts:116

What an add-on hands over to have its database opened and migrated.

## Properties

### ledgerTable

> __ledgerTable__: `string`

Defined in: src/managers/DatabaseManager.ts:120

Where the applied ids are recorded. Must start with the owner's slug (dashes as underscores) and `_`.

***

### migrations

> __migrations__: [`Migration`](../../../providers/sqliteMigrations/interfaces/Migration.md)[]

Defined in: src/managers/DatabaseManager.ts:118

Dated migrations, strictly ascending by id — the same rules as core's ledger.
