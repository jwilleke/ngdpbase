[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildSitemap](../README.md) / escapeXml

# Function: escapeXml()

> __escapeXml__(`value`): `string`

Defined in: src/utils/buildSitemap.ts:32

Escape the five XML predefined entities.

`&` must be replaced first or the replacements themselves get re-escaped —
`<` would become `&amp;lt;`.

## Parameters

### value

`string`

## Returns

`string`
