[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/contactAccess](../README.md) / recordContactChange

# Function: recordContactChange()

> __recordContactChange__(`engine`, `ctx`, `change`): `Promise`\<`void`\>

Defined in: src/utils/contactAccess.ts:144

Record a contacts change as `identity-manage`, under the caller's context.
`continue`: a lost record is counted, the change stands. A system context
goes through `recordSystemAction`, so the bootstrap admin's person, made
before the audit sink is up, is recorded once it is.

## Parameters

### engine

`EngineLike`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### change

[`ContactChange`](../interfaces/ContactChange.md)

## Returns

`Promise`\<`void`\>
