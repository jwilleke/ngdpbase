[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / IceKind

# Type Alias: IceKind

> __IceKind__ = `string`

Defined in: src/ice/types.ts:39

The kind of a piece of content moving through the engine. `file` is raw
input bytes; `html` and `ncm` are core's; `record` is one structured entry
of a table or feed (`data` is `{ id, properties }`, [IceRecordData](../interfaces/IceRecordData.md)),
so a format shim such as CSV serves any receiver that takes records (#2109);
an add-on's own kinds are named `<slug>.<kind>`, e.g. `phr.health-record`.
