[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Policy](../README.md) / Decision

# Interface: Decision

Defined in: src/types/Policy.ts:170

What the PDP answers.

`reason` is for the log and the audit record. A PEP enforces `permit` and
chooses 401 vs 403 from whether the caller is authenticated — it must not
branch on the reason, or the reason becomes an interface. The one exception
is [STEP\_UP\_REASON](../variables/STEP_UP_REASON.md), read only by `ApiContext.enforceDeny` (#1431): the one
refusal that offers a way forward (a fresh sign-in).

## Properties

### applicable

> __applicable__: `boolean`

Defined in: src/types/Policy.ts:184

Whether any policy spoke to this question at all.

XACML's NotApplicable. Both outcomes refuse when `permit` is false, but
they are different facts: a policy that said no is `policy_deny`, while
no policy speaking is `default_deny`, and the audit trail must tell an
assessor which one happened. Kept three-state for that, even though the
page door no longer has a tier below this one to fall through to — the
page-ACL markup tier it once fed was removed in #1431 step 7a.

`permit` is always false when this is false — nothing has said yes.

***

### conditionNotMet?

> `optional` __conditionNotMet?__: `string`[]

Defined in: src/types/Policy.ts:197

The ids of allow policies that matched subject, resource and action but
whose condition was false or unknown (#2288), so a refusal can say which
allow was not met. Ids only, never attribute values. Absent when none.

***

### permit

> __permit__: `boolean`

Defined in: src/types/Policy.ts:171

***

### policyIds

> __policyIds__: `string`[]

Defined in: src/types/Policy.ts:191

The ids of the policies that decided (#2255): the denies that matched,
or, when none did, the allows that matched. Empty when no policy matched
or something other than policy decided (a ceiling, step-up).

***

### reason

> __reason__: `string`

Defined in: src/types/Policy.ts:185
