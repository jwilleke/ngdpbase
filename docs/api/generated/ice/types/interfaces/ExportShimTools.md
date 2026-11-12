[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / ExportShimTools

# Interface: ExportShimTools

Defined in: src/ice/types.ts:136

What an `out` shim is handed (#2120): a shim's tools, and who the export is for.

## Extends

- [`ShimTools`](ShimTools.md)

## Properties

### ctx

> __ctx__: [`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

Defined in: src/ice/types.ts:141

The job context of the user who asked for the export, for a core shim
that calls a core door with it (the PDF render, P1).

***

### options

> __options__: `Record`\<`string`, `unknown`\>

Defined in: src/ice/types.ts:132

This shim's options from site configuration (D6):
`ngdpbase.import.shims.<id>.options`, with the run's own `options` over
them (a feed source's parse settings, #2109).

#### Inherited from

[`ShimTools`](ShimTools.md).[`options`](ShimTools.md#options)

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

#### Inherited from

[`ShimTools`](ShimTools.md).[`fetch`](ShimTools.md#fetch)
