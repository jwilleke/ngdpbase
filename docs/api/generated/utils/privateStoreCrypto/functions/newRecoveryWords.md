[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreCrypto](../README.md) / newRecoveryWords

# Function: newRecoveryWords()

> __newRecoveryWords__(`kek`): `object`

Defined in: src/utils/privateStoreCrypto.ts:226

A fresh set of 12 recovery words for a KEK that has not been committed yet
(#1414): the store door's words screen, where a failed confirmation discards
the words it showed and never re-shows them. The KEK and its password wrap
are kept; only the recovery wrap is replaced.

## Parameters

### kek

`Buffer`

## Returns

`object`

### mnemonic

> __mnemonic__: `string`

### recoveryWrap

> __recoveryWrap__: [`WrappedBlob`](../interfaces/WrappedBlob.md)
