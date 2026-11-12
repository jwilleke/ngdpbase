[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseSearchProvider](../README.md) / SearchOptions

# Interface: SearchOptions

Defined in: src/providers/BaseSearchProvider.ts:68

Search options structure

## Properties

### categories?

> `optional` __categories?__: `string`[]

Defined in: src/providers/BaseSearchProvider.ts:76

Filter by categories

***

### maxResults?

> `optional` __maxResults?__: `number`

Defined in: src/providers/BaseSearchProvider.ts:70

Maximum number of results to return

***

### prefixLastTerm?

> `optional` __prefixLastTerm?__: `boolean`

Defined in: src/providers/BaseSearchProvider.ts:94

# 884: treat the LAST query term as a prefix, for as-you-type search.

Opt-in. A user who has typed "volc" wants Volcano; a user who submitted
"volc" deliberately does not want every word starting with it, so this is
never applied to a completed search.

Only the last term is widened — earlier terms are complete words the user
has finished typing.

***

### searchIn?

> `optional` __searchIn?__: `string`[]

Defined in: src/providers/BaseSearchProvider.ts:73

Fields to search in

***

### userKeywords?

> `optional` __userKeywords?__: `string`[]

Defined in: src/providers/BaseSearchProvider.ts:79

Filter by user keywords

***

### wikiContext?

> `optional` __wikiContext?__: [`SearchWikiContext`](SearchWikiContext.md)

Defined in: src/providers/BaseSearchProvider.ts:82

WikiContext for the current request — used to filter private search results
