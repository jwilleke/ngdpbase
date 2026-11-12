[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / extractExcerpt

# Function: extractExcerpt()

> __extractExcerpt__(`raw`, `maxLen`): `string`

Defined in: src/utils/pluginFormatters.ts:495

Strip frontmatter, plugin syntax, and markdown decoration from raw page
content and return plain text suitable for a card excerpt, truncated at
the last word boundary before maxLen characters.

## Parameters

### raw

`string`

### maxLen

`number`

## Returns

`string`
