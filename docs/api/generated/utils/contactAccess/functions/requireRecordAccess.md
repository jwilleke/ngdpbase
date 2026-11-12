[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/contactAccess](../README.md) / requireRecordAccess

# Function: requireRecordAccess()

> __requireRecordAccess__(`engine`, `ctx`, `kind`, `record?`): `Promise`\<`void`\>

Defined in: src/utils/contactAccess.ts:94

A lookup or change of one record at a contacts door (#2018). Throws
[ContactRefusedError](../classes/ContactRefusedError.md) unless `ctx` may:

- read it as core's own work ([isSystemWork](isSystemWork.md)): allowed, not evaluated;
- read or change its own identity record (the context's username is the
  record's `identifier`): `profile-manage`, which every user holds;
- read or change any other record: `identity-read` / `identity-manage`.

`record` is the identity record (or what names it, `{ identifier }`); left
out for a record that is never anyone's own (an organization, a role).
"Own" is decided by comparing usernames, never by a role.

## Parameters

### engine

`EngineLike`

### ctx

[`ActorContext`](../../../context/ActorContext/type-aliases/ActorContext.md)

### kind

`"manage"` \| `"read"`

### record?

\{ `identifier?`: `unknown`; \} \| `null`

## Returns

`Promise`\<`void`\>
