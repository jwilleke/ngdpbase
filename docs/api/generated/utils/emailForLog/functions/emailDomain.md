[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/emailForLog](../README.md) / emailDomain

# Function: emailDomain()

> __emailDomain__(`to`): `string`

Defined in: src/utils/emailForLog.ts:14

The domain(s) of one address or a comma-separated list, lower-cased:
`"Bob <bob@Example.org>, ann@x.io"` → `"example.org,x.io"`. A value
without an `@` (or an empty one) reads as `unknown`.

## Parameters

### to

`string` \| `null` \| `undefined`

## Returns

`string`
