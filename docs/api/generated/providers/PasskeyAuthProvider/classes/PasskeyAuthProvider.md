[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/PasskeyAuthProvider](../README.md) / PasskeyAuthProvider

# Class: PasskeyAuthProvider

Defined in: src/providers/PasskeyAuthProvider.ts:83

Interface all authentication providers must implement.

## Implements

- [`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md)

## Constructors

### Constructor

> __new PasskeyAuthProvider__(`rp`, `store`): `PasskeyAuthProvider`

Defined in: src/providers/PasskeyAuthProvider.ts:94

#### Parameters

##### rp

[`PasskeyRelyingParty`](../interfaces/PasskeyRelyingParty.md)

##### store

[`PasskeyStoreAccess`](../interfaces/PasskeyStoreAccess.md)

#### Returns

`PasskeyAuthProvider`

## Properties

### displayName

> `readonly` __displayName__: `"Passkey"` = `'Passkey'`

Defined in: src/providers/PasskeyAuthProvider.ts:85

Human-readable name shown in admin UIs

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`displayName`](../../BaseAuthProvider/interfaces/AuthProvider.md#displayname)

***

### factor

> `readonly` __factor__: [`FactorDescription`](../../BaseAuthProvider/interfaces/FactorDescription.md)

Defined in: src/providers/PasskeyAuthProvider.ts:92

Something you have (the key) unlocked by something you know or are (the
PIN or biometric the authenticator requires): AAL2, phishing-resistant.
`swk` because most passkeys sync; a device-bound key is stronger, never
weaker, than what is claimed here.

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`factor`](../../BaseAuthProvider/interfaces/AuthProvider.md#factor)

***

### id

> `readonly` __id__: `"passkey"` = `'passkey'`

Defined in: src/providers/PasskeyAuthProvider.ts:84

Unique identifier, e.g. 'password', 'magic-link', 'oauth-google'

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`id`](../../BaseAuthProvider/interfaces/AuthProvider.md#id)

## Methods

### authenticationOptions()

> __authenticationOptions__(): `Promise`\<`PublicKeyCredentialRequestOptionsJSON`\>

Defined in: src/providers/PasskeyAuthProvider.ts:141

Options for signing in: no username asked, any passkey for this host may answer.

#### Returns

`Promise`\<`PublicKeyCredentialRequestOptionsJSON`\>

***

### registrationOptions()

> __registrationOptions__(`username`, `displayName`, `existing`): `Promise`\<`PublicKeyCredentialCreationOptionsJSON`\>

Defined in: src/providers/PasskeyAuthProvider.ts:102

Options for enrolling a passkey; `existing` keeps one authenticator from enrolling twice.

#### Parameters

##### username

`string`

##### displayName

`string`

##### existing

readonly [`CredentialRecord`](../../BaseCredentialsProvider/interfaces/CredentialRecord.md)[]

#### Returns

`Promise`\<`PublicKeyCredentialCreationOptionsJSON`\>

***

### relyingParty()

> __relyingParty__(): [`PasskeyRelyingParty`](../interfaces/PasskeyRelyingParty.md)

Defined in: src/providers/PasskeyAuthProvider.ts:97

The relying party passkeys are tied to — for the admin page and the enrol screen.

#### Returns

[`PasskeyRelyingParty`](../interfaces/PasskeyRelyingParty.md)

***

### verify()

> __verify__(`credentials`): `Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

Defined in: src/providers/PasskeyAuthProvider.ts:150

Verify a sign-in. The credential id names the passkey; its public key and
counter come from the store. A counter that does not move forward (where
the authenticator keeps one) is a cloned key and fails.

#### Parameters

##### credentials

[`AuthVerifyCredentials`](../../BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

#### Returns

`Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`verify`](../../BaseAuthProvider/interfaces/AuthProvider.md#verify)

***

### verifyRegistration()

> __verifyRegistration__(`response`, `expectedChallenge`): `Promise`\<\{ `secret`: `string`; `subject`: `string`; \} \| `null`\>

Defined in: src/providers/PasskeyAuthProvider.ts:115

Verify an enrolment; returns what the credentials store keeps, or null when it does not verify.

#### Parameters

##### response

`RegistrationResponseJSON`

##### expectedChallenge

`string`

#### Returns

`Promise`\<\{ `secret`: `string`; `subject`: `string`; \} \| `null`\>
