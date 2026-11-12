[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditHeadWitness](../README.md) / assessWitness

# Function: assessWitness()

> __assessWitness__(`witness`, `records`): [`WitnessAssessment`](../interfaces/WitnessAssessment.md)

Defined in: src/utils/auditHeadWitness.ts:117

Compare a published head against the records now on disk.

The verdicts are kept distinct because an assessor needs the difference:
truncation says records were removed, alteration says one was rewritten, and
reporting both as "broken" loses what they would act on.

`unknown` is never reported as `intact`. "Nothing is witnessing this log" and
"this log is intact" are different statements, and deriving the second from
the first is exactly the claim #1148 removed elsewhere.

## Parameters

### witness

[`ChainWitness`](../interfaces/ChainWitness.md) \| \{ `hash`: `string`; `seq`: `number`; \} \| `null`

### records

readonly [`ChainRecord`](../interfaces/ChainRecord.md)[]

## Returns

[`WitnessAssessment`](../interfaces/WitnessAssessment.md)
