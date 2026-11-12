[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / AddonDatabaseLayer

# Interface: AddonDatabaseLayer

Defined in: src/utils/addonConfigLayer.ts:247

## Properties

### declarations

> __declarations__: [`AddonDatabaseDeclaration`](../../addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md)[]

Defined in: src/utils/addonConfigLayer.ts:249

Every sound declaration, of every installed addon, `enabled` as its addon is.

***

### problems

> __problems__: `string`[]

Defined in: src/utils/addonConfigLayer.ts:252

***

### refused

> __refused__: `Map`\<`string`, `string`\>

Defined in: src/utils/addonConfigLayer.ts:251

Addons whose declaration was refused, by slug, with why: never loaded.
