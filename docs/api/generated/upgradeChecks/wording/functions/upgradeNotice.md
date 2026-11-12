[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [upgradeChecks/wording](../README.md) / upgradeNotice

# Function: upgradeNotice()

> __upgradeNotice__(`items`, `version`, `canFix`): [`UpgradeNotice`](../interfaces/UpgradeNotice.md) \| `null`

Defined in: src/upgradeChecks/wording.ts:51

The dashboard notice. It leads with what is wrong; whoever cannot change site
settings is told it is not theirs to decide rather than asked to decide.

## Parameters

### items

[`OpenUpgradeItem`](../../../managers/UpgradeCheckManager/interfaces/OpenUpgradeItem.md)[]

### version

`string`

### canFix

`boolean`

## Returns

[`UpgradeNotice`](../interfaces/UpgradeNotice.md) \| `null`
