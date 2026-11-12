[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [context/JobContext](../README.md) / withoutKeyHandle

# Function: withoutKeyHandle()

> __withoutKeyHandle__(`ctx`): [`JobContext`](../interfaces/JobContext.md)

Defined in: src/context/JobContext.ts:183

A job context with no key handle in it (#2047). `jobContextFromRequest`
already leaves the handle out; the job manager also passes every context it
stores through this, so a context built by hand cannot carry a key copy's
handle into a job or onto disk.

## Parameters

### ctx

[`JobContext`](../interfaces/JobContext.md)

## Returns

[`JobContext`](../interfaces/JobContext.md)
