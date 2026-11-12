[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / Placement

# Type Alias: Placement

> __Placement__ = `"right"` \| `"left"` \| `"block"` \| `"inline"`

Defined in: src/utils/pluginFormatters.ts:461

Where a plugin's rendered output should sit in the page flow.

- 'right'  — float right; surrounding text wraps on the left (Wikipedia infobox).
- 'left'   — float left; surrounding text wraps on the right.
- 'block'  — full-width block element below the caption text. No float.
- 'inline' — inline-block; sits next to other inline content.

Plugins combine `placementClass(placement)` with their own classes, e.g.
`<div class="volcano-infobox plugin-placement-right">…</div>`. The
`.plugin-placement-*` CSS lives in ngdpbase core.css so every plugin gets a
consistent contract whether or not its addon stylesheet has loaded.
