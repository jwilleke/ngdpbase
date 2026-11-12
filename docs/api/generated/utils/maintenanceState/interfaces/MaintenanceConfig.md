[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/maintenanceState](../README.md) / MaintenanceConfig

# Interface: MaintenanceConfig

Defined in: src/utils/maintenanceState.ts:129

The configuration reads the visitor view needs — `ConfigurationManager`'s
own methods, so callers pass the manager itself. `getCustomProperty` tells
"the site set this" from "this is the shipped default", which decides
whether the legacy key may still speak.

## Methods

### getCustomProperty()?

> `optional` __getCustomProperty__(`key`): `unknown`

Defined in: src/utils/maintenanceState.ts:131

#### Parameters

##### key

`string`

#### Returns

`unknown`

***

### getProperty()

> __getProperty__(`key`, `fallback`): `unknown`

Defined in: src/utils/maintenanceState.ts:130

#### Parameters

##### key

`string`

##### fallback

`unknown`

#### Returns

`unknown`
