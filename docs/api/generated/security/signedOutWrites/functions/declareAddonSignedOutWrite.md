[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/signedOutWrites](../README.md) / declareAddonSignedOutWrite

# Function: declareAddonSignedOutWrite()

> __declareAddonSignedOutWrite__(`slug`, `route`): `void`

Defined in: src/security/signedOutWrites.ts:130

An add-on's declaration of a route a signed-out caller may write to.
Called through `AddonHost.allowSignedOutWrite`, bound to the add-on's slug.
Throws on anything outside the add-on's own paths, so one add-on can never
open another's, or core's.

## Parameters

### slug

`string`

### route

[`SignedOutWriteRoute`](../interfaces/SignedOutWriteRoute.md)

## Returns

`void`
