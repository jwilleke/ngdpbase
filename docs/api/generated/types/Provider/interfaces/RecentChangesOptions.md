[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / RecentChangesOptions

# Interface: RecentChangesOptions

Defined in: src/types/Provider.ts:88

Options for [PageProvider.getRecentChanges](PageProvider.md#getrecentchanges).

## Properties

### limit?

> `optional` __limit?__: `number`

Defined in: src/types/Provider.ts:90

Maximum number of entries to return after filtering. Default 50.

***

### principals?

> `optional` __principals?__: `string`[]

Defined in: src/types/Provider.ts:103

Caller principals (typically `[...userContext.roles, userContext.username]`).
Used to evaluate audience visibility for private pages. If omitted (anonymous),
private pages are excluded.

# 1116: this is the ONLY visibility input. A caller supplies facts about who
is asking, never the conclusion — the provider derives the admin bypass
from an `admin` principal itself. The old `includeAll` boolean was the
conclusion handed over, and any caller could pass `true`.

***

### since?

> `optional` __since?__: `string` \| `Date`

Defined in: src/types/Provider.ts:92

Only include pages modified at or after this cutoff.
