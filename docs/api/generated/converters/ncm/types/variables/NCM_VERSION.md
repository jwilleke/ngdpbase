[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [converters/ncm/types](../README.md) / NCM\_VERSION

# Variable: NCM\_VERSION

> `const` __NCM\_VERSION__: `2` = `2`

Defined in: src/converters/ncm/types.ts:22

Current NCM profile version. Bumped only when the profile changes; pages
 are re-normalized to a new version ONLY via an explicit migration, never
 silently on read (spec §3, Q4).

 v2 (#728 table profile): GFM pipe tables are up-converted to the JSPWiki
 styled form (`%%table-*` wrapped `||header||`/`|cell|`) — v1 left tables as
 passthrough. See docs/NGDP-Compatible-Markdown.md §2.1.
