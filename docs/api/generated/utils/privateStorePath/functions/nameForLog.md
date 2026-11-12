[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / nameForLog

# Function: nameForLog()

> __nameForLog__(`pageName`, `metadata?`): `string`

Defined in: src/utils/privateStorePath.ts:349

A page's name for a log line (#1461, #2118, #2178): a private page's title
stays out of logs, so it goes by its uuid, from its `metadata` — with its
owner and store when its name holds them, and as "uuid unknown" before it
has one. A private page saved under its bare title (#1520) is known only by
its `metadata`. A public page goes by its name, and its uuid when known.
The audit record is not a log line: it keeps the page's name.

## Parameters

### pageName

`string`

### metadata?

\{ `private?`: `unknown`; `uuid?`: `unknown`; \} \| `null`

## Returns

`string`
