[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/keywordNormalizer](../README.md) / normalizeKeywordValue

# Function: normalizeKeywordValue()

> __normalizeKeywordValue__(`title`): `string`

Defined in: src/utils/keywordNormalizer.ts:31

Canonical value for a keyword title. Idempotent: `normalizeKeywordValue(v)`
equals `v` for any already-valid value. Returns '' when the title has no
usable alphanumeric content.

## Parameters

### title

`string`

## Returns

`string`
