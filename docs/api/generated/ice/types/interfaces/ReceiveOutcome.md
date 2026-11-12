[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / ReceiveOutcome

# Interface: ReceiveOutcome

Defined in: src/ice/types.ts:335

A receiver's answer for one item. `refused` is its existing permission saying no (D5).

## Properties

### heldAs?

> `optional` __heldAs?__: `string`

Defined in: src/ice/types.ts:346

The name the thing goes by on the site, when it differs from the name
the user gave (#2130): a `duplicate` the receiver already held under
another name. The engine says so on the file's status, and records it
so the same bytes uploaded again are told the same.

***

### message?

> `optional` __message?__: `string`

Defined in: src/ice/types.ts:339

***

### ref?

> `optional` __ref?__: `string`

Defined in: src/ice/types.ts:338

Where it went: a page name, an attachment id, a record id.

***

### status

> __status__: `"refused"` \| `"stored"` \| `"duplicate"`

Defined in: src/ice/types.ts:336
