[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Config](../README.md) / ConfigChangeEvent

# Interface: ConfigChangeEvent

Defined in: [src/types/Config.ts:314](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L314)

Configuration change event

Event emitted when configuration changes.

## Properties

### changedBy?

> `optional` __changedBy__: `string`

Defined in: [src/types/Config.ts:328](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L328)

User who made the change

***

### key

> __key__: `string`

Defined in: [src/types/Config.ts:316](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L316)

Property key that changed

***

### newValue

> __newValue__: `unknown`

Defined in: [src/types/Config.ts:322](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L322)

New value

***

### oldValue

> __oldValue__: `unknown`

Defined in: [src/types/Config.ts:319](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L319)

Old value

***

### source

> __source__: `string`

Defined in: [src/types/Config.ts:331](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L331)

Source of change (file, api, ui)

***

### timestamp

> __timestamp__: `string`

Defined in: [src/types/Config.ts:325](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L325)

Timestamp of change
