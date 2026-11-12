[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/PolicyInformationPoint](../README.md) / PageAttributes

# Interface: PageAttributes

Defined in: src/security/PolicyInformationPoint.ts:157

What the policies may read about a page (#2255), resolved by the PIP from
the page itself. `attributes` holds what a resource type matches on
(`system-category`), read eagerly; `read` answers a condition's
`resource:<name>` for an attribute declared on the `page` resource type,
lazily, so a lookup (the owner's account) is made only when a policy needs
it. `undefined` is a missing attribute.

## Properties

### attributes

> __attributes__: `Record`\<`string`, `unknown`\>

Defined in: src/security/PolicyInformationPoint.ts:158

## Methods

### read()

> __read__(`name`): `unknown`

Defined in: src/security/PolicyInformationPoint.ts:159

#### Parameters

##### name

`string`

#### Returns

`unknown`
