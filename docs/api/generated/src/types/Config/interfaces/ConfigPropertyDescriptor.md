[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Config](../README.md) / ConfigPropertyDescriptor

# Interface: ConfigPropertyDescriptor

Defined in: [src/types/Config.ts:268](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L268)

Configuration property descriptor

Metadata about a configuration property (for validation and UI).

## Properties

### category?

> `optional` __category__: `string`

Defined in: [src/types/Config.ts:303](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L303)

Property category for grouping

***

### defaultValue

> __defaultValue__: `unknown`

Defined in: [src/types/Config.ts:273](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L273)

Default value

***

### description

> __description__: `string`

Defined in: [src/types/Config.ts:279](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L279)

Human-readable description

***

### key

> __key__: `string`

Defined in: [src/types/Config.ts:270](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L270)

Property key

***

### required

> __required__: `boolean`

Defined in: [src/types/Config.ts:282](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L282)

Whether this is a required property

***

### requiresRestart?

> `optional` __requiresRestart__: `boolean`

Defined in: [src/types/Config.ts:306](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L306)

Whether property requires restart to take effect

***

### system

> __system__: `boolean`

Defined in: [src/types/Config.ts:285](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L285)

Whether this is a system property (not user-editable)

***

### type

> __type__: `"string"` \| `"number"` \| `"boolean"` \| `"object"` \| `"array"`

Defined in: [src/types/Config.ts:276](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L276)

Value type

***

### validation?

> `optional` __validation__: `object`

Defined in: [src/types/Config.ts:288](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L288)

Validation rules

#### enum?

> `optional` __enum__: `unknown`[]

Allowed values (enum)

#### max?

> `optional` __max__: `number`

Maximum value (for numbers)

#### min?

> `optional` __min__: `number`

Minimum value (for numbers)

#### pattern?

> `optional` __pattern__: `string`

Regex pattern (for strings)
