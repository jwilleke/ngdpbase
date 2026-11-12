[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BaseManager](../README.md) / StagedRestoreAtStart

# Interface: StagedRestoreAtStart

Defined in: src/managers/BaseManager.ts:184

What a staged restore of a manager's part did at this start (#1985, #1986).

## Properties

### applied

> __applied__: `object`[]

Defined in: src/managers/BaseManager.ts:186

Each live path now restored, with where its previous content was kept.

#### kept

> __kept__: `string`

#### live

> __live__: `string`

***

### backupTakenAt?

> `optional` __backupTakenAt?__: `string`

Defined in: src/managers/BaseManager.ts:190

When the backup it came from was taken.

***

### refused?

> `optional` __refused?__: `string`

Defined in: src/managers/BaseManager.ts:188

Why nothing (or, after a failed rename, not everything) was applied.
