[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonPageSync](../README.md) / shippedPageState

# Function: shippedPageState()

> __shippedPageState__(`args`): `object`

Defined in: src/utils/addonPageSync.ts:70

Decide a shipped page's state. Core pages stamp `required-source-hash`, add-on
pages `addon-source-hash`; the caller reads whichever applies and passes its
value, so both go through the same table.

Inputs: L = hash of the live body, T = the stamp, S = hash of the shipped body,
U = `user-modified`. E (edited here) = U, or no stamp, or L != T. C (shipped
changed) = a stamp exists and S != T. First match wins:

 1. L = S and not U  → same-as-shipped
 2. E and C          → both-changed
 3. E and not C      → edited-not-confirmed
 4. C (so not E)     → update-ready

## Parameters

### args

#### liveBody

`string`

Body of the live copy

#### shippedBody

`string`

Body of the shipped page

#### stamp

`string` \| `undefined`

The live copy's source-hash stamp, or undefined

#### userModified

`boolean`

The live copy's front-matter `user-modified` is true

## Returns

`object`

### state

> __state__: [`ShippedPageStateName`](../type-aliases/ShippedPageStateName.md)
