[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/User](../README.md) / UserCreateData

# Interface: UserCreateData

Defined in: [src/types/User.ts:102](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L102)

User creation data

Data required to create a new user (no password hash yet).

## Properties

### displayName

> __displayName__: `string`

Defined in: [src/types/User.ts:110](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L110)

Display name

***

### email

> __email__: `string`

Defined in: [src/types/User.ts:107](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L107)

Email address

***

### isActive?

> `optional` __isActive__: `boolean`

Defined in: [src/types/User.ts:119](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L119)

Whether account starts active

***

### password

> __password__: `string`

Defined in: [src/types/User.ts:113](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L113)

Plain text password (will be hashed)

***

### preferences?

> `optional` __preferences__: `Partial`\<[`UserPreferences`](UserPreferences.md)\>

Defined in: [src/types/User.ts:122](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L122)

User preferences

***

### roles?

> `optional` __roles__: `string`[]

Defined in: [src/types/User.ts:116](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L116)

Initial roles

***

### username

> __username__: `string`

Defined in: [src/types/User.ts:104](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L104)

Username (unique)
