[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/TotpAuthProvider](../README.md) / TotpAuthProvider

# Class: TotpAuthProvider

Defined in: src/providers/TotpAuthProvider.ts:73

Interface all authentication providers must implement.

## Implements

- [`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md)

## Constructors

### Constructor

> __new TotpAuthProvider__(`credentialsKey`, `issuer`, `store`, `now?`): `TotpAuthProvider`

Defined in: src/providers/TotpAuthProvider.ts:83

#### Parameters

##### credentialsKey

`string`

`NGDPBASE_CREDENTIALS_KEY`, from which the seed key is derived

##### issuer

`string`

shown in the authenticator app beside the account

##### store

[`TotpStoreAccess`](../interfaces/TotpStoreAccess.md)

##### now?

() => `number`

#### Returns

`TotpAuthProvider`

## Properties

### displayName

> `readonly` __displayName__: `"Authenticator app"` = `'Authenticator app'`

Defined in: src/providers/TotpAuthProvider.ts:75

Human-readable name shown in admin UIs

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`displayName`](../../BaseAuthProvider/interfaces/AuthProvider.md#displayname)

***

### factor

> `readonly` __factor__: [`FactorDescription`](../../BaseAuthProvider/interfaces/FactorDescription.md)

Defined in: src/providers/TotpAuthProvider.ts:76

What this provider gives as a sign-in factor (#1523). Absent on providers
that carry delegated credentials (agent tokens, bearer JWTs): a delegated
credential is a scope ceiling, never a factor, and is never offered at
sign-in.

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`factor`](../../BaseAuthProvider/interfaces/AuthProvider.md#factor)

***

### id

> `readonly` __id__: `"totp"` = `'totp'`

Defined in: src/providers/TotpAuthProvider.ts:74

Unique identifier, e.g. 'password', 'magic-link', 'oauth-google'

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`id`](../../BaseAuthProvider/interfaces/AuthProvider.md#id)

## Methods

### confirmEnrolment()

> __confirmEnrolment__(`username`, `seed`, `code`): `string` \| `null`

Defined in: src/providers/TotpAuthProvider.ts:125

Check the code that confirms an enrolment and seal the seed for the store.
The confirming code's step is recorded, so it cannot then sign anyone in.
Null when the seed is malformed or the code does not match.

#### Parameters

##### username

`string`

##### seed

`string`

##### code

`string`

#### Returns

`string` \| `null`

***

### newEnrolment()

> __newEnrolment__(`username`): [`TotpEnrolment`](../interfaces/TotpEnrolment.md)

Defined in: src/providers/TotpAuthProvider.ts:93

A fresh 160-bit seed and its URI for `username`. Nothing is stored.

#### Parameters

##### username

`string`

#### Returns

[`TotpEnrolment`](../interfaces/TotpEnrolment.md)

***

### openPending()

> __openPending__(`username`, `sealed`): `string` \| `null`

Defined in: src/providers/TotpAuthProvider.ts:108

Open what `sealPending` made for `username`; null when it is not that.

#### Parameters

##### username

`string`

##### sealed

`unknown`

#### Returns

`string` \| `null`

***

### sealPending()

> __sealPending__(`username`, `seed`): `string`

Defined in: src/providers/TotpAuthProvider.ts:103

Seal a seed that is offered but not yet confirmed, so it can wait in the
session without being readable there or in a session log (#421). Its own
shape, so it never opens as a stored secret.

#### Parameters

##### username

`string`

##### seed

`string`

#### Returns

`string`

***

### verify()

> __verify__(`credentials`): `Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

Defined in: src/providers/TotpAuthProvider.ts:137

Verify `credentials.code` for `credentials.username`. A failure gives no reason.

#### Parameters

##### credentials

[`AuthVerifyCredentials`](../../BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

#### Returns

`Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`verify`](../../BaseAuthProvider/interfaces/AuthProvider.md#verify)
