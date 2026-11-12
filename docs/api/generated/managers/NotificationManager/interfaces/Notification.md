[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/NotificationManager](../README.md) / Notification

# Interface: Notification

Defined in: src/managers/NotificationManager.ts:20

Notification object structure

## Properties

### createdAt

> __createdAt__: `Date`

Defined in: src/managers/NotificationManager.ts:28

***

### dismissedBy

> __dismissedBy__: `string`[]

Defined in: src/managers/NotificationManager.ts:31

Who dismissed it, by identity `@id` (#2041); a name with no account as given.

***

### expiresAt

> __expiresAt__: `Date` \| `null`

Defined in: src/managers/NotificationManager.ts:29

***

### id

> __id__: `string`

Defined in: src/managers/NotificationManager.ts:21

***

### level

> __level__: `"error"` \| `"success"` \| `"info"` \| `"warning"`

Defined in: src/managers/NotificationManager.ts:25

***

### message

> __message__: `string`

Defined in: src/managers/NotificationManager.ts:24

***

### targetUsers

> __targetUsers__: `string`[]

Defined in: src/managers/NotificationManager.ts:27

Who it is for, by identity `@id` (#2041); empty means every user. A name with no account is kept as given.

***

### title

> __title__: `string`

Defined in: src/managers/NotificationManager.ts:23

***

### type

> __type__: `"system"` \| `"user"` \| `"maintenance"`

Defined in: src/managers/NotificationManager.ts:22
