[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonPageSync](../README.md) / ShippedPageStateName

# Type Alias: ShippedPageStateName

> __ShippedPageStateName__ = `"same-as-shipped"` \| `"update-ready"` \| `"edited-not-confirmed"` \| `"both-changed"`

Defined in: src/utils/addonPageSync.ts:46

The state of a shipped page that exists on the site (#2389, slice 1): the one
answer the core list, the add-on list and `PageManager.syncShippedPages` all
read, from docs/design/required-pages-sync-states.md.

- `same-as-shipped`       — the text matches what ships and nobody edited it here.
- `update-ready`          — a newer version shipped; this page was never edited
                             here. The only state Sync All replaces.
- `edited-not-confirmed`  — changed on this site (an editor save set
                             `user-modified`, or it has no stamp, or its text no
                             longer matches its stamp). Never replaced without
                             an admin.
- `both-changed`          — edited here, and a newer version also shipped.

The kept states (K) and working changes (W) come in a later slice.
