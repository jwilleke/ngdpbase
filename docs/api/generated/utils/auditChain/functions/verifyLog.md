[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditChain](../README.md) / verifyLog

# Function: verifyLog()

> __verifyLog__(`records`, `options?`): [`LogVerdict`](../interfaces/LogVerdict.md)

Defined in: src/utils/auditChain.ts:206

Verify a log that may contain deliberate discontinuities (#1124).

`verifyChain` answers "is this one chain intact", which is the right question
for a chain and the wrong one for a log that has legitimately restarted — a
migration, a restore, or a bug that wrote unverifiable records. Without this,
one bad record leaves a log unverifiable forever and the only ways forward
are dishonest: edit the log, delete it, or ignore the verifier.

A break is __explained__ only when the very next record is a restart marker.
That is what keeps the marker from being an escape hatch: an attacker who
wants a clean chain must write a record saying they broke it, which is a
confession rather than a cover-up.

The marker's claimed `previousHash` is checked against the head it actually
follows. A marker asserting a history that did not happen is itself a
finding — otherwise a restart could claim anything.

## Parameters

### records

readonly `Record`\<`string`, `unknown`\>[]

### options?

#### start?

[`ChainStart`](../interfaces/ChainStart.md)

## Returns

[`LogVerdict`](../interfaces/LogVerdict.md)
