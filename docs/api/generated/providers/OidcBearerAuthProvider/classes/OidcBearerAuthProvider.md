[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/OidcBearerAuthProvider](../README.md) / OidcBearerAuthProvider

# Class: OidcBearerAuthProvider

Defined in: src/providers/OidcBearerAuthProvider.ts:24

Interface all authentication providers must implement.

## Implements

- [`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md)

## Constructors

### Constructor

> __new OidcBearerAuthProvider__(`engine`): `OidcBearerAuthProvider`

Defined in: src/providers/OidcBearerAuthProvider.ts:30

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`OidcBearerAuthProvider`

## Properties

### acceptsBearer

> `readonly` __acceptsBearer__: `true` = `true`

Defined in: src/providers/OidcBearerAuthProvider.ts:28

Marks this provider as usable by the bearer middleware.

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`acceptsBearer`](../../BaseAuthProvider/interfaces/AuthProvider.md#acceptsbearer)

***

### displayName

> `readonly` __displayName__: `"OpenID Connect access token"` = `'OpenID Connect access token'`

Defined in: src/providers/OidcBearerAuthProvider.ts:26

Human-readable name shown in admin UIs

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`displayName`](../../BaseAuthProvider/interfaces/AuthProvider.md#displayname)

***

### id

> `readonly` __id__: `"oidc-bearer"` = `'oidc-bearer'`

Defined in: src/providers/OidcBearerAuthProvider.ts:25

Unique identifier, e.g. 'password', 'magic-link', 'oauth-google'

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`id`](../../BaseAuthProvider/interfaces/AuthProvider.md#id)

## Methods

### verify()

> __verify__(`credentials`): `Promise`\<[`OidcBearerAuthResult`](../interfaces/OidcBearerAuthResult.md) \| `null`\>

Defined in: src/providers/OidcBearerAuthProvider.ts:32

Verify credentials or a token.

#### Parameters

##### credentials

[`AuthVerifyCredentials`](../../BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

#### Returns

`Promise`\<[`OidcBearerAuthResult`](../interfaces/OidcBearerAuthResult.md) \| `null`\>

AuthResult on success, null on failure.

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`verify`](../../BaseAuthProvider/interfaces/AuthProvider.md#verify)
