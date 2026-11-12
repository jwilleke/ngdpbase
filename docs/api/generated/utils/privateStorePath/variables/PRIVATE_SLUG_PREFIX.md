[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / PRIVATE\_SLUG\_PREFIX

# Variable: PRIVATE\_SLUG\_PREFIX

> `const` __PRIVATE\_SLUG\_PREFIX__: `"vaults--"` = `'vaults--'`

Defined in: src/utils/privateStorePath.ts:271

The reserved start of a private page's slug: `vaults--{owner}-{vault}-{title}`.
No public slug contains `--`, so the two can never collide. Was `private--`
until #1507 (operator, 2026-09-29), for the same reason the page name moved
from `private/` to `vaults/` in #1506.
