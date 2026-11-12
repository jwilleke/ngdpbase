[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildSocialMeta](../README.md) / buildSocialMeta

# Function: buildSocialMeta()

> __buildSocialMeta__(`input`): [`MetaTag`](../interfaces/MetaTag.md)[]

Defined in: src/utils/buildSocialMeta.ts:112

Build the OpenGraph + Twitter tags for one page view.

Returns `[]` when there is nothing worth emitting, so the caller can render
unconditionally without a length check.

## Parameters

### input

[`SocialMetaInput`](../interfaces/SocialMetaInput.md)

## Returns

[`MetaTag`](../interfaces/MetaTag.md)[]
