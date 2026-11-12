[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / parsePlacementParam

# Function: parsePlacementParam()

> __parsePlacementParam__(`value`, `defaultPlacement?`): [`Placement`](../type-aliases/Placement.md)

Defined in: src/utils/pluginFormatters.ts:469

Parse a `placement=` plugin parameter to a validated `Placement` value.
Falls back to `defaultPlacement` for missing or unrecognised values.

## Parameters

### value

`string` \| `undefined`

### defaultPlacement?

[`Placement`](../type-aliases/Placement.md) = `'right'`

## Returns

[`Placement`](../type-aliases/Placement.md)
