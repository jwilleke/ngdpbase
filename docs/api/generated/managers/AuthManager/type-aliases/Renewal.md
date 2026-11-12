[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / Renewal

# Type Alias: Renewal

> __Renewal__ = `"fixed"` \| `"refreshable"`

Defined in: src/managers/AuthManager.ts:683

How a delegated credential is renewed (#1764): `fixed` ends on its date and
someone makes a new one; `refreshable` is renewed automatically, with a new
key each time. `extendable` (renewed by hand, same key) is #1734, not built.
