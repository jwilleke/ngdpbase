[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/phoneNumbers](../README.md) / localForm

# Function: localForm()

> __localForm__(`stored`, `fallback`): `object`

Defined in: src/utils/phoneNumbers.ts:56

A stored number shown back: its national form and its country, for the
dropdown. A value that is not E.164 (written before #2073, or by an
add-on) is shown as stored, with `fallback` as its country.

## Parameters

### stored

`string`

### fallback

`string`

## Returns

`object`

### country

> __country__: `string`

### number

> __number__: `string`
