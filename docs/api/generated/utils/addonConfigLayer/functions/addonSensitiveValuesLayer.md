[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonConfigLayer](../README.md) / addonSensitiveValuesLayer

# Function: addonSensitiveValuesLayer()

> __addonSensitiveValuesLayer__(`addons`): [`AddonSensitiveValuesLayer`](../interfaces/AddonSensitiveValuesLayer.md)

Defined in: src/utils/addonConfigLayer.ts:324

Which values an addon may classify (#1889): its own, `ngdpbase.addons.<slug>`
and anything under it, top-level keys and paths alike. An entry for core's
keys or another addon's could unhide them (`false`, or `sensitive` for a
`secret`), so it refuses the addon, as a database declaration under another
slug does (#1860): it is not loaded and none of its keys apply. Only an
enabled addon's entries reach the merge, so only an enabled addon is checked.

## Parameters

### addons

readonly [`AddonDefaults`](../interfaces/AddonDefaults.md)[]

## Returns

[`AddonSensitiveValuesLayer`](../interfaces/AddonSensitiveValuesLayer.md)
