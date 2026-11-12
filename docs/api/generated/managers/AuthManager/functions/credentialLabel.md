[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/AuthManager](../README.md) / credentialLabel

# Function: credentialLabel()

> __credentialLabel__(`label`): `string`

Defined in: src/managers/AuthManager.ts:309

A credential's name, tidied: whitespace collapsed, at most 60 characters.
Empty is refused — two passkeys both called "Passkey" cannot be told apart
when one has to be removed (operator, 2026-10-04).

## Parameters

### label

`unknown`

## Returns

`string`
