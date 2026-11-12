[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Share](../README.md) / ShareResource

# Interface: ShareResource

Defined in: src/types/Share.ts:51

What a share delegates, in the policy resource shape (#1221, epic #1225).
A share is a delegation by the user who issues it: `actions` it may perform
and `resources` it may perform them on, never more than the issuer held at
the time. #1222 evaluates them; this is the record.

## Properties

### pattern

> __pattern__: `string`

Defined in: src/types/Share.ts:55

Match pattern. `keyword:<name>` means "everything carrying this keyword".

***

### type

> __type__: `string`

Defined in: src/types/Share.ts:53

Resource type the evaluator knows: `page`, `media`, …
