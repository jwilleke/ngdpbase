[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / LEGACY\_PRIVATE\_ROOT

# Variable: LEGACY\_PRIVATE\_ROOT

> `const` __LEGACY\_PRIVATE\_ROOT__: `"private"` = `'private'`

Defined in: src/utils/privateStorePath.ts:263

The vault parent folder, page-name prefix and URL segment before #1506
(operator, 2026-09-28): `pages/private/`, `private/{owner}/{store}/{title}`,
`/private/…`. Read only by the one-time move to `vaults` and by the things
that must never mistake a leftover `private/` folder for public pages.
