[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonPageSync](../README.md) / SyncRowState

# Interface: SyncRowState

Defined in: src/utils/addonPageSync.ts:79

How a shipped item's sync status reads on an admin screen: the status words
and the edit protection of Admin → Required Pages, which every screen that
syncs shipped content shares (`views/_sync-status.ejs`, `views/_sync-button.ejs`,
# 1918).

- `status` — `modified` when the live copy differs from what ships,
   `current` when it is the same.
- `userModified` — edited on this site: Sync does not replace it; Force Sync
   does, after a confirm.

## Properties

### status

> __status__: `"current"` \| `"modified"`

Defined in: src/utils/addonPageSync.ts:80

***

### userModified

> __userModified__: `boolean`

Defined in: src/utils/addonPageSync.ts:81
