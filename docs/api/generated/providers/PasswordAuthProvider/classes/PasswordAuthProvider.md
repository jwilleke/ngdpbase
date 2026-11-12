[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/PasswordAuthProvider](../README.md) / PasswordAuthProvider

# Class: PasswordAuthProvider

Defined in: src/providers/PasswordAuthProvider.ts:17

Interface all authentication providers must implement.

## Implements

- [`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md)

## Constructors

### Constructor

> __new PasswordAuthProvider__(`engine`): `PasswordAuthProvider`

Defined in: src/providers/PasswordAuthProvider.ts:23

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`PasswordAuthProvider`

## Properties

### displayName

> `readonly` __displayName__: `"Username & Password"` = `'Username & Password'`

Defined in: src/providers/PasswordAuthProvider.ts:19

Human-readable name shown in admin UIs

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`displayName`](../../BaseAuthProvider/interfaces/AuthProvider.md#displayname)

***

### factor

> `readonly` __factor__: [`FactorDescription`](../../BaseAuthProvider/interfaces/FactorDescription.md)

Defined in: src/providers/PasswordAuthProvider.ts:21

Something you know (#1523).

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`factor`](../../BaseAuthProvider/interfaces/AuthProvider.md#factor)

***

### id

> `readonly` __id__: `"password"` = `'password'`

Defined in: src/providers/PasswordAuthProvider.ts:18

Unique identifier, e.g. 'password', 'magic-link', 'oauth-google'

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`id`](../../BaseAuthProvider/interfaces/AuthProvider.md#id)

## Methods

### verify()

> __verify__(`credentials`): `Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

Defined in: src/providers/PasswordAuthProvider.ts:25

Verify credentials or a token.

#### Parameters

##### credentials

[`AuthVerifyCredentials`](../../BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

#### Returns

`Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

AuthResult on success, null on failure.

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`verify`](../../BaseAuthProvider/interfaces/AuthProvider.md#verify)
