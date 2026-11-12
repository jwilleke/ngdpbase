[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/SectionUtils](../README.md) / spliceSection

# Function: spliceSection()

> __spliceSection__(`markdown`, `sectionIndex`, `newContent`): `string`

Defined in: src/utils/SectionUtils.ts:112

Replace section N with newContent, returning the full updated markdown.
The frontmatter and all other sections are preserved unchanged.
Returns the original markdown if sectionIndex is out of range.

## Parameters

### markdown

`string`

### sectionIndex

`number`

### newContent

`string`

## Returns

`string`
