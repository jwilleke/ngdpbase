[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/ssrf](../README.md) / isMechanismDenied

# Function: isMechanismDenied()

> __isMechanismDenied__(`address`): `boolean`

Defined in: src/http/ssrf.ts:212

Tier 1 only: is this an address no configuration may permit?

Separate from `isAddressAllowed` so the mechanism can be asserted on its own
— a profile or an allow-list that could reach these would be a control that
can be switched off, which is not a control.

## Parameters

### address

`string`

## Returns

`boolean`
