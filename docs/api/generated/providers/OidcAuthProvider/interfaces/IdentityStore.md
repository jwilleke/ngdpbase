[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/OidcAuthProvider](../README.md) / IdentityStore

# Interface: IdentityStore

Defined in: src/providers/OidcAuthProvider.ts:113

How the provider reaches connected identities: the credentials store, through AuthManager.

## Methods

### find()

> __find__(`subject`): \{ `id`: `string`; `username`: `string`; \} \| `null`

Defined in: src/providers/OidcAuthProvider.ts:115

The row connecting this subject to an account, or null.

#### Parameters

##### subject

`string`

#### Returns

\{ `id`: `string`; `username`: `string`; \} \| `null`

***

### used()

> __used__(`id`, `at`, `email`): `Promise`\<`void`\>

Defined in: src/providers/OidcAuthProvider.ts:117

Record a sign-in with it, and the provider's current verified email.

#### Parameters

##### id

`string`

##### at

`string`

##### email

`string`

#### Returns

`Promise`\<`void`\>
