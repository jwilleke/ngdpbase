[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / SignInCompleted

# Interface: SignInCompleted

Defined in: src/managers/AuthManager.ts:655

What the one completion step leaves for the route (#1743): where to go instead, when a pending identity waits to be confirmed.

## Properties

### auditId?

> `optional` __auditId?__: `string`

Defined in: src/managers/AuthManager.ts:658

The id of the sign-in's audit record, when it was recorded (#1523: a remembered browser's row names it).

***

### next?

> `optional` __next?__: `string`

Defined in: src/managers/AuthManager.ts:656
