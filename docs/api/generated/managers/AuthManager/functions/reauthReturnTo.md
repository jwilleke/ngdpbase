[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / reauthReturnTo

# Function: reauthReturnTo()

> __reauthReturnTo__(`req`, `mode?`): `string`

Defined in: src/managers/AuthManager.ts:1073

Where to return after re-authenticating: this page for a page GET, and the
page the person was on for anything else — a POST (the form is filled in
again; a POST body is not replayed), a script's request for data (#1738) or
a file download (#2145). Always a path on this site.

## Parameters

### req

`Request`

### mode?

[`ReauthMode`](../type-aliases/ReauthMode.md) = `'page'`

## Returns

`string`
