[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/User](../README.md) / AuthResult

# Interface: AuthResult

Defined in: src/types/User.ts:298

User authentication result

Result of authentication attempt.

## Properties

### error?

> `optional` __error?__: `string`

Defined in: src/types/User.ts:309

Error message if failed

***

### errorCode?

> `optional` __errorCode?__: `string`

Defined in: src/types/User.ts:312

Error code (invalid_credentials, account_disabled, etc.)

***

### sessionId?

> `optional` __sessionId?__: `string`

Defined in: src/types/User.ts:306

Session ID if successful

***

### success

> __success__: `boolean`

Defined in: src/types/User.ts:300

Whether authentication succeeded

***

### user?

> `optional` __user?__: [`User`](User.md)

Defined in: src/types/User.ts:303

User object if successful
