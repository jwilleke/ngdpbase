[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditHeadWitness](../README.md) / buildWitness

# Function: buildWitness()

> __buildWitness__(`input`): [`ChainWitness`](../interfaces/ChainWitness.md)

Defined in: src/utils/auditHeadWitness.ts:76

Build the record to publish.

The head is one hash and one sequence number. Publishing more would put
audit CONTENT wherever the witness lives, which is a different and much
larger trust decision than publishing a fingerprint of it.

## Parameters

### input

[`BuildWitnessInput`](../interfaces/BuildWitnessInput.md)

## Returns

[`ChainWitness`](../interfaces/ChainWitness.md)
