[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/healthChecks](../README.md) / ReadinessCheck

# Interface: ReadinessCheck

Defined in: src/utils/healthChecks.ts:35

One named readiness condition. `run` may be sync or async.

## Properties

### name

> __name__: `string`

Defined in: src/utils/healthChecks.ts:36

***

### run

> __run__: () => `boolean` \| `Promise`\<`boolean`\>

Defined in: src/utils/healthChecks.ts:37

#### Returns

`boolean` \| `Promise`\<`boolean`\>
