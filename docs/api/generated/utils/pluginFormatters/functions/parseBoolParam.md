[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / parseBoolParam

# Function: parseBoolParam()

> __parseBoolParam__(`value`, `defaultVal`): `boolean`

Defined in: src/utils/pluginFormatters.ts:436

Parse a boolean plugin parameter.
'0' and 'false' (case-insensitive) → false; '1' and 'true' → true; else → defaultVal.

## Parameters

### value

`string` \| `number` \| `boolean` \| `undefined`

### defaultVal

`boolean`

## Returns

`boolean`
