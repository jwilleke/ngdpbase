[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/startupState](../README.md) / STARTUP\_BYPASS\_PATHS

# Variable: STARTUP\_BYPASS\_PATHS

> `const` __STARTUP\_BYPASS\_PATHS__: readonly \[`"/css"`, `"/js"`, `"/images"`, `"/themes"`, `"/addons"`\]

Defined in: src/utils/startupState.ts:25

Paths served in every state, so the maintenance page can render itself.

Assets only. Adding a route here would open it during `starting` too, when
the managers behind it are not up.
