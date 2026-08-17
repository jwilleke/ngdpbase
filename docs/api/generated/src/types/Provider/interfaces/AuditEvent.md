[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/types/Provider](../README.md) / AuditEvent

# Interface: AuditEvent

Defined in: [src/types/Provider.ts:486](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L486)

Audit event

## Properties

### action

> __action__: `string`

Defined in: [src/types/Provider.ts:500](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L500)

Action performed

***

### actor

> __actor__: `string`

Defined in: [src/types/Provider.ts:494](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L494)

Actor (user ID or 'system')

***

### data?

> `optional` __data__: `Record`\<`string`, `unknown`\>

Defined in: [src/types/Provider.ts:512](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L512)

Additional event data

***

### error?

> `optional` __error__: `string`

Defined in: [src/types/Provider.ts:518](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L518)

Error message if failed

***

### id

> __id__: `string`

Defined in: [src/types/Provider.ts:488](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L488)

Event ID (UUID)

***

### ipAddress?

> `optional` __ipAddress__: `string`

Defined in: [src/types/Provider.ts:506](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L506)

IP address

***

### result

> __result__: `"success"` \| `"failure"`

Defined in: [src/types/Provider.ts:515](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L515)

Event result (success, failure)

***

### target

> __target__: `string`

Defined in: [src/types/Provider.ts:497](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L497)

Target resource

***

### timestamp

> __timestamp__: `string`

Defined in: [src/types/Provider.ts:503](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L503)

Event timestamp (ISO 8601)

***

### type

> __type__: `string`

Defined in: [src/types/Provider.ts:491](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L491)

Event type

***

### userAgent?

> `optional` __userAgent__: `string`

Defined in: [src/types/Provider.ts:509](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/types/Provider.ts#L509)

User agent
