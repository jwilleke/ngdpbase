[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/User](../README.md) / Role

# Interface: Role

Defined in: src/types/User.ts:320

User role definition

Defines a role and its permissions.

## Properties

### description?

> `optional` __description?__: `string`

Defined in: src/types/User.ts:328

Role description

***

### displayName

> __displayName__: `string`

Defined in: src/types/User.ts:325

Display name

***

### inherits?

> `optional` __inherits?__: `string`[]

Defined in: src/types/User.ts:337

Parent roles (inheritance)

***

### isSystem

> __isSystem__: `boolean`

Defined in: src/types/User.ts:334

Whether this is a system role (cannot be deleted)

***

### name

> __name__: `string`

Defined in: src/types/User.ts:322

Role name (unique identifier)

***

### permissions

> __permissions__: `string`[]

Defined in: src/types/User.ts:331

Permissions granted by this role
