[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/User](../README.md) / UserCreateData

# Interface: UserCreateData

Defined in: src/types/User.ts:205

User creation data

Data required to create a new user (no password hash yet).

## Properties

### displayName

> __displayName__: `string`

Defined in: src/types/User.ts:213

Display name

***

### email

> __email__: `string`

Defined in: src/types/User.ts:210

Email address

***

### isActive?

> `optional` __isActive?__: `boolean`

Defined in: src/types/User.ts:222

Whether account starts active

***

### password

> __password__: `string`

Defined in: src/types/User.ts:216

Plain text password (will be hashed)

***

### preferences?

> `optional` __preferences?__: `Partial`\<[`UserPreferences`](UserPreferences.md)\>

Defined in: src/types/User.ts:225

User preferences

***

### roles?

> `optional` __roles?__: `string`[]

Defined in: src/types/User.ts:219

Initial roles

***

### username

> __username__: `string`

Defined in: src/types/User.ts:207

Username (unique)
