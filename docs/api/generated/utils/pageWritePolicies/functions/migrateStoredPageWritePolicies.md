[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageWritePolicies](../README.md) / migrateStoredPageWritePolicies

# Function: migrateStoredPageWritePolicies()

> __migrateStoredPageWritePolicies__(`policies`): `object`

Defined in: src/utils/pageWritePolicies.ts:103

Rewrite the stored copies of the moved shipped policies, in `policies` (the
custom layer's `ngdpbase.access.policies`), and return what was done and
what an administrator should review. Returns the list to store in place of
the input; the input is not changed.

## Parameters

### policies

`unknown`

## Returns

`object`

### policies

> __policies__: `unknown`

### report

> __report__: [`PageWritePolicyReport`](../interfaces/PageWritePolicyReport.md)
