[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / PRIVATE\_PAGE\_NAME\_PREFIX

# Variable: PRIVATE\_PAGE\_NAME\_PREFIX

> `const` __PRIVATE\_PAGE\_NAME\_PREFIX__: `"vaults/"` = `'vaults/'`

Defined in: src/utils/privateStorePath.ts:252

A private page's name (#1456, operator 2026-09-22): `vaults/{owner}/{store}/{title}` —
the same string as its URL without the leading slash. Wherever the system
passes a page name, a private page is named this way; a plain title always
means a public page. Titles never contain `/` (#1455), so the parts are
unambiguous. Was `private/` until #1506.
