[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pinnedItems](../README.md) / deriveCanonicalUrl

# Function: deriveCanonicalUrl()

> __deriveCanonicalUrl__(`input`): `string` \| `null`

Defined in: src/utils/pinnedItems.ts:56

Compute the canonical url for an entry being added — either the explicit
`url` field, or `/view/<encoded pageName>` if only pageName is provided.
Returns null when neither is usable.

## Parameters

### input

#### pageName?

`string`

#### url?

`string`

## Returns

`string` \| `null`
