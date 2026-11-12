[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / jobContextFromSystem

# Function: jobContextFromSystem()

> __jobContextFromSystem__(`systemPrincipal`, `reason`, `now?`): [`JobContext`](../interfaces/JobContext.md)

Defined in: src/context/JobContext.ts:231

A job with no person behind it — boot, a schedule, a retention pass.

`systemPrincipal` is the name configured in `.env` as `NGDPBASE_SYSTEM_USER`
(#631), read through `PolicyInformationPoint.systemPrincipalName()`. It is a mandatory
positional argument rather than a constant here because this module is flat
and engine-free by design, and a hardcoded `'System'` would be a second
source of truth for a value the environment owns — one that silently names
nobody the moment an operator picks a different name.

`reason` is required rather than optional. An ownerless action that cannot
say why it happened is the thing an assessor asks about, and a default would
be filled in by nobody. This is the constructor #1173 needs in order to
delete the `hasPermission` string overload: once it exists, every caller has
a context to pass, including code that runs with no request at all.

## Parameters

### systemPrincipal

`string`

### reason

`string`

### now?

`Date` = `...`

## Returns

[`JobContext`](../interfaces/JobContext.md)
