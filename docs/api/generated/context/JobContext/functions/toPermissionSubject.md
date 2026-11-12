[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / toPermissionSubject

# Function: toPermissionSubject()

> __toPermissionSubject__(`ctx`): [`JobSubject`](../../../managers/UserManager/interfaces/JobSubject.md)

Defined in: src/context/JobContext.ts:272

The subject for a permission check made *by* this job.

`roles` is deliberately absent for EVERY origin, and the PDP (`permits`)
resolves them from the username at decision time — which is what makes the
answer current rather than a replay of enqueue time. For a request-origin
job that is the requester's current roles. For a boot or schedule job the
username is the system principal named in `.env` (#631), and it resolves to
the roles `ngdpbase.system.roles` declares for it — `admin` by default —
through the same policy door as everyone else (P2). No roles ride along in
the context, so there is nothing here for a caller to widen.

`viaToken` IS carried, so a job triggered through a delegated token is still
held to that token's scopes.

## Parameters

### ctx

[`JobContext`](../interfaces/JobContext.md)

## Returns

[`JobSubject`](../../../managers/UserManager/interfaces/JobSubject.md)
