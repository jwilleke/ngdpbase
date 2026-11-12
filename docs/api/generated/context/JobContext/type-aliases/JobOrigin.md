[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / JobOrigin

# Type Alias: JobOrigin

> __JobOrigin__ = `"request"` \| `"schedule"` \| `"boot"` \| `"operator"`

Defined in: src/context/JobContext.ts:49

Where the work came from.

Every origin is a caller; none of them is "a person" as far as this type is
concerned. `request` acts for an identity the session authenticated — which
may itself be an agent token acting under a delegation. The rest are the
server acting for itself, and they are named for that reason rather than
defaulting to anonymous: `schedule` and `boot` run as the system principal
(#631, env-owned identity, authority resolved through policy like any other
caller), and `operator` is a command line.
