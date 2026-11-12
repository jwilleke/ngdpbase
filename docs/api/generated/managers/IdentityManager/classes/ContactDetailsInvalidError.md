[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/IdentityManager](../README.md) / ContactDetailsInvalidError

# Class: ContactDetailsInvalidError

Defined in: src/managers/IdentityManager.ts:1136

A contact detail given to [IdentityManager.updateContactDetails](default.md#updatecontactdetails) is not valid (#2073); nothing was written.
`part` is which detail (a phone's `contactType`, `emergency`, `address`, `mailing`, `knowsLanguage`, `image`,
`sameAs`, `name`), `field` which box of it. The message names the rule, never the value given: it reaches URLs and logs.

## Extends

- `Error`

## Constructors

### Constructor

> __new ContactDetailsInvalidError__(`part`, `field`, `message`): `ContactDetailsInvalidError`

Defined in: src/managers/IdentityManager.ts:1137

#### Parameters

##### part

`string`

##### field

`string`

##### message

`string`

#### Returns

`ContactDetailsInvalidError`

#### Overrides

`Error.constructor`

## Properties

### field

> `readonly` __field__: `string`

Defined in: src/managers/IdentityManager.ts:1137

***

### part

> `readonly` __part__: `string`

Defined in: src/managers/IdentityManager.ts:1137
