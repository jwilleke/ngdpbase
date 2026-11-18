[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonPageSync](../README.md) / SyncRowState

# Interface: SyncRowState

Defined in: src/utils/addonPageSync.ts:97

How a shipped item's sync status reads on an admin screen: the legacy status
word the screen's script keys on, plus the edit flag (`views/_sync-status.ejs`,
`views/_sync-button.ejs`, #1918).

- `status` — `modified` when the live copy is not Same as shipped.
- `userModified` — edited on this site (Edited here, or Both changed): Sync
   does not replace it; Use shipped version does, after a confirm.

## Properties

### status

> __status__: `"current"` \| `"modified"`

Defined in: src/utils/addonPageSync.ts:98

***

### userModified

> __userModified__: `boolean`

Defined in: src/utils/addonPageSync.ts:99
