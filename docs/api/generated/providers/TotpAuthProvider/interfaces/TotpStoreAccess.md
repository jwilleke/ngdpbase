[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/TotpAuthProvider](../README.md) / TotpStoreAccess

# Interface: TotpStoreAccess

Defined in: src/providers/TotpAuthProvider.ts:38

The store access AuthManager grants: an account's TOTP rows, and recording a use.

## Methods

### rows()

> __rows__(`username`): [`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md)[]

Defined in: src/providers/TotpAuthProvider.ts:39

#### Parameters

##### username

`string`

#### Returns

[`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md)[]

***

### used()

> __used__(`id`, `at`, `secret`): `Promise`\<`void`\>

Defined in: src/providers/TotpAuthProvider.ts:40

#### Parameters

##### id

`string`

##### at

`string`

##### secret

`string`

#### Returns

`Promise`\<`void`\>
