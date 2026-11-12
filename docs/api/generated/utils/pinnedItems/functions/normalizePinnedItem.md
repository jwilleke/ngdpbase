[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pinnedItems](../README.md) / normalizePinnedItem

# Function: normalizePinnedItem()

> __normalizePinnedItem__(`raw`): [`PinnedItem`](../../../types/User/interfaces/PinnedItem.md) \| `null`

Defined in: src/utils/pinnedItems.ts:19

Bring a raw stored entry into the canonical PinnedItem shape. Returns null
for malformed entries (neither url nor pageName present).

Legacy entry `{pageName: "Foo", title: "Foo"}` → `{url: "/view/Foo", title, pageName}`.
New entry `{url: "/my/journal", title: "My Journal"}` → unchanged plus default title.

## Parameters

### raw

`unknown`

## Returns

[`PinnedItem`](../../../types/User/interfaces/PinnedItem.md) \| `null`
