[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/bootActions](../README.md) / recordSystemAction

# Function: recordSystemAction()

> __recordSystemAction__(`engine`, `ctx`, `event`): `Promise`\<`void`\>

Defined in: src/context/bootActions.ts:100

Record an action taken under a system context — now if the audit sink is
up, otherwise into the boot ledger for `drainBootActions` to flush.

## Parameters

### engine

`EngineLike`

### ctx

[`JobContext`](../../JobContext/interfaces/JobContext.md)

### event

[`SystemActionEvent`](../type-aliases/SystemActionEvent.md)

## Returns

`Promise`\<`void`\>
