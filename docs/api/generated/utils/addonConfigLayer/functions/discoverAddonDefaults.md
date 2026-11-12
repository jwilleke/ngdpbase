[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / discoverAddonDefaults

# Function: discoverAddonDefaults()

> __discoverAddonDefaults__(`base`, `cwd?`, `dataFolder?`): [`AddonDefaults`](../interfaces/AddonDefaults.md)[]

Defined in: src/utils/addonConfigLayer.ts:132

The defaults of every installed addon, enabled or not, in discovery order,
each marked with whether it is `enabled`: the merge takes everything from
an enabled addon and only the system-categories from a turned-off one
(#1559). An addon with no default-config.json is omitted; one whose file
cannot be parsed is returned with `error` set so the caller can say so
rather than silently skip it.

## Parameters

### base

`Record`\<`string`, `unknown`\>

### cwd?

`string` = `...`

### dataFolder?

`string` = `...`

## Returns

[`AddonDefaults`](../interfaces/AddonDefaults.md)[]
