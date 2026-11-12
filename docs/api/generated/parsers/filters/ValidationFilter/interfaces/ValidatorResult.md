[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/filters/ValidationFilter](../README.md) / ValidatorResult

# Interface: ValidatorResult

Defined in: src/parsers/filters/ValidationFilter.ts:47

Rich validator result. Rules that can locate the offending position
return `{ valid, line, column }` so the editor can pin the cursor to it
(#596 / #616). Rules that only need pass/fail return a plain boolean.

## Properties

### column?

> `optional` __column?__: `number`

Defined in: src/parsers/filters/ValidationFilter.ts:50

***

### line?

> `optional` __line?__: `number`

Defined in: src/parsers/filters/ValidationFilter.ts:49

***

### valid

> __valid__: `boolean`

Defined in: src/parsers/filters/ValidationFilter.ts:48
