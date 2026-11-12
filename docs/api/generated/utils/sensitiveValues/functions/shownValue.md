[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sensitiveValues](../README.md) / shownValue

# Function: shownValue()

> __shownValue__(`key`, `value`, `levels`, `viewer`): `unknown`

Defined in: src/utils/sensitiveValues.ts:233

The value a viewer may see for a key: itself, or `HIDDEN`; inside it, what
its path entries name is hidden as well (#1889). An empty value is shown as
it is: "not set" reveals nothing.

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
