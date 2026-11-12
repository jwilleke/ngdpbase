[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/AgentTokenAuthProvider](../README.md) / AgentTokenAuthProvider

# Class: AgentTokenAuthProvider

Defined in: src/providers/AgentTokenAuthProvider.ts:41

Interface all authentication providers must implement.

## Implements

- [`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md)

## Constructors

### Constructor

> __new AgentTokenAuthProvider__(`engine`): `AgentTokenAuthProvider`

Defined in: src/providers/AgentTokenAuthProvider.ts:49

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

#### Returns

`AgentTokenAuthProvider`

## Properties

### acceptsBearer

> `readonly` __acceptsBearer__: `true` = `true`

Defined in: src/providers/AgentTokenAuthProvider.ts:45

Marks this provider as usable by the bearer middleware.

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`acceptsBearer`](../../BaseAuthProvider/interfaces/AuthProvider.md#acceptsbearer)

***

### displayName

> `readonly` __displayName__: `"Agent API Token"` = `'Agent API Token'`

Defined in: src/providers/AgentTokenAuthProvider.ts:43

Human-readable name shown in admin UIs

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`displayName`](../../BaseAuthProvider/interfaces/AuthProvider.md#displayname)

***

### id

> `readonly` __id__: `"agent-token"` = `'agent-token'`

Defined in: src/providers/AgentTokenAuthProvider.ts:42

Unique identifier, e.g. 'password', 'magic-link', 'oauth-google'

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`id`](../../BaseAuthProvider/interfaces/AuthProvider.md#id)

## Methods

### verify()

> __verify__(`credentials`): `Promise`\<[`AgentTokenAuthResult`](../interfaces/AgentTokenAuthResult.md) \| `null`\>

Defined in: src/providers/AgentTokenAuthProvider.ts:53

Verify credentials or a token.

#### Parameters

##### credentials

[`AuthVerifyCredentials`](../../BaseAuthProvider/interfaces/AuthVerifyCredentials.md)

#### Returns

`Promise`\<[`AgentTokenAuthResult`](../interfaces/AgentTokenAuthResult.md) \| `null`\>

AuthResult on success, null on failure.

#### Implementation of

[`AuthProvider`](../../BaseAuthProvider/interfaces/AuthProvider.md).[`verify`](../../BaseAuthProvider/interfaces/AuthProvider.md#verify)
