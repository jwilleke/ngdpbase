[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/proxyClaim](../README.md) / ProxyAttribution

# Interface: ProxyAttribution

Defined in: src/utils/proxyClaim.ts:63

What a proxy claim adds to an audit record (#1762 slice 3), declared once.

Operator decision: a row for something done under a proxy grant names the
represented person in `user` — the account acted on, as with agent tokens —
and the person who actually did it in a separate top-level `actor`, which
the audit search filters on. The grant's id goes in the metadata so the row
joins to the `proxy-grant` record that allowed it. A row with no proxy claim
gets neither: `actor` is absent, never a copy of `user`.

Every builder of an audit row's "who" reads this — `actorOf` for a request
subject, `attributedTo` for a job, `PolicyInformationPoint.auditDenial` for a
subject that may be anonymous, and the content builders in `auditEvents.ts`.

## Properties

### actor?

> `optional` __actor?__: `string`

Defined in: src/utils/proxyClaim.ts:65

The person who acted; present only under a proxy claim.

***

### metadata

> __metadata__: `Record`\<`string`, `unknown`\>

Defined in: src/utils/proxyClaim.ts:67

`delegated` (the claim's kind) and `proxyGrantId`; empty without a claim.
