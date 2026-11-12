[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/safeRedirect](../README.md) / safeRedirect

# Function: safeRedirect()

> __safeRedirect__(`target`): `string`

Defined in: src/utils/safeRedirect.ts:35

Return `target` when it is a same-site path, otherwise `/`.

Accepts: `/`, `/view/Welcome`, `/search?q=x#frag`

Rejects, among others:

- `//evil.example`      — protocol-relative; the browser reads it as a host
- `https://evil.example`, `javascript:…`, `data:…` — any scheme
- `/\evil.example`      — browsers normalise the backslash to `/`
- `\\evil.example`, or anything not starting with `/`
- a CR/LF, which would let a caller inject a second header

## Parameters

### target

`unknown`

## Returns

`string`
