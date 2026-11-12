[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/proxyClaim](../README.md) / mixesProxyWithDelegation

# Function: mixesProxyWithDelegation()

> __mixesProxyWithDelegation__(`subject`): `boolean`

Defined in: src/utils/proxyClaim.ts:40

A subject acting for someone AND carrying an agent token or a share link.
Never built legitimately (an agent-token request can never act for anyone),
so every door refuses it rather than deciding which ceiling wins.

## Parameters

### subject

`Delegations` \| `null` \| `undefined`

## Returns

`boolean`
