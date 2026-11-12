[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / addonSiteCriticalLayer

# Function: addonSiteCriticalLayer()

> __addonSiteCriticalLayer__(`addons`, `custom`): [`AddonSiteCriticalLayer`](../interfaces/AddonSiteCriticalLayer.md)

Defined in: src/utils/addonConfigLayer.ts:448

Which addons are site-critical (#1883): the operator's value if the
operator's file sets one, else the addon's own (only under its own slug),
else not. The operator's file wins in both directions, as for every addon
key. The value is exactly `true` or `false`; anything else (the string
`"true"` included) refuses the addon and counts as site-critical, so a
mistyped value fails closed. `custom` keys for an addon with no file, or
one that is not installed, count too.

## Parameters

### addons

readonly [`AddonDefaults`](../interfaces/AddonDefaults.md)[]

### custom

`Record`\<`string`, `unknown`\>

## Returns

[`AddonSiteCriticalLayer`](../interfaces/AddonSiteCriticalLayer.md)
