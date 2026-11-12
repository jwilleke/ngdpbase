[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/PolicyEvaluator](../README.md) / conditionAttributeSource

# Function: conditionAttributeSource()

> __conditionAttributeSource__(`resources`, `types`): `object`

Defined in: src/managers/PolicyEvaluator.ts:389

Which resource attributes a policy's condition may read (#1823).

A policy that names exactly one add-on type (no page matcher) uses that
type's attributes. A policy on a core type, including `system-category`,
still reads the `page` attributes: those conditions are about the page.

## Parameters

### resources

readonly `object`[] \| `undefined`

### types

`Record`\<`string`, \{ `attributes?`: `Record`\<`string`, \{ `type?`: `string`; \}\>; \}\> \| `null`

## Returns

`object`

### attributes

> __attributes__: `Record`\<`string`, \{ `type?`: `string`; \}\>

### label

> __label__: `string`
