[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/securityPosture](../README.md) / resolvePosture

# Function: resolvePosture()

> __resolvePosture__(`read`): [`PostureGroup`](../interfaces/PostureGroup.md)[]

Defined in: src/utils/securityPosture.ts:83

Read the posture and each ingredient's current value.

A malformed or absent posture yields nothing rather than throwing. This
feeds an admin screen, and an operator who mistyped the object should get an
empty section and a chance to fix it, not a page that fails to render.

## Parameters

### read

[`ConfigReader`](../type-aliases/ConfigReader.md)

## Returns

[`PostureGroup`](../interfaces/PostureGroup.md)[]
