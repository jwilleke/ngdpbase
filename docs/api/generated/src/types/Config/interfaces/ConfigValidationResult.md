[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Config](../README.md) / ConfigValidationResult

# Interface: ConfigValidationResult

Defined in: [src/types/Config.ts:339](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L339)

Configuration validation result

Result of validating configuration.

## Properties

### errors

> __errors__: `object`[]

Defined in: [src/types/Config.ts:344](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L344)

Validation errors

#### key

> __key__: `string`

#### message

> __message__: `string`

#### value?

> `optional` __value__: `unknown`

***

### valid

> __valid__: `boolean`

Defined in: [src/types/Config.ts:341](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L341)

Whether configuration is valid

***

### warnings

> __warnings__: `object`[]

Defined in: [src/types/Config.ts:351](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Config.ts#L351)

Validation warnings

#### key

> __key__: `string`

#### message

> __message__: `string`

#### value?

> `optional` __value__: `unknown`
