[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / JobContext

# Interface: JobContext

Defined in: src/context/JobContext.ts:52

The identity a background job runs under. Flat, and serialisable by construction.

## Extended by

- [`JobRunContext`](../../../managers/BackgroundJobManager/interfaces/JobRunContext.md)

## Properties

### aal?

> `optional` __aal?__: `1` \| `2` \| `3`

Defined in: src/context/JobContext.ts:82

The assurance level (1 to 3) of the requester's session when the work was
requested (#2261), which is the job's `subject:aal` whenever it runs. Taken
from the requester's own session or token, never from an argument, so it
cannot exceed it. Absent for work no session asked for (boot, a schedule,
the command line) and for a job requested before it was stored: its
`subject:aal` is missing and a condition on it fails closed.

***

### ipAddress?

> `optional` __ipAddress?__: `string`

Defined in: src/context/JobContext.ts:73

The address the requesting call came from (#1179), when there was one. Provenance for the record.

***

### job?

> `optional` __job?__: `string`

Defined in: src/context/JobContext.ts:95

The scheduled job this run acts as (#1999): its id. Set by
BackgroundJobManager on a scheduled slot's context, never on a run
started by hand. When a policy names the job (`{ "type": "job", "value":
"<id>" }`), its decisions are made as `job:<id>`, holding only what such
policies grant; when none does, as the system principal, as before. Only
the system principal's context can act as a job.

***

### origin

> __origin__: [`JobOrigin`](../type-aliases/JobOrigin.md)

Defined in: src/context/JobContext.ts:56

From what context the work was requested.

***

### reason?

> `optional` __reason?__: `string`

Defined in: src/context/JobContext.ts:86

Why, for origins with no person to ask. Free text, for the audit record.

***

### requestedAt

> __requestedAt__: `string`

Defined in: src/context/JobContext.ts:84

ISO 8601. When the work was requested, not when it ran.

***

### username

> __username__: `string`

Defined in: src/context/JobContext.ts:54

Who asked. The system principal for the origins where the server acts for itself.

***

### viaProxy?

> `optional` __viaProxy?__: [`ProxyClaim`](../../../managers/UserManager/interfaces/ProxyClaim.md)

Defined in: src/context/JobContext.ts:71

The proxy grant the requesting call acted under, when it did (#1762). Carried for the same reason: a job never runs as the represented user unbounded.
Never with its `keyHandle` (#2047): a job carries no key of any kind, so it reaches no key copy and none is written to a run record ([withoutKeyHandle](../functions/withoutKeyHandle.md)).

***

### viaShare?

> `optional` __viaShare?__: [`ShareGrant`](../../../types/Share/interfaces/ShareGrant.md)

Defined in: src/context/JobContext.ts:66

The share the requesting call presented, when it did (#1222). Carried for the same reason.

***

### viaToken?

> `optional` __viaToken?__: [`AgentTokenGrant`](../../../managers/UserManager/interfaces/AgentTokenGrant.md)

Defined in: src/context/JobContext.ts:64

The agent token the requesting call arrived with, when it did.

Carried so a job cannot outrun the ceiling that capped the request. Whether
a token-triggered job may run at all is #1173's decision — this makes the
question answerable rather than invisible.
