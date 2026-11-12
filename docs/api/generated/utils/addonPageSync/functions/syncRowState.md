[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonPageSync](../README.md) / syncRowState

# Function: syncRowState()

> __syncRowState__(`seedStatus`, `userModifiedFlag?`): [`SyncRowState`](../interfaces/SyncRowState.md)

Defined in: src/utils/addonPageSync.ts:92

The one mapping from `evaluateSeededAddonPage`'s answer to the admin screen's
words (#1918). `userModifiedFlag` is a page's explicit `user-modified`
frontmatter, which marks it edited even when the hash cannot tell.

## Parameters

### seedStatus

[`SeededAddonPageStatus`](../type-aliases/SeededAddonPageStatus.md)

`evaluateSeededAddonPage`'s answer for the live copy

### userModifiedFlag?

`boolean` = `false`

The live copy is explicitly marked edited

## Returns

[`SyncRowState`](../interfaces/SyncRowState.md)
