[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Config](../README.md) / ConfigChangeEvent

# Interface: ConfigChangeEvent

Defined in: src/types/Config.ts:501

Configuration change event

Event emitted when configuration changes.

## Properties

### changedBy?

> `optional` __changedBy?__: `string`

Defined in: src/types/Config.ts:515

User who made the change

***

### key

> __key__: `string`

Defined in: src/types/Config.ts:503

Property key that changed

***

### newValue

> __newValue__: `unknown`

Defined in: src/types/Config.ts:509

New value

***

### oldValue

> __oldValue__: `unknown`

Defined in: src/types/Config.ts:506

Old value

***

### source

> __source__: `string`

Defined in: src/types/Config.ts:518

Source of change (file, api, ui)

***

### timestamp

> __timestamp__: `string`

Defined in: src/types/Config.ts:512

Timestamp of change
