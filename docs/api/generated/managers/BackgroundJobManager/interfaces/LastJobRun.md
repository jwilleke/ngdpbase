[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/BackgroundJobManager](../README.md) / LastJobRun

# Interface: LastJobRun

Defined in: src/managers/BackgroundJobManager.ts:157

A run that ended, as the /admin dashboard shows it (#2138).

## Properties

### completedAt

> __completedAt__: `string`

Defined in: src/managers/BackgroundJobManager.ts:159

***

### ranBy

> __ranBy__: `string` \| `null`

Defined in: src/managers/BackgroundJobManager.ts:162

The username who asked; null for a run its schedule started.

***

### startedAt

> __startedAt__: `string`

Defined in: src/managers/BackgroundJobManager.ts:158

***

### status

> __status__: `"failed"` \| `"completed"`

Defined in: src/managers/BackgroundJobManager.ts:160
