[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / compareLeaf

# Function: compareLeaf()

> __compareLeaf__(`kind`, `left`, `right`): `boolean` \| `undefined`

Defined in: src/utils/policyAttributes.ts:156

Decides one comparison once both sides are read. `undefined` is unknown: a
side that is missing, or not of a type the function can compare. Both sides
must be the same kind of value (a string, a boolean or a whole number), so
"5" never equals 5 and NaN never compares. `is-in` takes an array, or a Set the
evaluator built from a literal list; every entry of an array must be the
kind of value on the left. An empty string is a value, not a missing one.

## Parameters

### kind

[`ComparisonKind`](../type-aliases/ComparisonKind.md)

### left

`unknown`

### right

`unknown`

## Returns

`boolean` \| `undefined`
