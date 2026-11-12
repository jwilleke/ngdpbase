[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/givenName](../README.md) / appliedGivenName

# Function: appliedGivenName()

> __appliedGivenName__(`form`, `given`, `original`): `string` \| `undefined`

Defined in: src/ice/givenName.ts:56

The given name the engine applies: trimmed, or none when it is the
default (the user kept the file's own name), so a receiver names it as it
always has (a page's title from its content, else its file name).

## Parameters

### form

[`IceNameForm`](../type-aliases/IceNameForm.md)

### given

`string`

### original

`string`

## Returns

`string` \| `undefined`
