[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/postureRecord](../README.md) / describePostureDiff

# Function: describePostureDiff()

> __describePostureDiff__(`diff`): `string`

Defined in: src/utils/postureRecord.ts:142

The line an operator reads at startup.

A difference found here says explicitly that nothing observed the edit —
otherwise the obvious question is why it is being reported at boot rather
than as a `config-change`, and the answer is the whole point.

## Parameters

### diff

[`PostureDiff`](../interfaces/PostureDiff.md)

## Returns

`string`
