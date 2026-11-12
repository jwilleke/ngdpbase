[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/runAsUser](../README.md) / HandOver

# Interface: HandOver

Defined in: src/utils/runAsUser.ts:65

What one walk of the data folder did (#1695).

## Properties

### changed

> __changed__: `number`

Defined in: src/utils/runAsUser.ts:67

Entries whose owner was changed to uid:gid.

***

### failed

> __failed__: `object`[]

Defined in: src/utils/runAsUser.ts:69

Entries that could not be changed, with why: a read-only mount, an owner-mapping filesystem.

#### code

> __code__: `string`

#### path

> __path__: `string`
