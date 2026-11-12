[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseSearchProvider](../README.md) / SearchCriteria

# Interface: SearchCriteria

Defined in: src/providers/BaseSearchProvider.ts:100

Advanced search criteria

## Indexable

> \[`key`: `string`\]: `unknown`

Additional criteria

## Properties

### author?

> `optional` __author?__: `string` \| `string`[]

Defined in: src/providers/BaseSearchProvider.ts:130

Author to filter by (page creator — matches metadata.author). A list
matches any of its values: SearchManager turns a username into the
values that name that user, their identity

#### Id

and the username (#2097).

***

### categories?

> `optional` __categories?__: `string`[]

Defined in: src/providers/BaseSearchProvider.ts:105

Categories to filter by

***

### dateRange?

> `optional` __dateRange?__: `object`

Defined in: src/providers/BaseSearchProvider.ts:136

Date range

#### from?

> `optional` __from?__: `string`

#### to?

> `optional` __to?__: `string`

***

### editor?

> `optional` __editor?__: `string` \| `string`[]

Defined in: src/providers/BaseSearchProvider.ts:133

Editor to filter by (last modifier — matches metadata.editor); a list as for `author`.

***

### knowledgeRoles?

> `optional` __knowledgeRoles?__: `string`[]

Defined in: src/providers/BaseSearchProvider.ts:110

# 706: knowledge-role values to filter by (source / citation / concept).
 Pages without a `knowledge-role` set are excluded when this filter has
 any entries — mirrors how `categories` excludes off-axis pages.

***

### maxResults?

> `optional` __maxResults?__: `number`

Defined in: src/providers/BaseSearchProvider.ts:142

Maximum results to return

***

### query?

> `optional` __query?__: `string`

Defined in: src/providers/BaseSearchProvider.ts:102

Search query

***

### searchIn?

> `optional` __searchIn?__: `string`[]

Defined in: src/providers/BaseSearchProvider.ts:123

Fields to search in (title, content, category, keywords, or all)

***

### statuses?

> `optional` __statuses?__: `string`[]

Defined in: src/providers/BaseSearchProvider.ts:120

Editorial lifecycle states to filter by (draft/review/published — #893).
 Pages without a `status` count as 'published'.

***

### systemKeywords?

> `optional` __systemKeywords?__: `string`[]

Defined in: src/providers/BaseSearchProvider.ts:116

System keywords to filter by (auto-tagged or manually set — #507/#509)

***

### userKeywords?

> `optional` __userKeywords?__: `string`[]

Defined in: src/providers/BaseSearchProvider.ts:113

User keywords to filter by
