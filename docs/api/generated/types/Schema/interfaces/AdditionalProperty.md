[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / AdditionalProperty

# Interface: AdditionalProperty

Defined in: src/types/Schema.ts:81

schema.org PropertyValue — the render-time wrapper for genuinely-custom
fields that have no schema.org equivalent (per Decision 5,
`additionalProperty` fallback). The render mapper emits these; internal
code uses `ngdp:` prefixed keys directly.

## Properties

### @type

> __@type__: `"PropertyValue"`

Defined in: src/types/Schema.ts:82

***

### name

> __name__: `string`

Defined in: src/types/Schema.ts:83

***

### value

> __value__: `string` \| `number` \| `boolean`

Defined in: src/types/Schema.ts:84
