[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/bearerProviders](../README.md) / bearerProviderIds

# Function: bearerProviderIds()

> __bearerProviderIds__(`providers`): `string`[]

Defined in: src/utils/bearerProviders.ts:7

Which providers the bearer middleware tries, in order (#946, #1576): every
registered provider that declares `acceptsBearer`, in registration order.
Selected by the flag, not a list, so a new bearer provider joins by
declaring it rather than by editing app.ts.

## Parameters

### providers

readonly `object`[]

## Returns

`string`[]
