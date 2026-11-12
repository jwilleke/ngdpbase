[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [routes/DawarichCompatRoutes](../README.md) / isDawarichApiKeyPath

# Function: isDawarichApiKeyPath()

> __isDawarichApiKeyPath__(`method`, `path`): `boolean`

Defined in: src/routes/DawarichCompatRoutes.ts:55

The two Immich-compatible routes, where an agent token may arrive in
`x-api-key` (#1759). The request-credential middleware asks this, so no
other route accepts a token from that header.

## Parameters

### method

`string`

### path

`string`

## Returns

`boolean`
