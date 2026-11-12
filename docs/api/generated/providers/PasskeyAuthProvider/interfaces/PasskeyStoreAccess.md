[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/PasskeyAuthProvider](../README.md) / PasskeyStoreAccess

# Interface: PasskeyStoreAccess

Defined in: src/providers/PasskeyAuthProvider.ts:56

The store access AuthManager grants: find by credential id, record a use.

## Methods

### find()

> __find__(`credentialId`): [`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md) \| `null`

Defined in: src/providers/PasskeyAuthProvider.ts:57

#### Parameters

##### credentialId

`string`

#### Returns

[`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md) \| `null`

***

### used()

> __used__(`id`, `at`, `secret`): `Promise`\<`void`\>

Defined in: src/providers/PasskeyAuthProvider.ts:58

#### Parameters

##### id

`string`

##### at

`string`

##### secret

`string`

#### Returns

`Promise`\<`void`\>
