[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/NotificationManager](../README.md) / NotificationInput

# Interface: NotificationInput

Defined in: src/managers/NotificationManager.ts:37

Input for creating a notification

## Properties

### escalate?

> `optional` __escalate?__: `boolean`

Defined in: src/managers/NotificationManager.ts:50

False: never email this notification, whatever the escalation settings
(#1916). A notice that email is failing must not itself be emailed — the
send would fail and report another failure. Not stored.

***

### expiresAt?

> `optional` __expiresAt?__: `Date` \| `null`

Defined in: src/managers/NotificationManager.ts:44

***

### level?

> `optional` __level?__: `"error"` \| `"success"` \| `"info"` \| `"warning"`

Defined in: src/managers/NotificationManager.ts:41

***

### message?

> `optional` __message?__: `string`

Defined in: src/managers/NotificationManager.ts:40

***

### targetUsers?

> `optional` __targetUsers?__: `string`[]

Defined in: src/managers/NotificationManager.ts:43

Usernames or identity `@id`s; stored as `@id`s (#2041). Empty or absent: every user.

***

### title?

> `optional` __title?__: `string`

Defined in: src/managers/NotificationManager.ts:39

***

### type?

> `optional` __type?__: `"system"` \| `"user"` \| `"maintenance"`

Defined in: src/managers/NotificationManager.ts:38
