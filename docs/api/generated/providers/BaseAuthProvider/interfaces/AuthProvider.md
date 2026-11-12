[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuthProvider](../README.md) / AuthProvider

# Interface: AuthProvider

Defined in: src/providers/BaseAuthProvider.ts:154

Interface all authentication providers must implement.

## Properties

### acceptsBearer?

> `readonly` `optional` __acceptsBearer?__: `boolean`

Defined in: src/providers/BaseAuthProvider.ts:170

Whether the bearer middleware tries this provider for `Authorization: Bearer` (#946, #1576).

***

### displayName

> `readonly` __displayName__: `string`

Defined in: src/providers/BaseAuthProvider.ts:159

Human-readable name shown in admin UIs

***

### factor?

> `readonly` `optional` __factor?__: [`FactorDescription`](FactorDescription.md)

Defined in: src/providers/BaseAuthProvider.ts:167

What this provider gives as a sign-in factor (#1523). Absent on providers
that carry delegated credentials (agent tokens, bearer JWTs): a delegated
credential is a scope ceiling, never a factor, and is never offered at
sign-in.

***

### id

> `readonly` __id__: `string`

Defined in: src/providers/BaseAuthProvider.ts:156

Unique identifier, e.g. 'password', 'magic-link', 'oauth-google'

## Methods

### accountChoices()?

> `optional` __accountChoices__(`handle`): `string`[] \| `null`

Defined in: src/providers/BaseAuthProvider.ts:239

The accounts a flow to a shared address offers (#2073), by username, or
null when it names one account. Read without consuming.

#### Parameters

##### handle

`string`

#### Returns

`string`[] \| `null`

***

### consumeToken()?

> `optional` __consumeToken__(`token`): `boolean`

Defined in: src/providers/BaseAuthProvider.ts:198

Consume a single-use token, returning whether this caller consumed it.

# 1021: callers gate session creation on the return value — a `false` means
another request got there first and this one must not establish a session.
An implementation that cannot distinguish the two must return `false`
rather than `true`, since a wrong `true` re-opens the double-session hole.

#### Parameters

##### token

`string`

#### Returns

`boolean`

***

### getDeviceState()?

> `optional` __getDeviceState__(`handle`): `string` \| `null`

Defined in: src/providers/BaseAuthProvider.ts:233

The device-state value recorded when this flow was initiated (#1022), or
null when the provider does not bind, or the handle predates the feature.

Must be read BEFORE `consumeToken()`, which deletes the entry.

#### Parameters

##### handle

`string`

#### Returns

`string` \| `null`

***

### getFlowRedirect()?

> `optional` __getFlowRedirect__(`handle`): `string`

Defined in: src/providers/BaseAuthProvider.ts:225

Where the user was headed before this flow began, keyed by the flow's own
handle — a magic-link token, an OAuth state nonce (#1049).

Must be read BEFORE `consumeToken()`, which deletes the entry.

Returns `'/'` rather than throwing when the handle is unknown: losing the
destination degrades the landing page, it does not invalidate the sign-in,
and failing the login over it would be a worse outcome than the front page.

#### Parameters

##### handle

`string`

#### Returns

`string`

***

### initiate()?

> `optional` __initiate__(`context`): `Promise`\<`void`\>

Defined in: src/providers/BaseAuthProvider.ts:178

Initiate a challenge-based auth flow.
Called for flows that require a side-effect before verification
(e.g. send a magic-link email, start an OAuth redirect).
Credential-based providers (password) do not need to implement this.

#### Parameters

##### context

[`AuthInitiateContext`](AuthInitiateContext.md)

#### Returns

`Promise`\<`void`\>

***

### provisionIfNew()?

> `optional` __provisionIfNew__(`handle`): `Promise`\<`boolean`\>

Defined in: src/providers/BaseAuthProvider.ts:250

Create the account behind a first-time credential (#1049).

Called before `verify()` on flows that provision on first sign-in, because
the account must exist before a session can name it.

#### Parameters

##### handle

`string`

#### Returns

`Promise`\<`boolean`\>

true if an account was created or already existed; false if the
  handle is unusable — which the caller should treat as a failed sign-in.

***

### startFlow()?

> `optional` __startFlow__(`context`): `string` \| `Promise`\<`string`\>

Defined in: src/providers/BaseAuthProvider.ts:213

Begin a redirect-based flow; returns the URL to send the browser to (#1049).

Distinct from `initiate()`, which performs a side effect and returns
nothing (magic-link sends an email). Here the URL *is* the result.

Throws rather than returning a fallback when the flow cannot be started:
there is no sensible substitute for "where should the browser go", and an
empty string would send it nowhere with no error to explain why.

May answer asynchronously: an OpenID Connect provider reads its issuer's
discovery document before it knows where to send the browser (#1743).

#### Parameters

##### context

[`AuthInitiateContext`](AuthInitiateContext.md)

#### Returns

`string` \| `Promise`\<`string`\>

***

### verify()

> __verify__(`credentials`): `Promise`\<[`AuthResult`](AuthResult.md) \| `null`\>

Defined in: src/providers/BaseAuthProvider.ts:184

Verify credentials or a token.

#### Parameters

##### credentials

[`AuthVerifyCredentials`](AuthVerifyCredentials.md)

#### Returns

`Promise`\<[`AuthResult`](AuthResult.md) \| `null`\>

AuthResult on success, null on failure.
