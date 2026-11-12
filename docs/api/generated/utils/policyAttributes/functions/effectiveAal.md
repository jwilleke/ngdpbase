[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/policyAttributes](../README.md) / effectiveAal

# Function: effectiveAal()

> __effectiveAal__(`subject`): [`SubjectAal`](../type-aliases/SubjectAal.md) \| `undefined`

Defined in: src/utils/policyAttributes.ts:239

The subject's `subject:aal`, or `undefined` when it has none (#2261).

- Not signed in, or a share visitor: none.
- An agent token: the level stored with the token. A token made before this
  stored one has none.
- A background job: the level stored with the job's request. A job with
  none (a schedule, boot, a request from before this) has none.
- A bearer JWT that records no level (Authentik): none. It is not a session
  from before sign-ins were recorded, so the AAL 1 rule below does not apply.
- A session: its sign-in record's level; a session from before sign-ins
  were recorded (#1523) is AAL 1, as `AuthManager` treats it.

Capped at `aalCap`, as a role is. Reads the record; it never works the level
out from factors.

## Parameters

### subject

[`AalFacts`](../interfaces/AalFacts.md) \| `null` \| `undefined`

## Returns

[`SubjectAal`](../type-aliases/SubjectAal.md) \| `undefined`
