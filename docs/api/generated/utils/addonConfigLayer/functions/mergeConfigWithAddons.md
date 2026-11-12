[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / mergeConfigWithAddons

# Function: mergeConfigWithAddons()

> __mergeConfigWithAddons__\<`T`\>(`shipped`, `custom`, `cwd?`, `dataFolder?`): `object`

Defined in: src/utils/addonConfigLayer.ts:561

The full merge for a caller with the two files already read (the manager,
and the pre-engine reader): discover addons against the shipped+custom view,
then fold them in beneath custom. `declared` is the same merge without
custom (#1638); `addons` lists the enabled addons whose keys apply;
`problems` names every addon system-category refused, every operator value
an owner's declaration overrode, and every turned-off addon whose file
could not be read; `refused` names, by slug, each addon that must not load
because an entry it declares was refused, and why (#1559), or because its
database declaration was (#1860); `databases` is every sound database
declaration of every installed addon, on or off (#1860); `siteCritical`
says, by slug, which addons put the site in maintenance mode when they fail
to load (#1883).

## Type Parameters

### T

`T` *extends* `Record`\<`string`, `unknown`\>

## Parameters

### shipped

`T`

### custom

`Partial`\<`T`\>

### cwd?

`string` = `...`

### dataFolder?

`string` = `...`

## Returns

`object`

### addons

> __addons__: [`AddonDefaults`](../interfaces/AddonDefaults.md)[]

### databases

> __databases__: [`AddonDatabaseDeclaration`](../../addonDatabaseRules/interfaces/AddonDatabaseDeclaration.md)[]

### declared

> __declared__: `T`

### merged

> __merged__: `T`

### problems

> __problems__: `string`[]

### refused

> __refused__: `Map`\<`string`, `string`\>

### siteCritical

> __siteCritical__: `Map`\<`string`, `boolean`\>
