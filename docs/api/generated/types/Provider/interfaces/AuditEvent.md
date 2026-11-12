[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Provider](../README.md) / AuditEvent

# Interface: AuditEvent

Defined in: src/types/Provider.ts:916

Audit event

## Properties

### action

> __action__: `string`

Defined in: src/types/Provider.ts:930

Action performed

***

### actor

> __actor__: `string`

Defined in: src/types/Provider.ts:924

Actor (user ID or 'system')

***

### data?

> `optional` __data?__: `Record`\<`string`, `unknown`\>

Defined in: src/types/Provider.ts:942

Additional event data

***

### error?

> `optional` __error?__: `string`

Defined in: src/types/Provider.ts:948

Error message if failed

***

### id

> __id__: `string`

Defined in: src/types/Provider.ts:918

Event ID (UUID)

***

### ipAddress?

> `optional` __ipAddress?__: `string`

Defined in: src/types/Provider.ts:936

IP address

***

### result

> __result__: `"success"` \| `"failure"`

Defined in: src/types/Provider.ts:945

Event result (success, failure)

***

### target

> __target__: `string`

Defined in: src/types/Provider.ts:927

Target resource

***

### timestamp

> __timestamp__: `string`

Defined in: src/types/Provider.ts:933

Event timestamp (ISO 8601)

***

### type

> __type__: `string`

Defined in: src/types/Provider.ts:921

Event type

***

### userAgent?

> `optional` __userAgent?__: `string`

Defined in: src/types/Provider.ts:939

User agent
