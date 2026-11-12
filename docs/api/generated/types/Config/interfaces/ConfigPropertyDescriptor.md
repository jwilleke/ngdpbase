[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Config](../README.md) / ConfigPropertyDescriptor

# Interface: ConfigPropertyDescriptor

Defined in: src/types/Config.ts:455

Configuration property descriptor

Metadata about a configuration property (for validation and UI).

## Properties

### category?

> `optional` __category?__: `string`

Defined in: src/types/Config.ts:490

Property category for grouping

***

### defaultValue

> __defaultValue__: `unknown`

Defined in: src/types/Config.ts:460

Default value

***

### description

> __description__: `string`

Defined in: src/types/Config.ts:466

Human-readable description

***

### key

> __key__: `string`

Defined in: src/types/Config.ts:457

Property key

***

### required

> __required__: `boolean`

Defined in: src/types/Config.ts:469

Whether this is a required property

***

### requiresRestart?

> `optional` __requiresRestart?__: `boolean`

Defined in: src/types/Config.ts:493

Whether property requires restart to take effect

***

### system

> __system__: `boolean`

Defined in: src/types/Config.ts:472

Whether this is a system property (not user-editable)

***

### type

> __type__: `"string"` \| `"number"` \| `"boolean"` \| `"object"` \| `"array"`

Defined in: src/types/Config.ts:463

Value type

***

### validation?

> `optional` __validation?__: `object`

Defined in: src/types/Config.ts:475

Validation rules

#### enum?

> `optional` __enum?__: `unknown`[]

Allowed values (enum)

#### max?

> `optional` __max?__: `number`

Maximum value (for numbers)

#### min?

> `optional` __min?__: `number`

Minimum value (for numbers)

#### pattern?

> `optional` __pattern?__: `string`

Regex pattern (for strings)
