[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [routes/profileContactDetails](../README.md) / contactDetailsFromForm

# Function: contactDetailsFromForm()

> __contactDetailsFromForm__(`body`): `object`

Defined in: src/routes/profileContactDetails.ts:93

What the form posted, as IdentityManager takes it; the name and email go to the account.

## Parameters

### body

`Record`\<`string`, `unknown`\>

## Returns

`object`

### details

> __details__: [`ContactDetailsInput`](../../../types/Person/interfaces/ContactDetailsInput.md)

### displayName

> __displayName__: `string`

### email

> __email__: `string`
