[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/buildSitemap](../README.md) / toW3CDate

# Function: toW3CDate()

> __toW3CDate__(`value`): `string` \| `undefined`

Defined in: src/utils/buildSitemap.ts:48

Normalise a timestamp to W3C datetime, or drop it.

An unparseable `lastmod` is omitted rather than passed through: a malformed
date makes a consumer distrust the whole file, while a missing one is
explicitly allowed by the spec.

## Parameters

### value

`unknown`

## Returns

`string` \| `undefined`
