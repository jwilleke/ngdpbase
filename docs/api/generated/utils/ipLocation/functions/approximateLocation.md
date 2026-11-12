[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/ipLocation](../README.md) / approximateLocation

# Function: approximateLocation()

> __approximateLocation__(`ip`, `header`, `sources`): `Promise`\<`string` \| `null`\>

Defined in: src/utils/ipLocation.ts:104

Roughly where `ip` is: Cloudflare's headers when the site is behind it and
they name a place, else the GeoLite2 file when one is configured, else null.

## Parameters

### ip

`string` \| `undefined`

### header

(`name`) => `string` \| `undefined`

### sources

[`IpLocationSources`](../interfaces/IpLocationSources.md)

## Returns

`Promise`\<`string` \| `null`\>
