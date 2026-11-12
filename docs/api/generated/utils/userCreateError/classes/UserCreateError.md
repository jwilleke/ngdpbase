[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/userCreateError](../README.md) / UserCreateError

# Class: UserCreateError

Defined in: src/utils/userCreateError.ts:48

A user-creation failure with a reason a caller can branch on.

The `message` is for logs and may contain internal detail; it must never be
shown to a caller. `safeRegistrationMessage` is the only thing that decides
what a visitor sees.

## Extends

- `Error`

## Constructors

### Constructor

> __new UserCreateError__(`reason`, `message`): `UserCreateError`

Defined in: src/utils/userCreateError.ts:51

#### Parameters

##### reason

[`UserCreateFailureReason`](../type-aliases/UserCreateFailureReason.md)

##### message

`string`

#### Returns

`UserCreateError`

#### Overrides

`Error.constructor`

## Properties

### reason

> `readonly` __reason__: [`UserCreateFailureReason`](../type-aliases/UserCreateFailureReason.md)

Defined in: src/utils/userCreateError.ts:49
