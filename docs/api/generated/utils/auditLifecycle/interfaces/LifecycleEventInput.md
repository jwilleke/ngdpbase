[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/auditLifecycle](../README.md) / LifecycleEventInput

# Interface: LifecycleEventInput

Defined in: src/utils/auditLifecycle.ts:72

## Properties

### phase

> __phase__: `"start"` \| `"shutdown"`

Defined in: src/utils/auditLifecycle.ts:75

***

### pid

> __pid__: `number`

Defined in: src/utils/auditLifecycle.ts:78

***

### previousRun?

> `optional` __previousRun?__: [`PreviousRun`](../type-aliases/PreviousRun.md)

Defined in: src/utils/auditLifecycle.ts:80

Required on a start, meaningless on a shutdown.

***

### principal?

> `optional` __principal?__: `string`

Defined in: src/utils/auditLifecycle.ts:74

The system principal (#631). Falls back to the literal only where no UserManager answers.

***

### scheme?

> `optional` __scheme?__: `"http"` \| `"https"`

Defined in: src/utils/auditLifecycle.ts:87

The transport the instance actually bound (#1153).

"This instance is serving HTTP" is a security fact, and the log had no
record of it — only the version and pid.

***

### version

> __version__: `string`

Defined in: src/utils/auditLifecycle.ts:77

The running version, so a restart is distinguishable from an upgrade.
