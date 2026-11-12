[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditHeadWitness](../README.md) / shouldPublish

# Function: shouldPublish()

> __shouldPublish__(`lastPublishedAtMs`, `nowMs`, `intervalMs`): `boolean`

Defined in: src/utils/auditHeadWitness.ts:96

Is it time to publish again?

The gap between publications is the window an attacker can truncate within,
which makes the interval the actual security parameter — worth setting
explicitly rather than inheriting.

A zero or negative interval publishes every time rather than never: a
misconfigured interval must fail toward more evidence, not toward silently
disabling the witness.

## Parameters

### lastPublishedAtMs

`number` \| `null`

### nowMs

`number`

### intervalMs

`number`

## Returns

`boolean`
