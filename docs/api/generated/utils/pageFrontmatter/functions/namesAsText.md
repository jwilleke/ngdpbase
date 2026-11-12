[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageFrontmatter](../README.md) / namesAsText

# Function: namesAsText()

> __namesAsText__\<`T`\>(`data`): `T`

Defined in: src/utils/pageFrontmatter.ts:57

Make a metadata object's name fields text in place, and return it.

For callers holding metadata that was parsed without
`parsePageFrontmatter`; a save must never meet a boolean or Date title.

## Type Parameters

### T

`T` *extends* `Record`\<`string`, `unknown`\>

## Parameters

### data

`T`

## Returns

`T`
