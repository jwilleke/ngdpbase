[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/healthChecks](../README.md) / ReadinessReport

# Interface: ReadinessReport

Defined in: src/utils/healthChecks.ts:40

## Properties

### checks

> __checks__: `Record`\<`string`, `boolean`\>

Defined in: src/utils/healthChecks.ts:43

***

### failed

> __failed__: `string`[]

Defined in: src/utils/healthChecks.ts:45

Names of the checks that failed, in declaration order.

***

### httpStatus

> __httpStatus__: `200` \| `503`

Defined in: src/utils/healthChecks.ts:42

***

### status

> __status__: `"ok"` \| `"not-ready"`

Defined in: src/utils/healthChecks.ts:41
