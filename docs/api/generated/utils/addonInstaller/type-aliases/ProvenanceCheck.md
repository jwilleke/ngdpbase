[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonInstaller](../README.md) / ProvenanceCheck

# Type Alias: ProvenanceCheck

> __ProvenanceCheck__ = (`input`) => `Promise`\<[`ProvenanceResult`](../../addonProvenance/type-aliases/ProvenanceResult.md)\>

Defined in: src/utils/addonInstaller.ts:50

Check a release's attestations. Throws when the check cannot be made (trust root unreachable).

## Parameters

### input

#### attestations

`unknown`

#### name

`string`

#### repository

`string`

#### sha512Hex

`string`

#### version

`string`

## Returns

`Promise`\<[`ProvenanceResult`](../../addonProvenance/type-aliases/ProvenanceResult.md)\>
