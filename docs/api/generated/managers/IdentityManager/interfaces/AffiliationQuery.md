[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [managers/IdentityManager](../README.md) / AffiliationQuery

# Interface: AffiliationQuery

Defined in: src/managers/IdentityManager.ts:39

What `search(ctx, { affiliation })` looks for (#2039).

## Properties

### current?

> `optional` __current?__: `boolean`

Defined in: src/managers/IdentityManager.ts:45

True (the default): only affiliations held today, the first and last day included. False: any, past or future too.

***

### memberOf

> __memberOf__: `string` \| \{ `@id`: `string`; \}

Defined in: src/managers/IdentityManager.ts:41

The organization, by its `@id` (or `{ '@id' }`).

***

### title?

> `optional` __title?__: `string`

Defined in: src/managers/IdentityManager.ts:43

The title, compared without case or surrounding spaces. Left out: any title, or none.
