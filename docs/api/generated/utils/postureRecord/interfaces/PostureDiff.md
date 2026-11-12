[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/postureRecord](../README.md) / PostureDiff

# Interface: PostureDiff

Defined in: src/utils/postureRecord.ts:48

## Properties

### added

> __added__: `string`[]

Defined in: src/utils/postureRecord.ts:57

***

### changed

> __changed__: `object`[]

Defined in: src/utils/postureRecord.ts:56

#### from

> __from__: `unknown`

#### key

> __key__: `string`

#### to

> __to__: `unknown`

***

### comparable

> __comparable__: `boolean`

Defined in: src/utils/postureRecord.ts:55

False when there is no previous record to compare against.

Kept separate from "nothing changed", because they are different facts and
only one of them is reassuring.

***

### removed

> __removed__: `string`[]

Defined in: src/utils/postureRecord.ts:58
