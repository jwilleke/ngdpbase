[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/originalKeep](../README.md) / keepAllowsInto

# Function: keepAllowsInto()

> __keepAllowsInto__(`keep`, `to`): `boolean`

Defined in: src/ice/originalKeep.ts:58

Does this keep apply to this upload? Only an open keep, for a file going
into its user's own vault of a system-category its receiver's add-on
declares, uploaded by that user. A `false` leaves the upload exactly as
any other: the site's allow-list decides.

## Parameters

### keep

[`OriginalKeep`](../../types/interfaces/OriginalKeep.md) \| `undefined`

### to

[`KeepDestination`](../interfaces/KeepDestination.md)

## Returns

`boolean`
