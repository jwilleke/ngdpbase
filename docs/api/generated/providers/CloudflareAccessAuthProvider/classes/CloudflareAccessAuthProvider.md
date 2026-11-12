[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/CloudflareAccessAuthProvider](../README.md) / CloudflareAccessAuthProvider

# Class: CloudflareAccessAuthProvider

Defined in: src/providers/CloudflareAccessAuthProvider.ts:67

Interface all authentication providers must implement.

## Implements

- [`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md)

## Constructors

### Constructor

> __new CloudflareAccessAuthProvider__(`engine`, `config`, `jwksOverride?`): `CloudflareAccessAuthProvider`

Defined in: src/providers/CloudflareAccessAuthProvider.ts:83

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

##### config

[`CloudflareAccessConfig`](../interfaces/CloudflareAccessConfig.md)

##### jwksOverride?

`JWTVerifyGetKey`\<`Uint8Array`\<`ArrayBufferLike`\> \| `CryptoKey`\>

optional pre-built JWKS getter for tests; production
  omits this and uses `createRemoteJWKSet` against the team-domain certs
  endpoint.

#### Returns

`CloudflareAccessAuthProvider`

## Properties

### displayName

> `readonly` __displayName__: `"Cloudflare Access"` = `'Cloudflare Access'`

Defined in: src/providers/CloudflareAccessAuthProvider.ts:69

Human-readable name shown in admin UIs

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`displayName`](../../BaseAuthProvider/interfaces/AuthProvider.md#displayname)

***

### factor

> `readonly` __factor__: [`FactorDescription`](../../BaseAuthProvider/interfaces/FactorDescription.md)

Defined in: src/providers/CloudflareAccessAuthProvider.ts:71

An identity provider, as Google: AAL1 with no `amr` of its own (#1523).

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`factor`](../../BaseAuthProvider/interfaces/AuthProvider.md#factor)

***

### id

> `readonly` __id__: `"cloudflare-access"` = `'cloudflare-access'`

Defined in: src/providers/CloudflareAccessAuthProvider.ts:68

Unique identifier, e.g. 'password', 'magic-link', 'oauth-google'

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`id`](../../BaseAuthProvider/interfaces/AuthProvider.md#id)

## Methods

### verify()

> __verify__(`credentials`): `Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

Defined in: src/providers/CloudflareAccessAuthProvider.ts:96

Verify the Cloudflare Access JWT and resolve (or provision) the local user.
`credentials.token` is the raw JWT lifted from the `Cf-Access-Jwt-Assertion`
header by the request-time middleware.

#### Parameters

##### credentials

[`AuthVerifyCredentials`](../../BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

#### Returns

`Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`verify`](../../BaseAuthProvider/interfaces/AuthProvider.md#verify)
