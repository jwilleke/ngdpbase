[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditEventNames](../README.md) / addonAuditEventName

# Function: addonAuditEventName()

> __addonAuditEventName__(`name`): [`AddonAuditEventName`](../type-aliases/AddonAuditEventName.md)

Defined in: src/utils/auditEventNames.ts:62

Name an addon's audit event. Throws on a name outside `{target}-{action}`.

Whether the name is declared is checked when the event is recorded, not
here: the registry is bound when AuditManager initialises, which may be
after the addon module loads. `lint:audit` reads the literal passed here as
the addon's emitter, so pass a string literal.

## Parameters

### name

`string`

## Returns

[`AddonAuditEventName`](../type-aliases/AddonAuditEventName.md)
