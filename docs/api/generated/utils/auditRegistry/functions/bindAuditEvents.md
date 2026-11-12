[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditRegistry](../README.md) / bindAuditEvents

# Function: bindAuditEvents()

> __bindAuditEvents__(`source`): `void`

Defined in: src/utils/auditRegistry.ts:73

Bind the live configuration. `AuditManager.initialize` calls this before it
loads a provider, so every tier consulted from then on is the operator's.

There is no fallback to the shipped file: reading
`config/app-default-config.json` here would be a second reader over the
configuration store, and a value could then come from the file when the live
configuration says otherwise. Tests bind from the shipped file themselves
(`vitest.setup.ts`), which is the one honest direct read.

## Parameters

### source

[`AuditEventsSource`](../type-aliases/AuditEventsSource.md) \| `null`

## Returns

`void`
