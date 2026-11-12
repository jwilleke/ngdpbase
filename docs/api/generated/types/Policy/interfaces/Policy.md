[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Policy](../README.md) / Policy

# Interface: Policy

Defined in: src/types/Policy.ts:77

One entry of `ngdpbase.access.policies`.

## Indexable

> \[`key`: `string`\]: `unknown`

## Properties

### actions?

> `optional` __actions?__: `string`[]

Defined in: src/types/Policy.ts:89

***

### condition?

> `optional` __condition?__: [`PolicyCondition`](../type-aliases/PolicyCondition.md)

Defined in: src/types/Policy.ts:91

Applies only when this holds (#2255); see [PolicyCondition](../type-aliases/PolicyCondition.md).

***

### description?

> `optional` __description?__: `string`

Defined in: src/types/Policy.ts:80

***

### effect?

> `optional` __effect?__: `string`

Defined in: src/types/Policy.ts:86

`allow` or `deny`. Typed as a string because the value comes from
configuration, where an operator can write anything; the evaluator treats
everything that is not `deny` as an allow.

***

### id

> __id__: `string`

Defined in: src/types/Policy.ts:78

***

### name?

> `optional` __name?__: `string`

Defined in: src/types/Policy.ts:79

***

### resources?

> `optional` __resources?__: [`PolicyResource`](PolicyResource.md)[]

Defined in: src/types/Policy.ts:88

***

### subjects?

> `optional` __subjects?__: [`PolicySubject`](PolicySubject.md)[]

Defined in: src/types/Policy.ts:87
