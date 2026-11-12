[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseProvider](../README.md) / ProviderDurability

# Interface: ProviderDurability

Defined in: src/providers/BaseProvider.ts:43

## Properties

### bufferedForMs

> __bufferedForMs__: `number`

Defined in: src/providers/BaseProvider.ts:45

Milliseconds a record may sit in memory before being written. 0 = never buffered.

***

### bufferedRecords

> __bufferedRecords__: `number`

Defined in: src/providers/BaseProvider.ts:47

Records held before an early write is forced. 0 = no bound.

***

### fsync

> __fsync__: `boolean`

Defined in: src/providers/BaseProvider.ts:49

Whether EVERY write is flushed to the device before being reported as stored.

***

### fsyncedClasses?

> `optional` __fsyncedClasses?__: readonly `string`[]

Defined in: src/providers/BaseProvider.ts:61

Classes of write that ARE unbuffered and fsynced even when `fsync` is
false, named in the provider's own vocabulary — for auditing, the tier
(#1158).

A partial guarantee needs somewhere to be stated, or it rounds to a claim
that is wrong in one direction or the other: `fsync: true` would promise
durability for buffered `standard` events that do not have it, and a bare
`fsync: false` hides a guarantee the critical path genuinely provides.
Absent when the whole answer is `fsync`.
