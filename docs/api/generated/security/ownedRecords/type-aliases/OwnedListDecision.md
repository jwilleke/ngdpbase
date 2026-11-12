[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/ownedRecords](../README.md) / OwnedListDecision

# Type Alias: OwnedListDecision

> __OwnedListDecision__ = \{ `decision`: `"allow"`; `filter`: readonly [`OwnedRecordFilter`](../interfaces/OwnedRecordFilter.md)[]; \} \| \{ `decision`: `"deny"`; `policyIds`: readonly `string`[]; `reason`: `string`; \}

Defined in: src/security/ownedRecords.ts:62

An explicit list answer (#1823). `filter` is empty only when the type has no owner.
