[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sensitiveValues](../README.md) / hideDeclaredPaths

# Function: hideDeclaredPaths()

> __hideDeclaredPaths__(`key`, `value`, `levels`, `viewer`): `unknown`

Defined in: src/utils/sensitiveValues.ts:182

A key's value with what its path entries name hidden from this viewer
(#1889). An empty value, and a bare `$NAME` reference, are kept: neither is
the secret. The key's own level is [shownValue](shownValue.md)'s business.

## Parameters

### key

`string`

### value

`unknown`

### levels

`Map`\<`string`, [`ValueLevel`](../type-aliases/ValueLevel.md)\>

### viewer

[`ValueViewer`](../interfaces/ValueViewer.md)

## Returns

`unknown`
