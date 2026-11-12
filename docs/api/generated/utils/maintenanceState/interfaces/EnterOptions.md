[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/maintenanceState](../README.md) / EnterOptions

# Interface: EnterOptions

Defined in: src/utils/maintenanceState.ts:109

What a manager may say when it puts the site in maintenance mode.

## Properties

### adminsMayEnter?

> `optional` __adminsMayEnter?__: `boolean`

Defined in: src/utils/maintenanceState.ts:120

Whether administrators may use the whole site while this reason holds.
False (the default) for a failure: everyone, administrators included, gets
only `/admin`, `/login` and `/logout`, because the rest of the site cannot
be trusted to work. True only for the admin switch, where nothing is broken.

***

### estimatedDuration?

> `optional` __estimatedDuration?__: `string`

Defined in: src/utils/maintenanceState.ts:113

What visitors are told about how long, in place of the configured estimate.

***

### message?

> `optional` __message?__: `string`

Defined in: src/utils/maintenanceState.ts:111

What visitors are told, in place of the configured message.
