[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / valueFits

# Function: valueFits()

> __valueFits__(`attributeType`, `value`): `boolean`

Defined in: src/utils/policyAttributes.ts:135

Does a value read for an attribute fit the type it is declared with? A
value that does not is treated as missing by the reader, so a comparison on
it is unknown and fails closed, not a definite false or true (#2261). Never
coerces: "5" is not an integer. An empty string is a string, a value and not
a missing one.

## Parameters

### attributeType

`string`

### value

`unknown`

## Returns

`boolean`
