[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [http/egressPolicy](../README.md) / ResolvedEgressPolicy

# Interface: ResolvedEgressPolicy

Defined in: src/http/egressPolicy.ts:32

## Properties

### conflicts

> __conflicts__: `string`[]

Defined in: src/http/egressPolicy.ts:35

Human-readable contradictions, empty when the configuration is coherent.

***

### malformed

> __malformed__: `string`[]

Defined in: src/http/egressPolicy.ts:45

Ranges that do not parse as CIDR.

Separate from `conflicts` because it is the only case without a safe
silent resolution: dropping a malformed ALLOW fails closed and is
harmless, while dropping a malformed DENY fails open — the operator wrote
a restriction, it did not apply, and nothing looks wrong. #1152 turns this
into a maintenance boot with a route to the fix.

***

### policy

> __policy__: [`EgressPolicy`](../../ssrf/interfaces/EgressPolicy.md)

Defined in: src/http/egressPolicy.ts:33
