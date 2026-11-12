[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pageWritePolicies](../README.md) / policyFingerprint

# Function: policyFingerprint()

> __policyFingerprint__(`policy`): `string`

Defined in: src/utils/pageWritePolicies.ts:52

A stable hash of a whole rule, its id included, so a changed rule (or the same content under another name) is a different one (#2355).

## Parameters

### policy

[`Policy`](../../../types/Policy/interfaces/Policy.md)

## Returns

`string`
