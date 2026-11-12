[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/Person](../README.md) / PersonAffiliation

# Interface: PersonAffiliation

Defined in: src/types/Person.ts:34

One affiliation of a digital identity (#2039): schema.org `affiliation`
with an `OrganizationRole`, as the identity model says
(`docs/planning/identity-model.md`, "Affiliation shape"). It puts the
identity in a group, the organization plus the title, and never grants a
permission.

The organization is named by its `@id`; OrganizationManager lists an
organization's people by reading these, so the link is stored once, here.
With the site's own organization it is a fact, set only under
`identity-manage`; with any other it is a claim, which a user may also set
on their own identity record. IdentityManager's door decides.

## Properties

### @type

> __@type__: `"OrganizationRole"`

Defined in: src/types/Person.ts:35

***

### endDate?

> `optional` __endDate?__: `string`

Defined in: src/types/Person.ts:43

ISO date (`YYYY-MM-DD`) it ended or ends, the day included; left out while it is ongoing.

***

### memberOf

> __memberOf__: `object`

Defined in: src/types/Person.ts:37

The organization, by its `@id`.

#### @id

> __@id__: `string`

***

### roleName?

> `optional` __roleName?__: `string`

Defined in: src/types/Person.ts:39

The affiliation's title there (Owner, Treasurer, Vendor): free text, never a Role. Left out when none is known.

***

### startDate?

> `optional` __startDate?__: `string`

Defined in: src/types/Person.ts:41

ISO date (`YYYY-MM-DD`) the affiliation began; left out when not known.
