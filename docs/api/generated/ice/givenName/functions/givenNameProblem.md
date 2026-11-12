[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/givenName](../README.md) / givenNameProblem

# Function: givenNameProblem()

> __givenNameProblem__(`form`, `given`, `original`, `maxLength`): `string` \| `null`

Defined in: src/ice/givenName.ts:36

Why this name cannot be used, or null when it can. `given` is trimmed
first. `original` is the uploaded file's own name.

## Parameters

### form

[`IceNameForm`](../type-aliases/IceNameForm.md)

### given

`string`

### original

`string`

### maxLength

`number`

## Returns

`string` \| `null`
