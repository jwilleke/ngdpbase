[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/User](../README.md) / UserSession

# Interface: UserSession

Defined in: src/types/User.ts:264

User session data

Active session information stored by session manager.

## Properties

### createdAt

> __createdAt__: `string`

Defined in: src/types/User.ts:275

Session creation timestamp (ISO 8601)

***

### data?

> `optional` __data?__: `Record`\<`string`, `unknown`\>

Defined in: src/types/User.ts:290

Additional session data

***

### expiresAt

> __expiresAt__: `string`

Defined in: src/types/User.ts:278

Session expiration timestamp (ISO 8601)

***

### ipAddress?

> `optional` __ipAddress?__: `string`

Defined in: src/types/User.ts:284

Client IP address

***

### lastActivity

> __lastActivity__: `string`

Defined in: src/types/User.ts:281

Last activity timestamp (ISO 8601)

***

### sessionId

> __sessionId__: `string`

Defined in: src/types/User.ts:266

Session ID (unique)

***

### userAgent?

> `optional` __userAgent?__: `string`

Defined in: src/types/User.ts:287

User agent string

***

### userId

> __userId__: `string`

Defined in: src/types/User.ts:272

User ID (username or external ID)

***

### username

> __username__: `string`

Defined in: src/types/User.ts:269

Username
