[__ngdpbase API v5.43.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [ice/shims/csv](../README.md) / preambleSuspicion

# Function: preambleSuspicion()

> __preambleSuspicion__(`columns`): `string` \| `null`

Defined in: src/ice/shims/csv.ts:112

Return the suspect header when a parse looks like it consumed an unskipped
preamble, or `null` when it looks fine (#1102).

The signature of the failure is a single column whose name reads like a
sentence: a caption line has no delimiter in it, so the whole line becomes one
field. A legitimate single-column CSV has a short, word-like header, so the
two are distinguishable in practice.

Deliberately advisory. A one-column CSV is legal, just unusual, and a caller
that guessed and re-parsed would only trade a visible wrong answer for an
invisible one.

## Parameters

### columns

readonly `string`[]

## Returns

`string` \| `null`
