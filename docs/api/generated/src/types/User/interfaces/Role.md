[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/User](../README.md) / Role

# Interface: Role

Defined in: [src/types/User.ts:217](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L217)

User role definition

Defines a role and its permissions.

## Properties

### description?

> `optional` __description__: `string`

Defined in: [src/types/User.ts:225](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L225)

Role description

***

### displayName

> __displayName__: `string`

Defined in: [src/types/User.ts:222](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L222)

Display name

***

### inherits?

> `optional` __inherits__: `string`[]

Defined in: [src/types/User.ts:234](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L234)

Parent roles (inheritance)

***

### isSystem

> __isSystem__: `boolean`

Defined in: [src/types/User.ts:231](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L231)

Whether this is a system role (cannot be deleted)

***

### name

> __name__: `string`

Defined in: [src/types/User.ts:219](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L219)

Role name (unique identifier)

***

### permissions

> __permissions__: `string`[]

Defined in: [src/types/User.ts:228](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/User.ts#L228)

Permissions granted by this role
