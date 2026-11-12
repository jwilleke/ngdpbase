[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sessionSecurity](../README.md) / SessionSecurityContext

# Interface: SessionSecurityContext

Defined in: src/utils/sessionSecurity.ts:55

What the resolution needs to know about the transport (#1160).

## Properties

### nativeTls?

> `optional` __nativeTls?__: `boolean`

Defined in: src/utils/sessionSecurity.ts:62

True when this server terminates TLS itself (#1153).

Defaults to false so every existing caller keeps its pre-#1160 behaviour
rather than silently changing what it resolves.
