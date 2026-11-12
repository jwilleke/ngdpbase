[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/permissionCatalog](../README.md) / SIGN\_IN\_SCOPE\_LABELS

# Variable: SIGN\_IN\_SCOPE\_LABELS

> `const` __SIGN\_IN\_SCOPE\_LABELS__: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: src/utils/permissionCatalog.ts:84

What the standard OpenID Connect sign-in scopes let an app see, in plain
words (#1572). They are not permissions, so they are not in the catalog;
this is their one declaration — the consent page and the "My tokens and
devices" list both read it through `describeScopes`.
