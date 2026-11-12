[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/formerTitles](../README.md) / computeFormerTitles

# Function: computeFormerTitles()

> __computeFormerTitles__(`existing`, `previousTitle`, `newTitle`): `string`[] \| `undefined`

Defined in: src/utils/formerTitles.ts:82

Work out what `formerTitles` should be after a save.

Returns `undefined` when there is nothing to record and nothing already held,
so an ordinary save on a never-renamed page does not add an empty key to its
frontmatter.

## Parameters

### existing

`unknown`

Current `formerTitles` value, straight off disk and untrusted

### previousTitle

`string` \| `null` \| `undefined`

The title the page had before this save

### newTitle

`string` \| `null` \| `undefined`

The title it is being given

## Returns

`string`[] \| `undefined`

The new list, or undefined when the field should stay absent
