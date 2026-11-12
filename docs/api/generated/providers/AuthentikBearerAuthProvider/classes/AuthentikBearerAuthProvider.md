[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/AuthentikBearerAuthProvider](../README.md) / AuthentikBearerAuthProvider

# Class: AuthentikBearerAuthProvider

Defined in: src/providers/AuthentikBearerAuthProvider.ts:70

Interface all authentication providers must implement.

## Implements

- [`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md)

## Constructors

### Constructor

> __new AuthentikBearerAuthProvider__(`engine`, `config`, `jwksOverride?`): `AuthentikBearerAuthProvider`

Defined in: src/providers/AuthentikBearerAuthProvider.ts:84

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

##### config

[`AuthentikBearerConfig`](../interfaces/AuthentikBearerConfig.md)

##### jwksOverride?

`JWTVerifyGetKey`\<`Uint8Array`\<`ArrayBufferLike`\> \| `CryptoKey`\>

optional pre-built JWKS getter for tests; production
  omits this and uses `createRemoteJWKSet` against the configured JWKS URL.

#### Returns

`AuthentikBearerAuthProvider`

## Properties

### acceptsBearer

> `readonly` __acceptsBearer__: `true` = `true`

Defined in: src/providers/AuthentikBearerAuthProvider.ts:74

Marks this provider as usable by the bearer middleware.

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`acceptsBearer`](../../BaseAuthProvider/interfaces/AuthProvider.md#acceptsbearer)

***

### displayName

> `readonly` __displayName__: `"Authentik (Bearer)"` = `'Authentik (Bearer)'`

Defined in: src/providers/AuthentikBearerAuthProvider.ts:72

Human-readable name shown in admin UIs

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`displayName`](../../BaseAuthProvider/interfaces/AuthProvider.md#displayname)

***

### id

> `readonly` __id__: `"authentik-bearer"` = `'authentik-bearer'`

Defined in: src/providers/AuthentikBearerAuthProvider.ts:71

Unique identifier, e.g. 'password', 'magic-link', 'oauth-google'

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`id`](../../BaseAuthProvider/interfaces/AuthProvider.md#id)

## Methods

### verify()

> __verify__(`credentials`): `Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

Defined in: src/providers/AuthentikBearerAuthProvider.ts:95

Verify the bearer JWT and resolve (or provision) the local user.
`credentials.token` is the raw JWT lifted from the `Authorization: Bearer`
header by the request-time middleware.

#### Parameters

##### credentials

[`AuthVerifyCredentials`](../../BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

#### Returns

`Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`verify`](../../BaseAuthProvider/interfaces/AuthProvider.md#verify)
