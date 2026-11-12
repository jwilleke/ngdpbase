[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / simpleSlug

# Function: simpleSlug()

> __simpleSlug__(`name`): `string`

Defined in: src/utils/pluginFormatters.ts:244

Simple ASCII slugify fallback for callers without ValidationManager access.
Matches `generateSlug` for the common ASCII case (spaces/punct → single
hyphens, lowercased). Non-ASCII transliteration is NOT applied — pass
`ValidationManager.generateSlug` when that matters.

## Parameters

### name

`string`

## Returns

`string`
