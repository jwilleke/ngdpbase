[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/guardedElasticsearch](../README.md) / createGuardedElasticsearchClient

# Function: createGuardedElasticsearchClient()

> __createGuardedElasticsearchClient__(`node`, `read`, `options?`): `Client`

Defined in: src/http/guardedElasticsearch.ts:112

An Elasticsearch client whose every connection is subject to the instance's egress policy.

## Parameters

### node

`string`

### read

[`ConfigReader`](../../egressPolicy/type-aliases/ConfigReader.md)

### options?

[`GuardedElasticsearchOptions`](../interfaces/GuardedElasticsearchOptions.md) = `{}`

## Returns

`Client`
