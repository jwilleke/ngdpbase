[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / addonDatabaseLayer

# Function: addonDatabaseLayer()

> __addonDatabaseLayer__(`addons`, `custom`): [`AddonDatabaseLayer`](../interfaces/AddonDatabaseLayer.md)

Defined in: src/utils/addonConfigLayer.ts:261

The databases the addons declare (#1860), from every addon's file whether
or not it is enabled. An addon declares only under its own slug; a second
declaration of one owner's ledger is refused. `custom` is the operator's
file: a value there for a declaration's key is ignored, and said so.

## Parameters

### addons

readonly [`AddonDefaults`](../interfaces/AddonDefaults.md)[]

### custom

`Record`\<`string`, `unknown`\>

## Returns

[`AddonDatabaseLayer`](../interfaces/AddonDatabaseLayer.md)
