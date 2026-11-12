[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Share](../README.md) / shareCoversResource

# Function: shareCoversResource()

> __shareCoversResource__(`resources`, `type`, `keywords`): `boolean`

Defined in: src/types/Share.ts:103

Does a share cover a resource of `type` carrying `keywords`?

The single reader of the `keyword:<name>` grammar. The evaluator asks it
about a page's user-keywords; the share routes ask it about a media item's
EXIF/XMP keywords. A pattern this function does not understand covers
nothing — an unknown grammar is a refusal, never a wildcard — and content
carrying `owner-only` is never covered, whatever else it carries.

## Parameters

### resources

readonly [`ShareResource`](../interfaces/ShareResource.md)[]

### type

`string`

### keywords

readonly `string`[]

## Returns

`boolean`
