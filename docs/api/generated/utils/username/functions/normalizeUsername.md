[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/username](../README.md) / normalizeUsername

# Function: normalizeUsername()

> __normalizeUsername__(`username`): `string`

Defined in: src/utils/username.ts:37

The comparison form of a username: trimmed, lower-cased.

Lower-case rather than upper: `toLowerCase()` is what the existing checks
already used (`isSystemPrincipal`, the sitemap subject list), so this agrees
with them rather than introducing a third convention.

A non-string is normalized to the empty string rather than throwing, because
callers pass values straight from a request body — and empty is already the
"no username" case every caller handles.

## Parameters

### username

`unknown`

## Returns

`string`
