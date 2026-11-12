[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/LoginThrottle](../README.md) / LoginThrottleOptions

# Interface: LoginThrottleOptions

Defined in: src/utils/LoginThrottle.ts:41

LoginThrottle — failure-driven backoff for credential endpoints (#1044).

Password login accepted unlimited attempts: no rate limit, no lockout, no
backoff. `admin` is a known username on every instance, so an attacker could
guess as fast as the server would answer, indefinitely. Magic-link requests
and the contact form both throttled themselves; the one path that checks a
password did not.

## Why not reuse SimpleRateLimiter

That limiter counts *every* event in a fixed window, which is right for
"at most N contact submissions an hour". Login needs different semantics:

- only FAILURES count — a busy legitimate user must never be throttled
- a success CLEARS the record, so a fat-fingered password costs nothing
- repeated lockouts back off further, so a patient attacker gets slower
    while an ordinary typo-then-correct user notices nothing

## Backoff, never a permanent lock

A permanent lock on a known username is a denial-of-service vector against
the operator: anyone could lock `admin` out of their own instance by typing
a wrong password often enough. Every lock here expires on its own, and the
doubling is capped.

Consecutive lockouts double the wait — 1, 2, 4, 8 minutes and so on to the
cap. The counter of consecutive lockouts is reset by a single success, so
the escalation only affects someone who keeps failing.

## Scope

In-memory and per-process, like SimpleRateLimiter. Across replicas each pod
counts separately, which weakens but does not defeat it. A shared store is
the upgrade path if this ever runs multi-replica; not worth a dependency at
the current scale. Kept in memory by decision (#1767, operator 2026-10-11);
the startup warning `throttlePerCopyWarning` says so when the process can
tell it is one of several copies.

## Properties

### baseLockMs

> __baseLockMs__: `number`

Defined in: src/utils/LoginThrottle.ts:47

Lock duration for a first lockout, in milliseconds. Doubles each time.

***

### maxAttempts

> __maxAttempts__: `number`

Defined in: src/utils/LoginThrottle.ts:43

Failures allowed within the window before the key is locked.

***

### maxLockMs

> __maxLockMs__: `number`

Defined in: src/utils/LoginThrottle.ts:49

Ceiling for the doubling, in milliseconds.

***

### windowMs

> __windowMs__: `number`

Defined in: src/utils/LoginThrottle.ts:45

How long failures are remembered, in milliseconds.
