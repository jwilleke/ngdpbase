[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/ActorContext](../README.md) / ActorAttribution

# Interface: ActorAttribution

Defined in: src/context/ActorContext.ts:32

The fields an audit record takes from a context.

An emitter spreads it — `{ eventType, ...who, …, metadata: { ...who.metadata, … } }`
— rather than copying `user` and `ipAddress` across one at a time, so a
field added here (`actor`, #1762 slice 3) reaches every row without
touching every emitter. `scripts/check-audit-attribution.ts` holds every
emitter to that.

## Properties

### actor?

> `optional` __actor?__: `string`

Defined in: src/context/ActorContext.ts:36

Who actually did it, present only when that is not `user` — under a proxy grant (#1762).

***

### ipAddress

> __ipAddress__: `string` \| `undefined`

Defined in: src/context/ActorContext.ts:37

***

### metadata

> __metadata__: `Record`\<`string`, `unknown`\>

Defined in: src/context/ActorContext.ts:39

`origin` always; `reason` / `requestedAt` for a job; `delegated` when the request came through a token, share or proxy grant (with `proxyGrantId` for a proxy).

***

### user

> __user__: `string`

Defined in: src/context/ActorContext.ts:34

The account acted on: under a proxy grant, the person represented.
