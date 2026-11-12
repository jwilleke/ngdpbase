[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [parsers/filters/ValidationFilter](../README.md) / markdownLinkDestination

# Function: markdownLinkDestination()

> __markdownLinkDestination__(`inside`): `string`

Defined in: src/parsers/filters/ValidationFilter.ts:124

The destination of a markdown link or image, from what sits between its
parentheses (#1476). CommonMark allows an optional title after it —
`(https://example.com "Title")` — and a destination in angle brackets,
`(<a url with spaces>)`. The title is not part of the URL; judging the
whole string flagged every titled link as broken.

## Parameters

### inside

`string`

## Returns

`string`
