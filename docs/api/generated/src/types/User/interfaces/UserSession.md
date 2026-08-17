[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/User](../README.md) / UserSession

# Interface: UserSession

Defined in: [src/types/User.ts:161](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L161)

User session data

Active session information stored by session manager.

## Properties

### createdAt

> __createdAt__: `string`

Defined in: [src/types/User.ts:172](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L172)

Session creation timestamp (ISO 8601)

***

### data?

> `optional` __data__: `Record`\<`string`, `unknown`\>

Defined in: [src/types/User.ts:187](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L187)

Additional session data

***

### expiresAt

> __expiresAt__: `string`

Defined in: [src/types/User.ts:175](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L175)

Session expiration timestamp (ISO 8601)

***

### ipAddress?

> `optional` __ipAddress__: `string`

Defined in: [src/types/User.ts:181](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L181)

Client IP address

***

### lastActivity

> __lastActivity__: `string`

Defined in: [src/types/User.ts:178](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L178)

Last activity timestamp (ISO 8601)

***

### sessionId

> __sessionId__: `string`

Defined in: [src/types/User.ts:163](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L163)

Session ID (unique)

***

### userAgent?

> `optional` __userAgent__: `string`

Defined in: [src/types/User.ts:184](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L184)

User agent string

***

### userId

> __userId__: `string`

Defined in: [src/types/User.ts:169](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L169)

User ID (username or external ID)

***

### username

> __username__: `string`

Defined in: [src/types/User.ts:166](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L166)

Username
