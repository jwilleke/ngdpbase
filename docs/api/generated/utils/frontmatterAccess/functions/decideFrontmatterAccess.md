[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/frontmatterAccess](../README.md) / decideFrontmatterAccess

# Function: decideFrontmatterAccess()

> __decideFrontmatterAccess__(`metadata`, `viewerPrincipals`, `action`, `enabledAddons?`, `isAdmin?`): [`FrontmatterDecision`](../interfaces/FrontmatterDecision.md)

Defined in: src/utils/frontmatterAccess.ts:142

Decide Tier 1 for a viewer described as a flat principal list — their roles
plus their username. Callers holding a `UserContext` should pass
`[...roles, username]`; the provider layer already works in these terms.

`audience` applies to every action (#1964, operator 2026-10-23). Someone it
leaves out may neither read nor edit the page: every action is refused. The
one exception is an administrator — a viewer holding `admin-system`, which
the caller decides and passes as `isAdmin` (this module never reads a role
for it). For `view`, a viewer the audience admits is allowed; for any other
action it only lets them through to policy. A page's `access` field is not
read (#2255).

An `addon:<slug>` entry matches only when `<slug>` is in `enabledAddons`,
the viewer's enabled per-person add-ons (#1964); a caller that does not
supply them matches no such entry, so it can under-list but never leak.

Denies when the page states a rule and nothing matches. That default is the
point: a listing that treats "no match" as "show it" is the bug this exists
to prevent.

## Parameters

### metadata

[`AccessMetadataLike`](../interfaces/AccessMetadataLike.md) \| `null` \| `undefined`

### viewerPrincipals

readonly `string`[]

### action

`string`

### enabledAddons?

readonly `string`[] = `[]`

### isAdmin?

`boolean` = `false`

## Returns

[`FrontmatterDecision`](../interfaces/FrontmatterDecision.md)
