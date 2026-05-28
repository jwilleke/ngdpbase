---
name: MyContributionsPlugin
description: Renders the My Contributions card from /profile inside any wiki page (#688)
dateModified: '2026-05-28'
category: plugins
code: src/plugins/MyContributionsPlugin.ts
relatedModules:
  - UserManager
  - PageManager
---

# MyContributionsPlugin

Embeds the **My Contributions** card (familiar from `/profile`) into any wiki page. Renders different surfaces depending on whether the viewer is looking at their own profile or someone else's.

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

- **Self-view** (target == viewer) → full six-count card: **Private · Authored · Journal · My Links · Edited · Shared**. Matches `/profile`.
- **Cross-view** (target ≠ viewer) → reduced three-count card: **Authored · Journal · Edited**. Private / Shared / Links are viewer-specific or potentially sensitive and require viewer roles or that user's preferences.
- **Anonymous visitor with no explicit `username`** → empty output (no leak).

## See Also

- [MyLinksPlugin](MyLinksPlugin.md) — sibling render of pinned links
- [UserManager](../managers/UserManager.md)
