[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/username](../README.md) / RESERVED\_USERNAMES

# Variable: RESERVED\_USERNAMES

> `const` __RESERVED\_USERNAMES__: readonly `string`[]

Defined in: src/utils/username.ts:65

Names no person may register.

`anonymous` is the principal for "nobody authenticated" — a real account
holding that name would collide with it wherever the name is compared.
`asserted` was the subject removed in #1435; it is reserved so the name
cannot be taken in the window before anyone reconsiders the concept.
`shared-folders` owns the organization's shared folders (#2125): an account
by that name would be the owner of every folder by the vault owner rule.

The system principal is NOT listed here: its name comes from `.env` and is
checked separately by `isSystemPrincipal`, because an operator chooses it.
