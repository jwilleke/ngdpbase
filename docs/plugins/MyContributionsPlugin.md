---
name: MyContributionsPlugin
description: Renders the My Contributions card from /profile inside any wiki page (#688)
dateModified: '2026-07-28'
category: plugins
code: src/plugins/MyContributionsPlugin.ts
relatedModules:
  - UserManager
  - PageManager
---

# MyContributionsPlugin

Embeds the __My Contributions__ card (familiar from `/profile`) into any wiki page. Renders different surfaces depending on whether the viewer is looking at their own profile or someone else's.

## Usage

```wiki
[{MyContributions}]                          — defaults to the viewing user
[{MyContributions username='alice'}]         — explicit target user
[{MyContributions username='$currentUser'}]  — explicit form of the default
```

## Parameters

| Parameter | Default | Description |
|---|---|---|
| `username` | viewing user | Target user; literal username or `$currentUser` sentinel |

## Authorisation Model

The card adapts to the viewer/target relationship:

- __Self-view__ (target == viewer) → full six-count card: __Private · Authored · Journal · My Links · Edited · Shared__. Matches `/profile`.
- __Cross-view__ (target ≠ viewer) → reduced three-count card: __Authored · Journal · Edited__. Private / Shared / Links are viewer-specific or potentially sensitive and require viewer roles or that user's preferences.
- __Anonymous visitor with no explicit `username`__ → empty output (no leak).

## Captures row (#1004)

A seventh row, __My Captures__ → `/my/captures`, appears __only__ when both hold:

1. the viewer is looking at their own card (captures are personal clippings, same reasoning as `Private Pages`), and
2. `ngdpbase.capture.enabled` is `true` on the instance.

When capture is disabled the count is left undefined and the row is dropped entirely rather than rendered as an em-dash linking to a route that 404s. The count is also not computed in that case, so a card on an instance without capture pays nothing for the feature.

The row counts pages carrying any of `ngdpbase.capture.keywords` (default `['capture']`) in their frontmatter `system-keywords` — read from the page, not from a denormalised index field, so pages written before the feature existed are counted without a back-fill.

This card and `/profile`'s card are separate implementations by design (see the note on `getContributionCounts`); both must gain a row or neither should.

## See Also

- [MyLinksPlugin](MyLinksPlugin.md) — sibling render of pinned links
- [UserManager](../managers/UserManager.md)
