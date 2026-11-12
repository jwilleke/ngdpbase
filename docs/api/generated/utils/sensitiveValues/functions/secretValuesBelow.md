[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sensitiveValues](../README.md) / secretValuesBelow

# Function: secretValuesBelow()

> __secretValuesBelow__(`key`, `value`, `levels`): `object`[]

Defined in: src/utils/sensitiveValues.ts:196

The strings (and numbers, as text) a key's secret path entries name inside
its value, each with its full path (#1889): what log redaction strikes.
Everything under a named map or list counts.

## Parameters

### key

`string`

### value

`unknown`

### levels

`Map`\<`string`, [`ValueLevel`](../type-aliases/ValueLevel.md)\>

## Returns

`object`[]
