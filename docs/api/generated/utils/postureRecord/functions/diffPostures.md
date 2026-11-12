[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/postureRecord](../README.md) / diffPostures

# Function: diffPostures()

> __diffPostures__(`previous`, `current`): [`PostureDiff`](../interfaces/PostureDiff.md)

Defined in: src/utils/postureRecord.ts:85

Compare the posture now against the posture at the previous boot.

__No previous record is `comparable: false`, never "no change".__ Only the
last 1000 log lines are loaded for search (`FileAuditProvider.ts:610`), so on
a busy instance the previous boot's record can fall outside the window.
Reporting that as "nothing changed" would be a false all-clear at exactly the
moment an operator is relying on the check.

An ingredient added to or removed from the __view__ is reported separately
from a __value__ change: removing an ingredient changes nothing about what
the instance does (D4, D16), and folding both into "posture changed" would
lose the distinction that matters when reading the log back.

## Parameters

### previous

[`FlatPosture`](../type-aliases/FlatPosture.md) \| `null`

### current

[`FlatPosture`](../type-aliases/FlatPosture.md)

## Returns

[`PostureDiff`](../interfaces/PostureDiff.md)
