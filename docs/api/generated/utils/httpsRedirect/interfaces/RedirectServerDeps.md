[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/httpsRedirect](../README.md) / RedirectServerDeps

# Interface: RedirectServerDeps

Defined in: src/utils/httpsRedirect.ts:138

## Properties

### configuredBaseUrl

> __configuredBaseUrl__: () => `string` \| `null`

Defined in: src/utils/httpsRedirect.ts:140

The explicitly configured base URL, or null when the operator has not set one.

#### Returns

`string` \| `null`

***

### onRedirect?

> `optional` __onRedirect?__: (`from`, `to`) => `void`

Defined in: src/utils/httpsRedirect.ts:141

#### Parameters

##### from

`string`

##### to

`string`

#### Returns

`void`
