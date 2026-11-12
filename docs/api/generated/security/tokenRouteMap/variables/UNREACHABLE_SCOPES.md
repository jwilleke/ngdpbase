[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [security/tokenRouteMap](../README.md) / UNREACHABLE\_SCOPES

# Variable: UNREACHABLE\_SCOPES

> `const` __UNREACHABLE\_SCOPES__: `Record`\<`string`, `string`\>

Defined in: src/security/tokenRouteMap.ts:137

Mintable scopes with NO token-reachable route, and why (#1182).

The first version of this map held three entries chosen from recall, and
refused `page-delete` and `page-rename` — both mintable, both built for
tokens by #946. A token minted with `page-delete` could not delete anything.

The map being minimal was not the defect. The defect was that "minimal" was
never checked against what the system actually issues: `AgentTokenManager`
mints any scope that is not `admin-*`, so every one of those is a capability
the operator was offered. A scope that is grantable and unreachable is a
promise the product does not keep, and it should be a stated decision rather
than an omission nobody notices.

`scopeCoverage()` asserts every mintable scope appears in one list or the
other, so adding a permission without deciding this fails the build.

These are listed as unreachable pending a decision, not as forbidden. There
is no evidence any of them was ever token-reachable, and widening the token
surface is not something to do while fixing a regression.
