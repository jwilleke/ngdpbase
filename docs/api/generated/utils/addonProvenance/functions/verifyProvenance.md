[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/addonProvenance](../README.md) / verifyProvenance

# Function: verifyProvenance()

> __verifyProvenance__(`input`): [`ProvenanceResult`](../type-aliases/ProvenanceResult.md)

Defined in: src/utils/addonProvenance.ts:69

Check the attestations the registry returned for `name@version` against the
tarball's sha512 (hex) and the expected repository.

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

#### trustedRoot

`unknown`

#### version

`string`

## Returns

[`ProvenanceResult`](../type-aliases/ProvenanceResult.md)
