[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/ActorContext](../README.md) / actorOf

# Function: actorOf()

> __actorOf__(`ctx`): [`ActorAttribution`](../interfaces/ActorAttribution.md)

Defined in: src/context/ActorContext.ts:77

Who acted, for the record — read from the context, never guessed.

A job says its origin and reason; a request says `origin: request`, the
address, and whether it acted under a delegation. A token's or share's id
is not repeated here: that record already carries it, and a config-change
record naming a token id would be a second place to redact. A proxy grant's
id is (`proxyGrantId`): it is not a credential, and it is what joins the row
to the grant that allowed it (#1762).

## Parameters

### ctx

[`ActorContext`](../type-aliases/ActorContext.md)

## Returns

[`ActorAttribution`](../interfaces/ActorAttribution.md)
