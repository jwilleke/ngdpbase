[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/egressPolicy](../README.md) / resolveEgressPolicy

# Function: resolveEgressPolicy()

> __resolveEgressPolicy__(`read`): [`ResolvedEgressPolicy`](../interfaces/ResolvedEgressPolicy.md)

Defined in: src/http/egressPolicy.ts:61

Read the configured ranges, reconcile them, and report what could not be
resolved.

A contradiction never widens access. Where the two lists disagree the
stricter reading wins, which is the only direction a security control should
fail when nobody can be asked.

## Parameters

### read

[`ConfigReader`](../type-aliases/ConfigReader.md)

## Returns

[`ResolvedEgressPolicy`](../interfaces/ResolvedEgressPolicy.md)
