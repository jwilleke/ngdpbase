[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/frontmatterAccess](../README.md) / audienceExcludes

# Function: audienceExcludes()

> __audienceExcludes__(`metadata`, `viewerPrincipals`, `enabledAddons?`): `boolean`

Defined in: src/utils/frontmatterAccess.ts:109

Whether the page's audience leaves this viewer out — true only when it
names one and nothing in it matches. The caller then asks whether the
viewer is an administrator, the one exception (#1964), and passes the
answer to [decideFrontmatterAccess](decideFrontmatterAccess.md); it asks only when this is true.

## Parameters

### metadata

[`AccessMetadataLike`](../interfaces/AccessMetadataLike.md) \| `null` \| `undefined`

### viewerPrincipals

readonly `string`[]

### enabledAddons?

readonly `string`[] = `[]`

## Returns

`boolean`
