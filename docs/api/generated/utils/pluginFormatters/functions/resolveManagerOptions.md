[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / resolveManagerOptions

# Function: resolveManagerOptions()

> __resolveManagerOptions__(`spec`, `context`): `Promise`\<[`ManagerOptionsResult`](../type-aliases/ManagerOptionsResult.md)\>

Defined in: src/utils/pluginFormatters.ts:913

Resolve `ManagerName.toFormOptions(k=v,...)` to the choices of a form
dropdown, under the same two rules as resolveManagerFetch: only
`toFormOptions` is reachable, and the viewer's context goes with the call,
so the manager offers that viewer only what they may see.

The manager may answer strings or `{ value, label }` objects; anything
else is dropped, and every value comes back as a string.

## Parameters

### spec

`string` \| `undefined`

### context

#### engine?

\{ `getManager`(`name`): `unknown`; \}

#### engine.getManager

(`name`) => `unknown`

#### userContext?

`unknown`

## Returns

`Promise`\<[`ManagerOptionsResult`](../type-aliases/ManagerOptionsResult.md)\>
