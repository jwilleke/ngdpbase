[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / AddonDefaults

# Interface: AddonDefaults

Defined in: src/utils/addonConfigLayer.ts:75

## Properties

### defaults

> __defaults__: `Record`\<`string`, `unknown`\>

Defined in: src/utils/addonConfigLayer.ts:84

The addon's default-config.json with `_`-prefixed comment keys dropped.

***

### dir

> __dir__: `string`

Defined in: src/utils/addonConfigLayer.ts:77

***

### enabled

> __enabled__: `boolean`

Defined in: src/utils/addonConfigLayer.ts:82

Whether the addon is switched on. A turned-off addon's file is read for its
system-categories alone (#1559); none of its other keys reach the merge.

***

### error?

> `optional` __error?__: `string`

Defined in: src/utils/addonConfigLayer.ts:86

Set when the file exists but could not be parsed; the addon then contributes nothing.

***

### slug

> __slug__: `string`

Defined in: src/utils/addonConfigLayer.ts:76
