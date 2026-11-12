[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/sensitiveValues](../README.md) / keepHiddenValues

# Function: keepHiddenValues()

> __keepHiddenValues__(`key`, `submitted`, `stored`, `levels`): `unknown`

Defined in: src/utils/sensitiveValues.ts:218

A value submitted from a screen that showed it with paths hidden, with each
`HIDDEN` placeholder at a declared path put back to the stored value there
(#1889). Without this, saving an edit to an accounts map would write the
placeholder over every account number.

## Parameters

### key

`string`

### submitted

`unknown`

### stored

`unknown`

### levels

`Map`\<`string`, [`ValueLevel`](../type-aliases/ValueLevel.md)\>

## Returns

`unknown`
