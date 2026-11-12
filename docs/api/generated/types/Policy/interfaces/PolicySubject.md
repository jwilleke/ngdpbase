[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Policy](../README.md) / PolicySubject

# Interface: PolicySubject

Defined in: src/types/Policy.ts:19

Who a policy grants to. The evaluator matches `role`, `job` (#1999), `authenticated` and `anyone` (#2261), its `SUBJECT_MATCHERS`.

## Properties

### type

> __type__: `string`

Defined in: src/types/Policy.ts:21

`role`, `job` for a scheduled job acting as itself (#1999), or `authenticated` / `anyone` (#2261).

***

### value?

> `optional` __value?__: `string`

Defined in: src/types/Policy.ts:23

The role or the job id. `authenticated` and `anyone` take none.
