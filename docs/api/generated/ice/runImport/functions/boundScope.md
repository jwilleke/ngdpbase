[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/runImport](../README.md) / boundScope

# Function: boundScope()

> __boundScope__(`receiverId`, `owner`, ...`subs`): `string`

Defined in: src/ice/runImport.ts:117

The scope a run's fingerprints, per-file status and item keys live in
(#2013): bound to the receiver and to the user the run is for, by their
identity `@id` (else their username, #2041). The engine works it out from
the caller's context; a request cannot name another user's. What follows
narrows it within that user's scope, never outside: the place within the
receiver (#2118), then a caller's own sub-scope (phr's source id).

## Parameters

### receiverId

`string`

### owner

`string`

### subs

...(`string` \| `undefined`)[]

## Returns

`string`
