[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditRegistry](../README.md) / AuditEventDeclaration

# Interface: AuditEventDeclaration

Defined in: src/utils/auditRegistry.ts:48

One entry of `ngdpbase.audit.events`.

## Properties

### description

> __description__: `string`

Defined in: src/utils/auditRegistry.ts:53

One line, shown in the admin filter and the documented table.

***

### enabled?

> `optional` __enabled?__: `boolean`

Defined in: src/utils/auditRegistry.ts:51

Whether the emitter fires. Omitted means true; `false` is a decision on the record.

***

### on-failure

> __on-failure__: [`AuditOnFailure`](../type-aliases/AuditOnFailure.md)

Defined in: src/utils/auditRegistry.ts:49
