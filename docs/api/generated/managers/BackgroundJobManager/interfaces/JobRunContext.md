[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackgroundJobManager](../README.md) / JobRunContext

# Interface: JobRunContext

Defined in: src/managers/BackgroundJobManager.ts:89

What a run is handed besides progress (#1715): who asked, as [JobContext](../../../context/JobContext/interfaces/JobContext.md)
— which stays flat and serialisable, so it is extended rather than changed —
and what only a running job needs.

## Extends

- [`JobContext`](../../../context/JobContext/interfaces/JobContext.md)

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

#### Inherited from

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md).[`aal`](../../../context/JobContext/interfaces/JobContext.md#aal)

***

### ipAddress?

> `optional` __ipAddress?__: `string`

Defined in: src/context/JobContext.ts:73

The address the requesting call came from (#1179), when there was one. Provenance for the record.

#### Inherited from

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md).[`ipAddress`](../../../context/JobContext/interfaces/JobContext.md#ipaddress)

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

#### Inherited from

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md).[`job`](../../../context/JobContext/interfaces/JobContext.md#job)

***

### origin

> __origin__: [`JobOrigin`](../../../context/JobContext/type-aliases/JobOrigin.md)

Defined in: src/context/JobContext.ts:56

From what context the work was requested.

#### Inherited from

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md).[`origin`](../../../context/JobContext/interfaces/JobContext.md#origin)

***

### reason?

> `optional` __reason?__: `string`

Defined in: src/context/JobContext.ts:86

Why, for origins with no person to ask. Free text, for the audit record.

#### Inherited from

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md).[`reason`](../../../context/JobContext/interfaces/JobContext.md#reason)

***

### requestedAt

> __requestedAt__: `string`

Defined in: src/context/JobContext.ts:84

ISO 8601. When the work was requested, not when it ran.

#### Inherited from

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md).[`requestedAt`](../../../context/JobContext/interfaces/JobContext.md#requestedat)

***

### resume

> __resume__: \{ `attempt`: `number`; `checkpoint`: `unknown`; `reason`: `string`; \} \| `null`

Defined in: src/managers/BackgroundJobManager.ts:99

Set when this run picks up a slot an earlier attempt did not finish
(#1716): which attempt this is, the last checkpoint that attempt saved
(null if none), and why it ended. Null on a first attempt.

***

### signal

> __signal__: `AbortSignal`

Defined in: src/managers/BackgroundJobManager.ts:91

Aborted when the run times out. A long job checks it and stops.

***

### slot

> __slot__: `string` \| `null`

Defined in: src/managers/BackgroundJobManager.ts:93

The slot this run is for (ISO instant); null for a run nobody scheduled.

***

### username

> __username__: `string`

Defined in: src/context/JobContext.ts:54

Who asked. The system principal for the origins where the server acts for itself.

#### Inherited from

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md).[`username`](../../../context/JobContext/interfaces/JobContext.md#username)

***

### viaProxy?

> `optional` __viaProxy?__: [`ProxyClaim`](../../UserManager/interfaces/ProxyClaim.md)

Defined in: src/context/JobContext.ts:71

The proxy grant the requesting call acted under, when it did (#1762). Carried for the same reason: a job never runs as the represented user unbounded.
Never with its `keyHandle` (#2047): a job carries no key of any kind, so it reaches no key copy and none is written to a run record ([withoutKeyHandle](../../../context/JobContext/functions/withoutKeyHandle.md)).

#### Inherited from

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md).[`viaProxy`](../../../context/JobContext/interfaces/JobContext.md#viaproxy)

***

### viaShare?

> `optional` __viaShare?__: [`ShareGrant`](../../../types/Share/interfaces/ShareGrant.md)

Defined in: src/context/JobContext.ts:66

The share the requesting call presented, when it did (#1222). Carried for the same reason.

#### Inherited from

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md).[`viaShare`](../../../context/JobContext/interfaces/JobContext.md#viashare)

***

### viaToken?

> `optional` __viaToken?__: [`AgentTokenGrant`](../../UserManager/interfaces/AgentTokenGrant.md)

Defined in: src/context/JobContext.ts:64

The agent token the requesting call arrived with, when it did.

Carried so a job cannot outrun the ceiling that capped the request. Whether
a token-triggered job may run at all is #1173's decision — this makes the
question answerable rather than invisible.

#### Inherited from

[`JobContext`](../../../context/JobContext/interfaces/JobContext.md).[`viaToken`](../../../context/JobContext/interfaces/JobContext.md#viatoken)

## Methods

### checkpoint()

> __checkpoint__(`data`): `void`

Defined in: src/managers/BackgroundJobManager.ts:107

Save a bookmark the next attempt receives as `resume.checkpoint`, e.g.
`{ doneThrough: 311 }`. JSON only; larger than
`ngdpbase.jobs.max-checkpoint-bytes` throws. Written at most once every
5 s, the latest winning; deleted when the run succeeds, kept when it fails.
Kept only for a persisted scheduled job; elsewhere it is checked and dropped.

#### Parameters

##### data

`unknown`

#### Returns

`void`
