[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [providers/BaseAuditProvider](../README.md) / PersonEntriesOptions

# Interface: PersonEntriesOptions

Defined in: src/providers/BaseAuditProvider.ts:110

Paging for the entries about one person (#1537): the newest first.

## Properties

### limit?

> `optional` __limit?__: `number`

Defined in: src/providers/BaseAuditProvider.ts:111

***

### offset?

> `optional` __offset?__: `number`

Defined in: src/providers/BaseAuditProvider.ts:112

***

### ownerId?

> `optional` __ownerId?__: `string`

Defined in: src/providers/BaseAuditProvider.ts:118

The user's identity `@id` (#2041). From that release on a row names the
owner of its resource by `@id` in `metadata.owner`; rows written before
name the owner's username. A row is about the user under either.
