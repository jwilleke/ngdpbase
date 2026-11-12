[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/UpgradeCheckManager](../README.md) / LiveUpgradeCheck

# Interface: LiveUpgradeCheck

Defined in: src/managers/UpgradeCheckManager.ts:82

A to-do worked out from how the site is set up now, each time Admin is shown, not once per version:
it appears when the setting is there and goes when the setting is changed. It may carry a settings button (`action`).

## Properties

### id

> __id__: `string`

Defined in: src/managers/UpgradeCheckManager.ts:83

## Methods

### items()

> __items__(`viewer`, `version`): `Promise`\<[`UpgradeItem`](UpgradeItem.md)[]\>

Defined in: src/managers/UpgradeCheckManager.ts:84

#### Parameters

##### viewer

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

##### version

`string`

#### Returns

`Promise`\<[`UpgradeItem`](UpgradeItem.md)[]\>
