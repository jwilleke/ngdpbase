[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / ShimTools

# Interface: ShimTools

Defined in: src/ice/types.ts:121

What the engine hands a shim besides its input.

## Extended by

- [`ExportShimTools`](ExportShimTools.md)

## Properties

### options

> __options__: `Record`\<`string`, `unknown`\>

Defined in: src/ice/types.ts:132

This shim's options from site configuration (D6):
`ngdpbase.import.shims.<id>.options`, with the run's own `options` over
them (a feed source's parse settings, #2109).

## Methods

### fetch()

> __fetch__(`url`, `options?`): `Promise`\<[`GuardedResponse`](../../../http/guardedFetch/interfaces/GuardedResponse.md)\>

Defined in: src/ice/types.ts:126

Follow-up fetches go through the engine (design rule): the one guarded
path, with the site's egress policy, User-Agent and timeout.

#### Parameters

##### url

`string`

##### options?

`Omit`\<[`GuardedFetchOptions`](../../../http/guardedFetch/interfaces/GuardedFetchOptions.md), `"policy"` \| `"transport"` \| `"resolver"`\>

#### Returns

`Promise`\<[`GuardedResponse`](../../../http/guardedFetch/interfaces/GuardedResponse.md)\>
