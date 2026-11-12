[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/User](../README.md) / UserUpdateData

# Interface: UserUpdateData

Defined in: src/types/User.ts:233

User update data

Partial user data for updates (all fields optional).

## Properties

### avatar?

> `optional` __avatar?__: `string`

Defined in: src/types/User.ts:253

Avatar

***

### displayName?

> `optional` __displayName?__: `string`

Defined in: src/types/User.ts:238

Display name

***

### email?

> `optional` __email?__: `string`

Defined in: src/types/User.ts:235

Email address

***

### isActive?

> `optional` __isActive?__: `boolean`

Defined in: src/types/User.ts:247

Active status

***

### metadata?

> `optional` __metadata?__: `Record`\<`string`, `unknown`\>

Defined in: src/types/User.ts:256

Metadata

***

### password?

> `optional` __password?__: `string`

Defined in: src/types/User.ts:241

New plain text password (will be hashed)

***

### preferences?

> `optional` __preferences?__: `Partial`\<[`UserPreferences`](UserPreferences.md)\>

Defined in: src/types/User.ts:250

Updated preferences

***

### roles?

> `optional` __roles?__: `string`[]

Defined in: src/types/User.ts:244

Updated roles
