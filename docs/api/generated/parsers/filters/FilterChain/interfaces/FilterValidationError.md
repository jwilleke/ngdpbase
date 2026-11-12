[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/filters/FilterChain](../README.md) / FilterValidationError

# Interface: FilterValidationError

Defined in: src/parsers/filters/FilterChain.ts:29

Structured error returned by FilterChain.collectErrors() (#596).
Filters that opt in implement their own collectErrors() returning rule
violations of `severity: 'error'`. The chain accumulates them across all
enabled filters; the save path (WikiRoutes.savePage) uses the array to
decide whether to block the save and what to surface to the editor.

## Properties

### column?

> `optional` __column?__: `number`

Defined in: src/parsers/filters/FilterChain.ts:35

***

### filterId

> __filterId__: `string`

Defined in: src/parsers/filters/FilterChain.ts:30

***

### line?

> `optional` __line?__: `number`

Defined in: src/parsers/filters/FilterChain.ts:34

***

### message

> __message__: `string`

Defined in: src/parsers/filters/FilterChain.ts:33

***

### rule

> __rule__: `string`

Defined in: src/parsers/filters/FilterChain.ts:31

***

### severity

> __severity__: `"error"`

Defined in: src/parsers/filters/FilterChain.ts:32
