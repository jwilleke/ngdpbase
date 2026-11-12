[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/pageActions](../README.md) / permissionForPageAction

# Function: permissionForPageAction()

> __permissionForPageAction__(`action`): `string`

Defined in: src/security/pageActions.ts:45

The registry permission a page action means.

An unknown word is returned unchanged rather than guessed at: it is either
already a registry name — which is what new code passes — or it is a typo,
and the permission-registry invariant is what catches a typo, not a silent
rewrite into `page:<whatever>` (which is what the deleted code did).

## Parameters

### action

`string`

## Returns

`string`
