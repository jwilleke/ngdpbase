[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/deriveUsername](../README.md) / deriveUsername

# Function: deriveUsername()

> __deriveUsername__(`email`, `userManager`): `Promise`\<`string`\>

Defined in: src/utils/deriveUsername.ts:32

Turn an email address into an unused username.

Local part, lowercased, with anything outside `[a-z0-9]` replaced by a
hyphen; a numeric suffix is appended until the name is free.

The result is only free as of this call — a caller that derives a name and
creates the account later must be prepared for `createUser` to reject a
duplicate that appeared in between.

## Parameters

### email

`string`

### userManager

[`default`](../../../managers/UserManager/classes/default.md)

## Returns

`Promise`\<`string`\>
