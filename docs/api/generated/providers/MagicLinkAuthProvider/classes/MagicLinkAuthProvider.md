[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/MagicLinkAuthProvider](../README.md) / MagicLinkAuthProvider

# Class: MagicLinkAuthProvider

Defined in: src/providers/MagicLinkAuthProvider.ts:84

Interface all authentication providers must implement.

## Implements

- [`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md)

## Constructors

### Constructor

> __new MagicLinkAuthProvider__(`engine`, `config`): `MagicLinkAuthProvider`

Defined in: src/providers/MagicLinkAuthProvider.ts:95

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

##### config

[`MagicLinkConfig`](../interfaces/MagicLinkConfig.md)

#### Returns

`MagicLinkAuthProvider`

## Properties

### displayName

> `readonly` __displayName__: `"Magic Link"` = `'Magic Link'`

Defined in: src/providers/MagicLinkAuthProvider.ts:86

Human-readable name shown in admin UIs

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`displayName`](../../BaseAuthProvider/interfaces/AuthProvider.md#displayname)

***

### factor

> `readonly` __factor__: [`FactorDescription`](../../BaseAuthProvider/interfaces/FactorDescription.md)

Defined in: src/providers/MagicLinkAuthProvider.ts:88

Email is never phishing-resistant and never above AAL1: SP 800-63B §5.1.3.1 bars it as out-of-band (#1523).

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`factor`](../../BaseAuthProvider/interfaces/AuthProvider.md#factor)

***

### id

> `readonly` __id__: `"magic-link"` = `'magic-link'`

Defined in: src/providers/MagicLinkAuthProvider.ts:85

Unique identifier, e.g. 'password', 'magic-link', 'oauth-google'

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`id`](../../BaseAuthProvider/interfaces/AuthProvider.md#id)

## Methods

### accountChoices()

> __accountChoices__(`token`): `string`[] \| `null`

Defined in: src/providers/MagicLinkAuthProvider.ts:228

The accounts a link to a shared address offers (#2073), by username, or
null for a link to one account (or an unknown or expired one). Read
without consuming, so the page asking which account can be shown.

#### Parameters

##### token

`string`

#### Returns

`string`[] \| `null`

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`accountChoices`](../../BaseAuthProvider/interfaces/AuthProvider.md#accountchoices)

***

### consumeToken()

> __consumeToken__(`token`): `boolean`

Defined in: src/providers/MagicLinkAuthProvider.ts:258

Delete the token and report whether THIS caller was the one that did.

# 1021: the return value is the single-use gate, not a courtesy. The route
used to verify, then consume, with an `await` between the two — so two
POSTs carrying the same token (a double-clicked confirmation button, a
client retry, a prefetch racing the real submit) could both clear
verification before either consumed, and both would then establish a
session. #1019's CSRF-protected POST does not close that: both submits
come from the same session with the same valid token.

`Map.delete` returns true only for the call that found an entry, and it is
synchronous so it cannot interleave. Exactly one caller can ever see true,
which makes consumption — not verification — the thing a session is gated
on.

#### Parameters

##### token

`string`

#### Returns

`boolean`

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`consumeToken`](../../BaseAuthProvider/interfaces/AuthProvider.md#consumetoken)

***

### getDeviceState()

> __getDeviceState__(`token`): `string` \| `null`

Defined in: src/providers/MagicLinkAuthProvider.ts:268

The requesting browser's state value for this token (#1022), or null.

Must be read BEFORE consumeToken(), which deletes the entry — same
constraint as getFlowRedirect below, and for the same reason.

#### Parameters

##### token

`string`

#### Returns

`string` \| `null`

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`getDeviceState`](../../BaseAuthProvider/interfaces/AuthProvider.md#getdevicestate)

***

### getFlowRedirect()

> __getFlowRedirect__(`token`): `string`

Defined in: src/providers/MagicLinkAuthProvider.ts:282

Where the user was headed before the link was issued (#1049).

Named for the capability rather than the mechanism: GoogleOIDCProvider
answers the same question keyed by a state nonce, and the two used to be
`getTokenRedirect` / `getStateRedirect`, which is why AuthManager needed a
method per provider to ask it.

Must be read BEFORE consumeToken(), which deletes the entry.

#### Parameters

##### token

`string`

#### Returns

`string`

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`getFlowRedirect`](../../BaseAuthProvider/interfaces/AuthProvider.md#getflowredirect)

***

### getTokenCount()

> __getTokenCount__(): `number`

Defined in: src/providers/MagicLinkAuthProvider.ts:406

Exposed for testing

#### Returns

`number`

***

### initiate()

> __initiate__(`context`): `Promise`\<`void`\>

Defined in: src/providers/MagicLinkAuthProvider.ts:107

Initiate the magic-link flow: look up the user, generate a token, send the email.
Silently succeeds if the email is not registered — prevents user enumeration.

#### Parameters

##### context

[`AuthInitiateContext`](../../BaseAuthProvider/interfaces/AuthInitiateContext.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`initiate`](../../BaseAuthProvider/interfaces/AuthProvider.md#initiate)

***

### provisionIfNew()

> __provisionIfNew__(`token`): `Promise`\<`boolean`\>

Defined in: src/providers/MagicLinkAuthProvider.ts:303

Create the account behind a new-user token (#1026).

Called from the POST that completes sign-in, never from the GET — so a mail
scanner pre-fetching the link cannot bring an account into existence, for
the same reason it cannot consume the token (#1019).

The account is created with `isExternal: true`, which stores an empty
password hash. `UserManager.verifyPassword` refuses an empty stored hash
outright (#1042), so these accounts cannot be logged into with a password
by any input — magic link is structurally their only way in.

Idempotent: a token whose account already exists is a no-op, so a double
submit cannot fail the second time.

#### Parameters

##### token

`string`

#### Returns

`Promise`\<`boolean`\>

true if the token is usable (existing user, or newly created)

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`provisionIfNew`](../../BaseAuthProvider/interfaces/AuthProvider.md#provisionifnew)

***

### verify()

> __verify__(`credentials`): `Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

Defined in: src/providers/MagicLinkAuthProvider.ts:208

Verify a token. Returns AuthResult on success, null if invalid or expired.
Does NOT consume the token — call consumeToken() after the session is created.

#### Parameters

##### credentials

[`AuthVerifyCredentials`](../../BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

#### Returns

`Promise`\<[`AuthResult`](../../BaseAuthProvider/interfaces/AuthResult.md) \| `null`\>

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`verify`](../../BaseAuthProvider/interfaces/AuthProvider.md#verify)
