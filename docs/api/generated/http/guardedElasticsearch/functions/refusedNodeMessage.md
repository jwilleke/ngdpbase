[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/guardedElasticsearch](../README.md) / refusedNodeMessage

# Function: refusedNodeMessage()

> __refusedNodeMessage__(`who`, `node`, `reason`): `string`

Defined in: src/http/guardedElasticsearch.ts:125

The boot-time line both call sites log when the configured node would be
refused — one sentence, the same shape as sist2's (#1186), so the operator
is sent to the egress configuration and not to the Elasticsearch host.

## Parameters

### who

`string`

### node

`string`

### reason

`string`

## Returns

`string`
