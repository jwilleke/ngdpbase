[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/guardedFetch](../README.md) / GuardedFetchOptions

# Interface: GuardedFetchOptions

Defined in: src/http/guardedFetch.ts:59

## Properties

### body?

> `optional` __body?__: `string` \| `Buffer`\<`ArrayBufferLike`\>

Defined in: src/http/guardedFetch.ts:76

A POST body (#1743: an OpenID Connect token request). A request that
carries one is never redirected: a redirect answer is returned as it is,
so a body (a code, a client secret) is never re-sent to a host the caller
did not name.

***

### headers?

> `optional` __headers?__: `Record`\<`string`, `string`\>

Defined in: src/http/guardedFetch.ts:68

Request headers. Without a `User-Agent` (any case), the configured default
is added (#1947, ./userAgent.ts).

***

### maxBytes?

> `optional` __maxBytes?__: `number`

Defined in: src/http/guardedFetch.ts:62

***

### maxRedirects?

> `optional` __maxRedirects?__: `number`

Defined in: src/http/guardedFetch.ts:61

***

### method?

> `optional` __method?__: `"POST"` \| `"GET"` \| `"HEAD"`

Defined in: src/http/guardedFetch.ts:69

***

### policy

> __policy__: [`EgressPolicy`](../../ssrf/interfaces/EgressPolicy.md)

Defined in: src/http/guardedFetch.ts:60

***

### resolver?

> `optional` __resolver?__: [`Resolver`](../../guardedLookup/type-aliases/Resolver.md)

Defined in: src/http/guardedFetch.ts:80

Test seam — see `Resolver`.

***

### timeoutMs?

> `optional` __timeoutMs?__: `number`

Defined in: src/http/guardedFetch.ts:63

***

### transport?

> `optional` __transport?__: [`Transport`](../type-aliases/Transport.md)

Defined in: src/http/guardedFetch.ts:78

Test seam — see `Transport`.
