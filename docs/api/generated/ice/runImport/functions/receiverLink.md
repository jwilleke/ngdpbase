[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runImport](../README.md) / receiverLink

# Function: receiverLink()

> __receiverLink__(`receiver`, `ref`, `ctx`): `Promise`\<`string` \| `undefined`\>

Defined in: src/ice/runImport.ts:309

Where this context can open what a receiver's reference names (#2110,
# 2130): the receiver's own `linkFor`, and only a path on this site, never
another origin or a script URL. Undefined when it has none, or says no.

## Parameters

### receiver

[`RegisteredReceiver`](../../types/interfaces/RegisteredReceiver.md)

### ref

`string` \| `undefined`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

## Returns

`Promise`\<`string` \| `undefined`\>
