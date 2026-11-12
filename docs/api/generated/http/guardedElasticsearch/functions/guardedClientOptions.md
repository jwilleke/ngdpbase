[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/guardedElasticsearch](../README.md) / guardedClientOptions

# Function: guardedClientOptions()

> __guardedClientOptions__(`node`, `policy`, `options?`): `ClientOptions`

Defined in: src/http/guardedElasticsearch.ts:85

The options that make a client guarded. Exported so a test can assert the
wiring — that the connection class is the `http` one and that its agents
carry the guarded lookup and the guarded connect — without opening a socket.

## Parameters

### node

`string`

### policy

[`EgressPolicy`](../../ssrf/interfaces/EgressPolicy.md)

### options?

[`GuardedElasticsearchOptions`](../interfaces/GuardedElasticsearchOptions.md) = `{}`

## Returns

`ClientOptions`
