[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/User](../README.md) / AuthResult

# Interface: AuthResult

Defined in: [src/types/User.ts:195](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L195)

User authentication result

Result of authentication attempt.

## Properties

### error?

> `optional` __error__: `string`

Defined in: [src/types/User.ts:206](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L206)

Error message if failed

***

### errorCode?

> `optional` __errorCode__: `string`

Defined in: [src/types/User.ts:209](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L209)

Error code (invalid_credentials, account_disabled, etc.)

***

### sessionId?

> `optional` __sessionId__: `string`

Defined in: [src/types/User.ts:203](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L203)

Session ID if successful

***

### success

> __success__: `boolean`

Defined in: [src/types/User.ts:197](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L197)

Whether authentication succeeded

***

### user?

> `optional` __user__: [`User`](User.md)

Defined in: [src/types/User.ts:200](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L200)

User object if successful
