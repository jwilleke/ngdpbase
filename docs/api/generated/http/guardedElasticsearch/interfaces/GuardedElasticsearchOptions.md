[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/guardedElasticsearch](../README.md) / GuardedElasticsearchOptions

# Interface: GuardedElasticsearchOptions

Defined in: src/http/guardedElasticsearch.ts:33

## Properties

### requestTimeout?

> `optional` __requestTimeout?__: `number`

Defined in: src/http/guardedElasticsearch.ts:35

Per-request timeout in ms; the SDK's default when omitted.

***

### resolver?

> `optional` __resolver?__: [`Resolver`](../../guardedLookup/type-aliases/Resolver.md)

Defined in: src/http/guardedElasticsearch.ts:40

The resolution step, for tests only — the same single seam `guardedLookup`
exposes. Production leaves it unset and `node:dns` answers.
