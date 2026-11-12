[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/siteRestore](../README.md) / SiteRestorePart

# Interface: SiteRestorePart

Defined in: src/utils/siteRestore.ts:58

One manager's share of a site restore.

## Properties

### discard?

> `optional` __discard?__: `string`[]

Defined in: src/utils/siteRestore.ts:62

Further files to remove when the restore is discarded (DatabaseManager's own manifest).

***

### manager

> __manager__: `string`

Defined in: src/utils/siteRestore.ts:59

***

### note?

> `optional` __note?__: `string`

Defined in: src/utils/siteRestore.ts:64

***

### status?

> `optional` __status?__: `"applied"` \| `"set-aside"`

Defined in: src/utils/siteRestore.ts:63

***

### swaps

> __swaps__: [`StagedSwap`](../../../managers/BaseManager/interfaces/StagedSwap.md)[]

Defined in: src/utils/siteRestore.ts:60
