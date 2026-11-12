[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Schema](../README.md) / PageFrontmatterMapper

# Type Alias: PageFrontmatterMapper

> __PageFrontmatterMapper__ = (`frontmatter`, `body`) => [`Article`](../interfaces/Article.md)

Defined in: src/types/Schema.ts:508

Maps a page frontmatter object + body to an Article CreativeWork.
Implementation lands in Slice 4 (#755) — PageManager.

Note: the concrete input type is intentionally loose here; Slice 4
will narrow it to the canonical PageFrontmatter type.

## Parameters

### frontmatter

`Record`\<`string`, `unknown`\>

### body

`string`

## Returns

[`Article`](../interfaces/Article.md)
