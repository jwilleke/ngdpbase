[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/OidcAuthProvider](../README.md) / OidcAuthProvider

# Class: OidcAuthProvider

Defined in: src/providers/OidcAuthProvider.ts:155

Interface all authentication providers must implement.

## Implements

- [`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md)

## Constructors

### Constructor

> __new OidcAuthProvider__(`config`, `identities`): `OidcAuthProvider`

Defined in: src/providers/OidcAuthProvider.ts:171

#### Parameters

##### config

[`OidcProviderConfig`](../interfaces/OidcProviderConfig.md)

##### identities

[`IdentityStore`](../interfaces/IdentityStore.md)

#### Returns

`OidcAuthProvider`

## Properties

### displayName

> `readonly` __displayName__: `string`

Defined in: src/providers/OidcAuthProvider.ts:157

Human-readable name shown in admin UIs

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`displayName`](../../BaseAuthProvider/interfaces/AuthProvider.md#displayname)

***

### factor

> `readonly` __factor__: [`FactorDescription`](../../BaseAuthProvider/interfaces/FactorDescription.md)

Defined in: src/providers/OidcAuthProvider.ts:165

AAL1 with no `amr`: what is offered, and what a sign-in counts for unless
the admin trusts this provider's own second factor (`trust-mfa`, #1633),
when AuthManager maps the reported `amr` / `acr` instead
(`outsideLevel`). Primary: it starts a sign-in on its own.

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`factor`](../../BaseAuthProvider/interfaces/AuthProvider.md#factor)

***

### icon

> `readonly` __icon__: [`OutsideProviderIcon`](../type-aliases/OutsideProviderIcon.md)

Defined in: src/providers/OidcAuthProvider.ts:158

***

### id

> `readonly` __id__: `string`

Defined in: src/providers/OidcAuthProvider.ts:156

Unique identifier, e.g. 'password', 'magic-link', 'oauth-google'

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`id`](../../BaseAuthProvider/interfaces/AuthProvider.md#id)

## Accessors

### callbackIsPosted

#### Get Signature

> __get__ __callbackIsPosted__(): `boolean`

Defined in: src/providers/OidcAuthProvider.ts:191

Whether the issuer POSTs the callback (`response_mode=form_post`) instead of redirecting to it.

##### Returns

`boolean`

***

### issuer

#### Get Signature

> __get__ __issuer__(): `string`

Defined in: src/providers/OidcAuthProvider.ts:181

The configured issuer; an identity row's subject starts with it and `#`.

##### Returns

`string`

***

### name

#### Get Signature

> __get__ __name__(): `string`

Defined in: src/providers/OidcAuthProvider.ts:186

The entry's name, as in its URLs.

##### Returns

`string`

## Methods

### consumeToken()

> __consumeToken__(`state`): `boolean`

Defined in: src/providers/OidcAuthProvider.ts:278

Spend the flow's state; true only for the caller that did (#1021).

#### Parameters

##### state

`string`

#### Returns

`boolean`

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`consumeToken`](../../BaseAuthProvider/interfaces/AuthProvider.md#consumetoken)

***

### getFlowConnectFor()

> __getFlowConnectFor__(`state`): `string` \| `null`

Defined in: src/providers/OidcAuthProvider.ts:232

The account this flow is connecting an identity to, or null for a sign-in or an unknown flow.

#### Parameters

##### state

`string`

#### Returns

`string` \| `null`

***

### getFlowRedirect()

> __getFlowRedirect__(`state`): `string`

Defined in: src/providers/OidcAuthProvider.ts:227

Where the person was headed when the flow began; read before `consumeToken`.

#### Parameters

##### state

`string`

#### Returns

`string`

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`getFlowRedirect`](../../BaseAuthProvider/interfaces/AuthProvider.md#getflowredirect)

***

### startFlow()

> __startFlow__(`__namedParameters?`): `Promise`\<`string`\>

Defined in: src/providers/OidcAuthProvider.ts:199

Begin a sign-in, or a connection when `connectFor` names the signed-in
account: keep the flow's state and return the provider's authorization URL.

#### Parameters

##### \_\_namedParameters?

[`AuthInitiateContext`](../../BaseAuthProvider/interfaces/AuthInitiateContext.md) = `{}`

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`startFlow`](../../BaseAuthProvider/interfaces/AuthProvider.md#startflow)

***

### unconnectedIdentity()

> __unconnectedIdentity__(`state`): [`OidcIdentity`](../interfaces/OidcIdentity.md) \| `null`

Defined in: src/providers/OidcAuthProvider.ts:273

The verified identity a refused sign-in brought that no account has
connected, or null; read before `consumeToken` (#1743 slice 3).

#### Parameters

##### state

`string`

#### Returns

[`OidcIdentity`](../interfaces/OidcIdentity.md) \| `null`

***

### verify()

> __verify__(`credentials`): `Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

Defined in: src/providers/OidcAuthProvider.ts:243

Finish a sign-in: the account whose connected identity this is, or null.
A flow started to connect never signs in. An identity connected to no
account is refused, and kept on the flow until it is consumed, so
AuthManager can decide what happens next (`unconnectedIdentity`);
nothing here says whether an account exists.

#### Parameters

##### credentials

[`AuthVerifyCredentials`](../../BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

#### Returns

`Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`verify`](../../BaseAuthProvider/interfaces/AuthProvider.md#verify)

***

### verifyIdentity()

> __verifyIdentity__(`credentials`, `username`): `Promise`\<[`OidcIdentity`](../interfaces/OidcIdentity.md) \| `null`\>

Defined in: src/providers/OidcAuthProvider.ts:265

Finish a connection for `username`: the identity the provider vouched
for, or null. Only a flow started to connect that same account counts.

#### Parameters

##### credentials

[`AuthVerifyCredentials`](../../BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

##### username

`string`

#### Returns

`Promise`\<[`OidcIdentity`](../interfaces/OidcIdentity.md) \| `null`\>
