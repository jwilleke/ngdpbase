[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/formerTitles](../README.md) / buildFormerTitleIndex

# Function: buildFormerTitleIndex()

> __buildFormerTitleIndex__(`pages`): `Map`\<`string`, `string` \| *typeof* [`AMBIGUOUS`](../variables/AMBIGUOUS.md)\>

Defined in: src/utils/formerTitles.ts:119

Derive a former-title → current-title lookup from the page set.

Keys are lowercased, so resolution is case-insensitive in the same way the
provider's title index is.

A title held by a __live__ page is marked ambiguous rather than resolving to
whoever once held it: live resolution runs first and will have answered
already, so reaching this map for a live title means something is wrong, and
refusing is the safe reading.

## Parameters

### pages

readonly [`FormerTitleSource`](../interfaces/FormerTitleSource.md)[]

Every page, with its title and raw `formerTitles` frontmatter

## Returns

`Map`\<`string`, `string` \| *typeof* [`AMBIGUOUS`](../variables/AMBIGUOUS.md)\>

Map of lowercased former title → current title, or AMBIGUOUS
