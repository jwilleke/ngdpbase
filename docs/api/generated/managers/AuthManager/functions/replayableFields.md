[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / replayableFields

# Function: replayableFields()

> __replayableFields__(`req`): \[`string`, `string`\][] \| `null`

Defined in: src/managers/AuthManager.ts:1040

A form POST's fields as they can be posted again to give the same body
(#2154), or null when they cannot: a file upload, a nested field, a name
with brackets. A list goes back as `name[]`, which parses to a list even
of one. `_csrf` is left out: the replay carries the session's token. A
secret (`SECRET_FIELD`) is never kept, so such a form is null too.

## Parameters

### req

`Request`

## Returns

\[`string`, `string`\][] \| `null`
