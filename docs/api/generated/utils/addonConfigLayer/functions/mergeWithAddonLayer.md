[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / mergeWithAddonLayer

# Function: mergeWithAddonLayer()

> __mergeWithAddonLayer__\<`T`\>(`shipped`, `addons`, `custom`): `object`

Defined in: src/utils/addonConfigLayer.ts:512

shipped ⊕ addons ⊕ custom, in that order of precedence (custom wins), with
the problems found in the addons' system-categories (#1559).

Each enabled addon folds onto the shipped defaults in turn, not onto the
other addons alone: an addon's list of names for a set map (`secret-keys`)
then adds to the shipped set, and a second addon's list adds again rather
than replacing the first (#1612). `ngdpbase.system-category` is taken from
every addon, enabled or not, through addonCategoryLayer, and its
owner-decided fields stand over custom.

## Type Parameters

### T

`T` *extends* `Record`\<`string`, `unknown`\>

## Parameters

### shipped

`T`

### addons

readonly [`AddonDefaults`](../interfaces/AddonDefaults.md)[]

### custom

`Partial`\<`T`\>

## Returns

`object`

### databases

> __databases__: [`AddonDatabaseDeclaration`](../../addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md)[]

### merged

> __merged__: `T`

### problems

> __problems__: `string`[]

### refused

> __refused__: `Map`\<`string`, `string`\>

### siteCritical

> __siteCritical__: `Map`\<`string`, `boolean`\>
